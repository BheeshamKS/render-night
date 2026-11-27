#!/usr/bin/env bash
# Runs inside the clean container. Installs the packaged artifact, starts a bare
# X session, and verifies the packaged application the way a user would.
#
# Usage: in-container.sh <deb|appimage> <minimal|full>
set -euo pipefail

KIND="${1:?usage: in-container.sh <deb|appimage> <minimal|full>}"
MODE="${2:-minimal}"
OUT="/out"
mkdir -p "${OUT}"

log() { printf '\n=== %s ===\n' "$*"; }

log "container: $(. /etc/os-release && echo "${PRETTY_NAME}")"
dpkg --print-architecture

case "${KIND}" in
    deb)
        DEB_PATH="$(ls /dist/*.deb | head -1)"
        [ -n "${DEB_PATH}" ] || { echo "no .deb in /dist" >&2; exit 1; }
        log "installing ${DEB_PATH} (${MODE})"
        if [ "${MODE}" = "minimal" ]; then
            apt-get update
            apt-get install -y --no-install-recommends "${DEB_PATH}" 2>&1 | tee "${OUT}/install.log"
        else
            apt-get update
            apt-get install -y "${DEB_PATH}" 2>&1 | tee "${OUT}/install.log"
        fi
        RN_CLI="render-night"
        RN_GUI="render-night-gui"
        ;;
    appimage)
        APPIMAGE_PATH="$(ls /dist/*.AppImage | head -1)"
        [ -n "${APPIMAGE_PATH}" ] || { echo "no AppImage in /dist" >&2; exit 1; }
        log "preparing ${APPIMAGE_PATH}"
        install -m 755 "${APPIMAGE_PATH}" /opt/render-night.AppImage
        # Extract once for the CLI, which AppRun does not dispatch to.
        (cd /opt && ./render-night.AppImage --appimage-extract >/dev/null)
        # Run the extracted binaries with the environment AppRun provides for
        # every child process, so bundled libraries are found.
        RN_CLI="env LD_LIBRARY_PATH=/opt/squashfs-root/usr/lib /opt/squashfs-root/usr/bin/render-night"
        RN_GUI="appimage"
        ;;
    *)
        echo "unknown kind: ${KIND}" >&2
        exit 1
        ;;
esac

if [ "${KIND}" = "appimage" ]; then
    launch_gui() { setsid /opt/render-night.AppImage --appimage-extract-and-run "$@" >"${OUT}/gui.log" 2>&1 & echo $!; }
else
    launch_gui() { setsid "${RN_GUI}" "$@" >"${OUT}/gui.log" 2>&1 & echo $!; }
fi

log "version provenance"
# shellcheck disable=SC2086
${RN_CLI} --version | tee "${OUT}/version-cli.txt"
if [ "${KIND}" = "appimage" ]; then
    env LD_LIBRARY_PATH=/opt/squashfs-root/usr/lib /opt/squashfs-root/usr/bin/render-night-gui --version | tee "${OUT}/version-gui.txt"
else
    "${RN_GUI}" --version | tee "${OUT}/version-gui.txt"
fi

log "doctor"
# shellcheck disable=SC2086
${RN_CLI} --doctor 2>&1 | tee "${OUT}/doctor.txt" || {
    echo "doctor exited non-zero" | tee -a "${OUT}/doctor.txt"
    exit 1
}

log "starting X"
Xvfb :99 -screen 0 1600x1000x24 >"${OUT}/xvfb.log" 2>&1 &
XVFB_PID=$!
export DISPLAY=:99
sleep 1
openbox >"${OUT}/openbox.log" 2>&1 &
OB_PID=$!
sleep 1

cleanup() {
    [ -n "${GUI_PID:-}" ] && kill -TERM -- "-${GUI_PID}" 2>/dev/null || true
    kill "${OB_PID}" "${XVFB_PID}" 2>/dev/null || true
}
trap cleanup EXIT

is_white_free() {
    local png="$1" label="$2"
    # Fraction of pure-white pixels. The 55%-white paint bug showed up as a large
    # unpainted region; a handful of antialiased pixels is not the bug.
    local whites
    whites="$(convert "${png}" -fill black +opaque white -format '%[fx:mean]' info:)"
    echo "${label}: pure-white fraction = ${whites}"
    if ! awk -v w="${whites}" 'BEGIN { exit !(w < 0.005) }'; then
        echo "FAIL: ${label} has a large white area (unpainted region)" >&2
        return 1
    fi
}

wait_for_window() {
    for _ in $(seq 1 40); do
        WIN_ID="$(xdotool search --name '^Render Night$' 2>/dev/null | head -1 || true)"
        [ -n "${WIN_ID}" ] && return 0
        sleep 0.5
    done
    return 1
}

log "launching packaged GUI"
GUI_PID="$(launch_gui)"
sleep 2
if ! wait_for_window; then
    echo "FAIL: no window titled 'Render Night' appeared" >&2
    cat "${OUT}/gui.log" >&2 || true
    exit 1
fi
TITLE="$(xdotool getwindowname "${WIN_ID}")"
echo "window title: ${TITLE}" | tee "${OUT}/window.txt"
[ "${TITLE}" = "Render Night" ] || { echo "FAIL: wrong title" >&2; exit 1; }

sleep 2
import -window root "${OUT}/01-launch.png"
is_white_free "${OUT}/01-launch.png" "launch"

log "resizing to 1100x700"
xdotool windowsize "${WIN_ID}" 1100 700
sleep 2
import -window root "${OUT}/02-resized.png"
is_white_free "${OUT}/02-resized.png" "resized"

log "resizing to 1280x800"
xdotool windowsize "${WIN_ID}" 1280 800
sleep 2
import -window root "${OUT}/03-1280x800.png"
is_white_free "${OUT}/03-1280x800.png" "1280x800"

if [ -x /opt/e2e/rn-e2e ]; then
    log "running automation e2e"
    /opt/e2e/rn-e2e --display :99 --screenshots "${OUT}" 2>&1 | tee "${OUT}/e2e.log"
fi

log "PASS: ${KIND} (${MODE}) on $(. /etc/os-release && echo "${VERSION_ID}")"
