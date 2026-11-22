#!/usr/bin/env bash
set -euo pipefail

echo "=== Uninstalling Render Night from ~/.local ==="

rm -f "${HOME}/.local/bin/render-night"
rm -f "${HOME}/.local/bin/render-night-gui"
rm -f "${HOME}/.local/share/applications/render-night.desktop"
rm -f "${HOME}/.local/share/icons/hicolor/256x256/apps/render-night.png"
rm -rf "${HOME}/.local/share/render-night"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${HOME}/.local/share/applications" 2>/dev/null || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "${HOME}/.local/share/icons/hicolor" 2>/dev/null || true
fi

echo "✓ Render Night uninstalled from ~/.local"
