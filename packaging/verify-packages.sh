#!/usr/bin/env bash
# Verify the packages built from this checkout: filename version, control metadata,
# embedded binary version + git SHA, payload, and independence from cwd / AppImage mount.
#
# Usage: packaging/verify-packages.sh <render-night_*.deb> <Render-Night-*.AppImage>
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEB="${1:?usage: verify-packages.sh <deb> <appimage>}"
APPIMAGE="${2:?usage: verify-packages.sh <deb> <appimage>}"

VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)"
SHA="$(git rev-parse --short HEAD)"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

fail() {
    echo "verify-packages: FAIL: $*" >&2
    exit 1
}

[ -f "${DEB}" ] || fail "missing deb: ${DEB}"
[ -f "${APPIMAGE}" ] || fail "missing AppImage: ${APPIMAGE}"

echo "verify-packages: version=${VERSION} sha=${SHA}"

# --- .deb -------------------------------------------------------------------
case "$(basename "${DEB}")" in
    "render-night_${VERSION}_amd64.deb") : ;;
    *) fail "deb filename does not match version: $(basename "${DEB}")" ;;
esac

[ "$(dpkg-deb -f "${DEB}" Version)" = "${VERSION}" ] \
    || fail "control Version is $(dpkg-deb -f "${DEB}" Version), expected ${VERSION}"

DEPENDS="$(dpkg-deb -f "${DEB}" Depends)"
for dep in libx11-6 libasound2 libgl1 xdg-desktop-portal zenity; do
    case "${DEPENDS}" in
        *"${dep}"*) : ;;
        *) fail "Depends is missing ${dep}: ${DEPENDS}" ;;
    esac
done

RECOMMENDS="$(dpkg-deb -f "${DEB}" Recommends)"
for dep in xdg-desktop-portal-gtk ffmpeg; do
    case "${RECOMMENDS}" in
        *"${dep}"*) : ;;
        *) fail "Recommends is missing ${dep}: ${RECOMMENDS}" ;;
    esac
done

CONTENTS="$(dpkg-deb -c "${DEB}")"
for path in \
    "./usr/bin/render-night" \
    "./usr/bin/render-night-gui" \
    "./usr/share/render-night/python/inspect_blend.py" \
    "./usr/share/render-night/python/render_runner.py" \
    "./usr/share/render-night/sounds/todung.wav" \
    "./usr/share/applications/render-night.desktop" \
    "./usr/share/icons/hicolor/256x256/apps/render-night.png"; do
    case "${CONTENTS}" in
        *"${path}"*) : ;;
        *) fail "deb payload is missing ${path}" ;;
    esac
done

dpkg-deb -x "${DEB}" "${TMP}/deb"

# --- AppImage ---------------------------------------------------------------
case "$(basename "${APPIMAGE}")" in
    "Render-Night-${VERSION}-x86_64.AppImage") : ;;
    *) fail "AppImage filename does not match version: $(basename "${APPIMAGE}")" ;;
esac

chmod +x "${APPIMAGE}"
(
    cd "${TMP}"
    "${ROOT_DIR}/${APPIMAGE}" --appimage-extract >/dev/null
) || fail "AppImage could not be extracted without FUSE"
APP_ROOT="${TMP}/squashfs-root"

for path in \
    "usr/bin/render-night" \
    "usr/bin/render-night-gui" \
    "usr/share/render-night/python/inspect_blend.py" \
    "usr/share/render-night/python/render_runner.py" \
    "usr/share/render-night/sounds/todung.wav" \
    "render-night.desktop" \
    "render-night.png"; do
    [ -e "${APP_ROOT}/${path}" ] || fail "AppImage payload is missing ${path}"
done

# --- Provenance and cwd independence ----------------------------------------
# Run each packaged binary from an unrelated, empty working directory with a
# minimal environment: proves version/SHA provenance and that startup does not
# need the build tree, the AppImage mount or the user's shell environment.
run_provenance() {
    local label="$1" binary="$2" workdir="$3"
    local out
    out="$(cd "${workdir}" && env -i HOME="${TMP}/home" PATH=/usr/bin:/bin "${binary}" --version)" \
        || fail "${label} --version failed"
    echo "verify-packages: ${label} -> ${out}"
    case "${out}" in
        *"${VERSION}"*) : ;;
        *) fail "${label} does not report ${VERSION}" ;;
    esac
    case "${out}" in
        *"${SHA}"*) : ;;
        *) fail "${label} does not report sha ${SHA}" ;;
    esac
}

mkdir -p "${TMP}/home" "${TMP}/cwd"
run_provenance "deb render-night" "${TMP}/deb/usr/bin/render-night" "${TMP}/cwd"
run_provenance "deb render-night-gui" "${TMP}/deb/usr/bin/render-night-gui" "${TMP}/cwd"
run_provenance "appimage render-night" "${APP_ROOT}/usr/bin/render-night" "${TMP}/cwd"
run_provenance "appimage render-night-gui" "${APP_ROOT}/usr/bin/render-night-gui" "${TMP}/cwd"

# The GUI must not drag the build tree into its runtime dependencies.
if ldd "${APP_ROOT}/usr/bin/render-night-gui" 2>/dev/null | grep -q "not found"; then
    ldd "${APP_ROOT}/usr/bin/render-night-gui" >&2
    fail "render-night-gui has unresolved shared libraries"
fi
if ldd "${APP_ROOT}/usr/bin/render-night-gui" 2>/dev/null | grep -q "${ROOT_DIR}"; then
    fail "render-night-gui links against the build tree"
fi

echo "verify-packages: OK"
