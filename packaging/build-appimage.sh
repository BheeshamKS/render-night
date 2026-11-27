#!/usr/bin/env bash
# Build the Render Night AppImage from an already-built target/release tree.
# Used by CI and by the release workflow, so both ship the same package.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="${1:-$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)}"
if [ -z "${VERSION}" ]; then
    echo "build-appimage: could not determine version" >&2
    exit 1
fi

APP_DIR="${ROOT_DIR}/target/appimage/RenderNight.AppDir"
OUT_IMG="${ROOT_DIR}/target/release/Render-Night-${VERSION}-x86_64.AppImage"

for binary in render-night render-night-gui; do
    if [ ! -x "target/release/${binary}" ]; then
        echo "build-appimage: missing target/release/${binary}; build first" >&2
        exit 1
    fi
done

rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}/usr/bin" \
    "${APP_DIR}/usr/share/icons/hicolor/256x256/apps" \
    "${APP_DIR}/usr/share/render-night"

cp target/release/render-night "${APP_DIR}/usr/bin/"
cp target/release/render-night-gui "${APP_DIR}/usr/bin/"
chmod 755 "${APP_DIR}/usr/bin/render-night" "${APP_DIR}/usr/bin/render-night-gui"

# The AppImage must run on a bare system. libasound is the one non-X library the
# GUI loads; every X desktop already provides libX11. Bundle it so a minimal
# container (and a fresh server install) does not fail with "libasound.so.2:
# cannot open shared object file".
for lib in /usr/lib/x86_64-linux-gnu/libasound.so.2 /usr/lib/libasound.so.2; do
    if [ -f "${lib}" ]; then
        mkdir -p "${APP_DIR}/usr/lib"
        cp -L "${lib}" "${APP_DIR}/usr/lib/"
        echo "build-appimage: bundled ${lib}"
        break
    fi
done

cp resources/render-night.desktop "${APP_DIR}/render-night.desktop"
cp resources/icon.png "${APP_DIR}/render-night.png"
cp resources/icon.png "${APP_DIR}/.DirIcon"
cp -r resources/python "${APP_DIR}/usr/share/render-night/"
cp -r resources/sounds "${APP_DIR}/usr/share/render-night/"

cat <<'EOF' > "${APP_DIR}/AppRun"
#!/usr/bin/env bash
SELF=$(readlink -f "$0")
HERE=${SELF%/*}
export PATH="${HERE}/usr/bin:${PATH}"
export LD_LIBRARY_PATH="${HERE}/usr/lib:${LD_LIBRARY_PATH:-}"
export RN_RESOURCES_PATH="${HERE}/usr/share/render-night"
exec "${HERE}/usr/bin/render-night-gui" "$@"
EOF
chmod 755 "${APP_DIR}/AppRun"

if command -v appimagetool >/dev/null 2>&1; then
    APPIMAGETOOL="appimagetool"
else
    APPIMAGETOOL="target/appimage/appimagetool"
    if [ ! -x "${APPIMAGETOOL}" ]; then
        mkdir -p target/appimage
        echo "build-appimage: downloading appimagetool"
        curl -fsSLo "${APPIMAGETOOL}" \
            https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage
        chmod +x "${APPIMAGETOOL}"
    fi
fi

rm -f "${OUT_IMG}"
ARCH=x86_64 "${APPIMAGETOOL}" --appimage-extract-and-run "${APP_DIR}" "${OUT_IMG}"

if [ ! -s "${OUT_IMG}" ]; then
    echo "build-appimage: appimagetool did not produce ${OUT_IMG}" >&2
    exit 1
fi
echo "build-appimage: wrote ${OUT_IMG}"
