# Release Guide & Packaging Verification

This document specifies the distribution packaging targets, build procedures, and platform-specific smoke-testing checklists for Render Night.

---

## 1. Distribution Targets

Render Night uses `electron-builder` to produce verified release binaries for Windows, macOS, and Linux:

| Platform | Format / Target | Architecture | Output File Pattern | Distribution Channel |
|:---|:---|:---|:---|:---|
| **Windows** | NSIS Installer | `x64` | `release/Render Night Setup 0.1.0-alpha.3.exe` | GitHub Release (Automated) |
| **Windows** | Portable Executable | `x64` | `release/Render Night 0.1.0-alpha.3.exe` | GitHub Release (Automated) |
| **Linux** | AppImage | `x64` | `release/Render-Night-0.1.0-alpha.3.AppImage` | GitHub Release (Automated) |
| **Linux** | Debian Package (`.deb`) | `x64` | `release/render-night_0.1.0-alpha.3_amd64.deb` | GitHub Release (Automated) |
| **macOS** | Apple Disk Image (`.dmg`) | `arm64` / `x64` | `release/Render Night-0.1.0-alpha.3*.dmg` | Local Build (`npm run dist:mac`) |

> [!NOTE]
> Per project specification, Linux packaging produces **AppImage + deb ONLY**. No `.tar.gz` archive is distributed.
> Automated macOS packaging in GitHub Actions is skipped; macOS users compile locally via `npm run dist:mac`.

---

## 2. Packaging Build Commands

```bash
# Build headless CLI and web renderer bundles
npm run build

# Package for current host OS
npm run dist

# Specific platform targets (via cross-build or matrix runners)
npm run dist:linux   # AppImage + deb (Linux x64)
npm run dist:win     # NSIS + Portable (Windows x64)
npm run dist:mac     # DMG arm64 + x64 (macOS)
```

---

## 3. Smoke-Test Checklists per Platform

### Linux (AppImage & Debian Package)

#### AppImage Smoke Test:
1. Make executable:
   ```bash
   chmod +x release/Render-Night-*.AppImage
   ```
2. Launch directly from terminal or file manager:
   ```bash
   ./release/Render-Night-*.AppImage
   ```
3. **Verify:**
   - Window opens at 1100x750 with dark theme `#181818`.
   - Blender installations on PATH, `/opt`, `/usr/bin`, or Snap/Flatpak are auto-detected in the toolbar.
   - Drag & drop a `.blend` file into the queue.
   - Run a test render and confirm progress streaming and completion sound ("to-DUNG").

#### Debian Package Smoke Test:
1. Install package:
   ```bash
   sudo dpkg -i release/render-night_*_amd64.deb
   ```
2. **Verify Desktop Entry & Categories:**
   - Search "Render Night" in system application launcher.
   - Verify category `Graphics;3DGraphics;RasterGraphics;`.
   - Launch application from launcher icon.
3. Clean uninstall:
   ```bash
   sudo apt remove render-night
   ```

---

### macOS (Apple Silicon arm64 & Intel x64)

1. Open the `.dmg` volume.
2. Drag `Render Night.app` into `/Applications`.
3. **Gatekeeper Workaround (Unsigned Alpha Build):**
   - Alpha releases are unsigned (`hardenedRuntime: false`, `identity: null`).
   - On first launch, macOS will show a security dialog ("cannot be opened because the developer cannot be verified").
   - **Workaround:** In Finder, navigate to `/Applications`, right-click (or Control-click) `Render Night.app`, and select **Open**. Click **Open** in the confirmation dialog. Subsequent launches work normally without prompts.
4. **Verify:**
   - App launches cleanly on Apple Silicon (`arm64`) and Intel (`x64`).
   - Sleep blocker activates during active queue execution.
   - Post-queue countdown dialog cancels safely when keys are pressed.

---

### Windows (NSIS Installer & Portable EXE)

#### NSIS Installer Smoke Test:
1. Double-click `Render Night Setup *.exe`.
2. Select installation directory and complete installation.
3. Launch via Start Menu / Desktop shortcut.
4. **Verify:**
   - Application starts without administrative elevation (`asInvoker`).
   - Windows long-path safety check passes.
   - Run uninstaller from Windows Settings / Add or Remove Programs and verify clean removal.

#### Portable Executable Smoke Test:
1. Place `Render Night *.exe` into an arbitrary folder or USB drive.
2. Launch executable directly without running an installer.
3. Verify persistent queue state is created in `%APPDATA%\Render Night`.

---

## 4. GitHub Actions CI/CD Release Workflow

Releases are automated via `.github/workflows/release.yml`:
1. Push a git tag matching `v*` (e.g., `git push origin v0.1.0-alpha.3`).
2. The `verify` job runs `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test`.
3. GitHub Actions executes a matrix build across:
   - `windows-latest` $\to$ builds NSIS + Portable
   - `ubuntu-latest` $\to$ builds AppImage + deb
   *(macOS packages are compiled locally using `npm run dist:mac`)*
4. The `release` job aggregates all installers and publishes the GitHub Release (marked as Pre-release for `-alpha` tags) with generated release notes.
