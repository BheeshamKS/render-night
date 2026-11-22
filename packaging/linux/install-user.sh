#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "=== Installing Render Night to ~/.local ==="

mkdir -p "${HOME}/.local/bin"
mkdir -p "${HOME}/.local/share/applications"
mkdir -p "${HOME}/.local/share/icons/hicolor/256x256/apps"
mkdir -p "${HOME}/.local/share/render-night/python"
mkdir -p "${HOME}/.local/share/render-night/sounds"

# Build release binaries if missing
if [[ ! -f "${REPO_DIR}/target/release/render-night" || ! -f "${REPO_DIR}/target/release/render-night-gui" ]]; then
    echo "Release binaries not found. Building with cargo build --release..."
    cargo build --release --manifest-path "${REPO_DIR}/Cargo.toml" -p rn-cli -p rn-app
fi

cp "${REPO_DIR}/target/release/render-night" "${HOME}/.local/bin/"
cp "${REPO_DIR}/target/release/render-night-gui" "${HOME}/.local/bin/"
chmod 755 "${HOME}/.local/bin/render-night" "${HOME}/.local/bin/render-night-gui"

cp "${REPO_DIR}/resources/render-night.desktop" "${HOME}/.local/share/applications/"
cp "${REPO_DIR}/resources/icon.png" "${HOME}/.local/share/icons/hicolor/256x256/apps/render-night.png"
cp -r "${REPO_DIR}/resources/python/"* "${HOME}/.local/share/render-night/python/"
cp -r "${REPO_DIR}/resources/sounds/"* "${HOME}/.local/share/render-night/sounds/" 2>/dev/null || true

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${HOME}/.local/share/applications" 2>/dev/null || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "${HOME}/.local/share/icons/hicolor" 2>/dev/null || true
fi

echo "✓ Render Night installed successfully to ~/.local"
echo "  CLI binary:     ${HOME}/.local/bin/render-night"
echo "  GUI binary:     ${HOME}/.local/bin/render-night-gui"
echo "  Desktop entry:  ${HOME}/.local/share/applications/render-night.desktop"
echo "  App Icon:       ${HOME}/.local/share/icons/hicolor/256x256/apps/render-night.png"
echo "  Resources:      ${HOME}/.local/share/render-night/"
