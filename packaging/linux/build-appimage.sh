#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
    VERSION=$(grep -m1 '^version = ' Cargo.toml | cut -d '"' -f2)
else
    VERSION="${1}"
fi
ROOT_DIR="$(pwd)"
APP_DIR="${ROOT_DIR}/target/appimage/RenderNight.AppDir"
OUT_IMG="${ROOT_DIR}/target/release/Render-Night-${VERSION}-x86_64.AppImage"

rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}/usr/bin"
mkdir -p "${APP_DIR}/usr/share/icons/hicolor/256x256/apps"
mkdir -p "${APP_DIR}/usr/share/render-night"

# Copy binaries
cp target/release/render-night "${APP_DIR}/usr/bin/"
cp target/release/render-night-gui "${APP_DIR}/usr/bin/"
chmod 755 "${APP_DIR}/usr/bin/render-night"
chmod 755 "${APP_DIR}/usr/bin/render-night-gui"

# Copy resources
cp resources/render-night.desktop "${APP_DIR}/render-night.desktop"
cp resources/icon.png "${APP_DIR}/render-night.png"
cp resources/icon.png "${APP_DIR}/.DirIcon"
cp -r resources/python "${APP_DIR}/usr/share/render-night/"
cp -r resources/sounds "${APP_DIR}/usr/share/render-night/"

# Write AppRun
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

# Download appimagetool if not present
if ! command -v appimagetool >/dev/null 2>&1; then
    if [ ! -f "target/appimage/appimagetool" ] || [ ! -s "target/appimage/appimagetool" ] || grep -q "Not Found" "target/appimage/appimagetool" 2>/dev/null; then
        mkdir -p target/appimage
        curl -sLo target/appimage/appimagetool https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage
        chmod +x target/appimage/appimagetool
    fi
    APPIMAGETOOL="target/appimage/appimagetool"
else
    APPIMAGETOOL="appimagetool"
fi

if [ -x "${APPIMAGETOOL}" ]; then
    ARCH=x86_64 "${APPIMAGETOOL}" --appimage-extract-and-run "${APP_DIR}" "${OUT_IMG}"
    echo "AppImage packaging complete: ${OUT_IMG}"
fi
