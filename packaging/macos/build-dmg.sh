#!/usr/bin/env bash
set -euo pipefail

TARGET_ARCH="${1:-aarch64}"
VERSION="${2:-0.1.0}"
APP_BUNDLE="target/macos/Render Night.app"

rm -rf "target/macos"
mkdir -p "${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${APP_BUNDLE}/Contents/Resources"

# Determine target binary directory
if [ "${TARGET_ARCH}" = "aarch64" ] || [ "${TARGET_ARCH}" = "arm64" ]; then
    BIN_DIR="target/aarch64-apple-darwin/release"
    DMG_NAME="Render-Night-${VERSION}-macos-arm64.dmg"
else
    BIN_DIR="target/x86_64-apple-darwin/release"
    DMG_NAME="Render-Night-${VERSION}-macos-x64.dmg"
fi

if [ ! -d "${BIN_DIR}" ]; then
    BIN_DIR="target/release"
fi

# Copy binaries into app bundle
cp "${BIN_DIR}/render-night-gui" "${APP_BUNDLE}/Contents/MacOS/Render Night"
cp "${BIN_DIR}/render-night" "${APP_BUNDLE}/Contents/MacOS/render-night"
chmod +x "${APP_BUNDLE}/Contents/MacOS/Render Night"
chmod +x "${APP_BUNDLE}/Contents/MacOS/render-night"

# Copy icons and resources
cp resources/icon.icns "${APP_BUNDLE}/Contents/Resources/icon.icns"
cp -r resources/python "${APP_BUNDLE}/Contents/Resources/"
cp -r resources/sounds "${APP_BUNDLE}/Contents/Resources/"

# Write Info.plist
cat <<EOF > "${APP_BUNDLE}/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>Render Night</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>CFBundleIdentifier</key>
    <string>com.rendernight.app</string>
    <key>CFBundleName</key>
    <string>Render Night</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

if command -v hdiutil >/dev/null 2>&1; then
    mkdir -p "target/dmg-staging"
    cp -r "${APP_BUNDLE}" "target/dmg-staging/"
    ln -s /Applications "target/dmg-staging/Applications"
    hdiutil create -volname "Render Night" -srcfolder "target/dmg-staging" -ov -format UDZO "target/release/${DMG_NAME}"
    rm -rf "target/dmg-staging"
    echo "Created macOS DMG: target/release/${DMG_NAME}"
fi
