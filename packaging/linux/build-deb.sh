#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-0.1.0}"
ARCH="amd64"
TMP_BASE="$(mktemp -d)"
PKG_DIR="${TMP_BASE}/render-night_${VERSION}_${ARCH}"

rm -rf "${PKG_DIR}"
mkdir -p "${PKG_DIR}/DEBIAN"
mkdir -p "${PKG_DIR}/usr/bin"
mkdir -p "${PKG_DIR}/usr/share/applications"
mkdir -p "${PKG_DIR}/usr/share/icons/hicolor/256x256/apps"
mkdir -p "${PKG_DIR}/usr/share/render-night"

# Copy binaries
cp target/release/render-night "${PKG_DIR}/usr/bin/"
cp target/release/render-night-gui "${PKG_DIR}/usr/bin/"
chmod 755 "${PKG_DIR}/usr/bin/render-night"
chmod 755 "${PKG_DIR}/usr/bin/render-night-gui"

# Copy resources
cp resources/render-night.desktop "${PKG_DIR}/usr/share/applications/"
cp resources/icon.png "${PKG_DIR}/usr/share/icons/hicolor/256x256/apps/render-night.png"
cp -r resources/python "${PKG_DIR}/usr/share/render-night/"
cp -r resources/sounds "${PKG_DIR}/usr/share/render-night/"

# Write control file
cat <<EOF > "${PKG_DIR}/DEBIAN/control"
Package: render-night
Version: ${VERSION}
Section: graphics
Priority: optional
Architecture: ${ARCH}
Maintainer: BheeshamKS <bheeshamkumarsajnani3@gmail.com>
Description: Fast local render queue desktop app for Blender
 A fast local batch render queue desktop application for Blender
 with a Blender-native look, headless CLI, crash recovery, and
 realtime sequence player.
EOF

chmod 755 "${PKG_DIR}/DEBIAN"
chmod 644 "${PKG_DIR}/DEBIAN/control"

dpkg-deb --build --root-owner-group "${PKG_DIR}" "target/release/render-night_${VERSION}_${ARCH}.deb"
rm -rf "${TMP_BASE}"
echo "Built Debian package: target/release/render-night_${VERSION}_${ARCH}.deb"
