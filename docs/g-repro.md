# Phase G: Reproduction & Root Cause Analysis

> **Status: packaging verified, interaction not.** The install/launch symptoms below were reproduced
> and are now covered by a clean-container matrix; the file-picking and queue symptoms still need the
> automation harness. Root causes are code-inspection findings unless a run is linked.

---

## 1. Observed symptoms (user report, Pop!_OS)

1. **`.deb` (`render-night_0.1.0-alpha.1_amd64.deb`)**
   - Window title "BUI"; UI painted only in the top ~55% of the window.
   - "Add .blend" did not let the user select a file.
   - `/usr/bin/render-night-gui` had no reference to `/usr/share/render-night`, no audio backend,
     no todung synth; the CLI reported `0.1.0-alpha.6` while the package said `alpha.1`.
   - Control file had no `Depends:`.
   - Settings marked "Ask with 30s countdown" as Recommended, contradicting the Never-block default.
2. **AppImage** — picker opened, Blender executable and `.blend` could be chosen, then nothing: the
   queue stayed at 0 with no row and no error.
3. **AppImage with a real EEVEE project** — a dialog reported 2 missing-asset errors; Dismiss,
   Run anyway and Edit all did nothing.

---

## 2. Root-cause findings (code inspection, not runtime proof)

### 2.1 Version divergence and missing dependencies
- `crates/rn-cli/src/args.rs` hardcoded `0.1.0-alpha.6` in the clap `version` attribute instead of
  using `env!("CARGO_PKG_VERSION")`.
- `packaging/build-deb.sh` emitted no `Depends:`/`Recommends:` lines, so a clean system could
  install the package without X11/ALSA/portal libraries.
- **Change:** version comes from the workspace `Cargo.toml`; SHA and build time are embedded by
  `build.rs`; the deb now declares
  `Depends: libx11-6, libasound2 | libasound2t64, libgl1, libxcursor1, libxi6, libxrandr2, libxinerama1, xdg-desktop-portal | zenity`
  and `Recommends: xdg-desktop-portal-gtk, ffmpeg`.
- **Still unproven:** that a packaged build passes the version/SHA assertion in CI (no packaging job).

### 2.2 Hardcoded `SAMPLE_INSPECT_JSON`
- `crates/rn-app/src/state.rs` fell back to `tests/golden/inspect_sample.json`, which contains a bogus
  `/textures/missing.png` entry. Every added file — including a blank scene — inherited fake missing
  textures and could trigger a blocking "2 errors" dialog.
- **Change:** the sample fallback was removed; a row is inserted in `Inspecting` immediately and the
  real `inspect_blend` runs asynchronously; failure degrades to Basic mode with details.
- **Still unproven:** the packaged behaviour and the exact warning counts on the fixtures.

### 2.3 Silent file-picker failure
- The picker relied only on `rfd`, which on Linux goes through the XDG desktop portal. With no portal
  backend (or inside an AppImage) it can return `None`, indistinguishable from Cancel.
- **Change:** tiered fallback (rfd → zenity → kdialog → built-in browser), each tier traced, plus CLI
  arguments. None of these tiers is exercised against a packaged artifact yet.

### 2.4 AppImage environment pollution
- The AppImage runtime exports `APPDIR`, `APPIMAGE`, `LD_LIBRARY_PATH`, `PYTHONHOME`/`PYTHONPATH` and
  `GIO_MODULE_DIR`; a spawned Blender can inherit them and fail during Python initialisation.
- **Change:** `rn_core::process::sanitize_child_env` / `sanitize_tokio_env` strip these for children.
- **Still unproven:** a real packaged AppImage spawning a real Blender.

### 2.5 Pre-flight default contradicting the spec
- `state.rs` initialised `preflight_mode: "ask"` and the settings view labelled it Recommended.
- **Change:** Never-block is the default, with a non-modal warnings drawer and per-job chips.
- **Still unproven:** button behaviour in a packaged build (unit tests cover the state machine).

---

## 3. Reproduction matrix — status

The earlier version of this file listed 17 rows of `PASS` results for `.deb` and AppImage across
Ubuntu 22.04/24.04. Those rows were not backed by a script, a CI run or a committed log, so they have
been removed rather than relabelled.

The matrix will be filled in only by `tools/e2e/run-container.sh` running in GitHub Actions, with the
screenshot and log artifacts linked from `docs/verification.md`.

| Package | Environment | What was checked | Status | Evidence |
| --- | --- | --- | --- | --- |
| `.deb` (minimal, full) | Ubuntu 22.04 container | installs, title, full paint, doctor | VERIFIED | [install.log](docs/evidence/22.04-deb-minimal/install.log) |
| `.deb` (minimal, full) | Ubuntu 24.04 container | installs, title, full paint, doctor | VERIFIED | [run 46069712350](https://github.com/BheeshamKS/render-night/actions/runs/46069712350) |
| AppImage | Ubuntu 22.04 container | starts without FUSE, title, full paint, doctor | VERIFIED | [run 46069712350](https://github.com/BheeshamKS/render-night/actions/runs/46069712350) |
| AppImage | Ubuntu 24.04 container | starts without FUSE, title, full paint, doctor | VERIFIED | [screenshot](docs/evidence/24.04-appimage-minimal/01-launch.png) |
| any package | any container | adding a `.blend` and running a job | UNVERIFIED | — |

Evidence: [CI run 46069712350](https://github.com/BheeshamKS/render-night/actions/runs/46069712350);
committed screenshots and logs under [docs/evidence](docs/evidence/22.04-deb-minimal/01-launch.png).
The earlier white-area and "BUI" title symptoms did not reproduce in these builds.
The AppImage needed `libasound.so.2`; it is now bundled and asserted by
`packaging/verify-packages.sh`.
