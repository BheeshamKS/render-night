#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-0.1.0}"
APP_DIR="target/appimage/RenderNight.AppDir"

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
    if [ ! -f "target/appimage/appimagetool" ]; then
        mkdir -p target/appimage
        curl -sLo target/appimage/appimagetool https://github.com/AppImage/AppImageKit/releases/download/13/appimagetool-x86_64.AppImage || true
        chmod +x target/appimage/appimagetool || true
    fi
    APPIMAGETOOL="target/appimage/appimagetool"
else
    APPIMAGETOOL="appimagetool"
fi

if [ -x "${APPIMAGETOOL}" ]; then
    ARCH=x86_64 "${APPIMAGETOOL}" "${APP_DIR}" "target/release/Render-Night-${VERSION}-x86_64.AppImage" || true
    echo "AppImage packaging complete."
fi
