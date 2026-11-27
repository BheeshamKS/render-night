#!/usr/bin/env bash
# Build the Render Night .deb from an already-built target/release tree.
# Used by CI and by the release workflow, so both ship the same package.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="${1:-$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)}"
if [ -z "${VERSION}" ]; then
    echo "build-deb: could not determine version" >&2
    exit 1
fi

ARCH="amd64"
OUT_DEB="target/release/render-night_${VERSION}_${ARCH}.deb"
TMP_BASE="$(mktemp -d)"
trap 'rm -rf "${TMP_BASE}"' EXIT
PKG_DIR="${TMP_BASE}/render-night_${VERSION}_${ARCH}"

for binary in render-night render-night-gui; do
    if [ ! -x "target/release/${binary}" ]; then
        echo "build-deb: missing target/release/${binary}; build first" >&2
        exit 1
    fi
done

mkdir -p "${PKG_DIR}/DEBIAN" \
    "${PKG_DIR}/usr/bin" \
    "${PKG_DIR}/usr/share/applications" \
    "${PKG_DIR}/usr/share/icons/hicolor/256x256/apps" \
    "${PKG_DIR}/usr/share/render-night"

cp target/release/render-night "${PKG_DIR}/usr/bin/"
cp target/release/render-night-gui "${PKG_DIR}/usr/bin/"
chmod 755 "${PKG_DIR}/usr/bin/render-night" "${PKG_DIR}/usr/bin/render-night-gui"

cp resources/render-night.desktop "${PKG_DIR}/usr/share/applications/"
cp resources/icon.png "${PKG_DIR}/usr/share/icons/hicolor/256x256/apps/render-night.png"
cp -r resources/python "${PKG_DIR}/usr/share/render-night/"
cp -r resources/sounds "${PKG_DIR}/usr/share/render-night/"

cat <<EOF > "${PKG_DIR}/DEBIAN/control"
Package: render-night
Version: ${VERSION}
Section: graphics
Priority: optional
Architecture: ${ARCH}
Depends: libx11-6, libasound2 | libasound2t64, libgl1, libxcursor1, libxi6, libxrandr2, libxinerama1, xdg-desktop-portal | zenity
Recommends: xdg-desktop-portal-gtk, ffmpeg
Maintainer: BheeshamKS <bheeshamkumarsajnani3@gmail.com>
Homepage: https://github.com/BheeshamKS/render-night
Description: Fast local render queue desktop app for Blender
 A fast local batch render queue desktop application for Blender
 with a Blender-native look, headless CLI, crash recovery, and
 realtime sequence player.
EOF

chmod 755 "${PKG_DIR}/DEBIAN"
chmod 644 "${PKG_DIR}/DEBIAN/control"

rm -f "${OUT_DEB}"
dpkg-deb --build --root-owner-group "${PKG_DIR}" "${OUT_DEB}"
echo "build-deb: wrote ${OUT_DEB}"
