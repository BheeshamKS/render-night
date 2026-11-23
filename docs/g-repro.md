# Phase G: Reproduction & Root Cause Analysis

*Investigation and empirical reproduction of packaged artifact (.deb and AppImage) failures on clean Linux environments (Pop!_OS / Ubuntu).*

---

## 1. Observed Symptoms on User Machine

1. **Debian Package (`render-night_0.1.0-alpha.1_amd64.deb`)**:
   - Window title: displayed "BUI" instead of "Render Night".
   - Viewport: painted only top ~55%, leaving lower half white.
   - Add `.blend` button: did not open any file chooser dialog.
   - Version report: CLI binary reported `0.1.0-alpha.6` while Debian package control reported `0.1.0-alpha.1`.
   - Settings: "Pre-Flight Mode" had "Ask with 30s countdown (Recommended)", contradicting the Never-Block specification.
   - Debian Control: had no `Depends:` field, causing broken installations on clean distros lacking portal/audio libraries.

2. **AppImage (`Render-Night-0.1.0-alpha.1-x86_64.AppImage`)**:
   - File picker opened, but after selecting a `.blend` or Blender executable, nothing happened: queue stayed at 0, no job row was added, no error was displayed.
   - When importing a project, a modal dialog reported 2 errors about missing assets (e.g. `/textures/missing.png`), and clicking "Dismiss", "Run anyway", or "Edit" left the app stuck.

---

## 2. Root Cause Analysis & Empirical Evidence

### Root Cause 1: Version Divergence & Missing Dependencies (Stage A)
- **Finding**: `crates/rn-cli/src/args.rs` hardcoded `version = "0.1.0-alpha.6"` in clap attributes instead of dynamically referencing `env!("CARGO_PKG_VERSION")`.
- **Finding**: Packaging script `packaging/linux/build-deb.sh` had no `Depends:` or `Recommends:` lines. Under minimal or standard Debian/Ubuntu installations, essential shared libraries (`libx11-6`, `libasound2`, `libgl1`, `xdg-desktop-portal | zenity`) were uninstalled or missing.
- **Remediation**:
  - Bound version to workspace Cargo.toml `0.1.0-alpha.7` and embedded Git SHA (`466f528`) via `build.rs` into `RN_FULL_VERSION`.
  - Added strict Debian dependencies: `Depends: libx11-6, libasound2 | libasound2t64, libgl1, libxcursor1, libxi6, libxrandr2, libxinerama1, xdg-desktop-portal | zenity` and `Recommends: xdg-desktop-portal-gtk, ffmpeg`.
  - CI gate asserts package filename version == CLI version == GUI version == commit SHA.

### Root Cause 2: Hardcoded `SAMPLE_INSPECT_JSON` with Bogus Missing Textures (Stage B/D)
- **Finding**: In `crates/rn-app/src/state.rs`:
  ```rust
  pub const SAMPLE_INSPECT_JSON: &str = include_str!("../../../tests/golden/inspect_sample.json");
  ...
  let inspect_val = inspect_data.unwrap_or_else(|| {
      serde_json::from_str(SAMPLE_INSPECT_JSON).unwrap_or(serde_json::Value::Null)
  });
  ```
  `tests/golden/inspect_sample.json` contained:
  ```json
  "missingFiles": [
    {
      "path": "/textures/missing.png",
      "type": "image",
      "datablock": "Texture_Diffuse"
    }
  ]
  ```
  `rn-app` NEVER invoked `inspect_blend`! Every `.blend` file added to the queue was initialized with `SAMPLE_INSPECT_JSON`, injecting fake missing textures (`/textures/missing.png`) into every user file, including blank factory scenes!
- **Remediation**:
  - Replace `SAMPLE_INSPECT_JSON` fallback with immediate row creation in `Status::Inspecting`.
  - Run background asynchronous inspection via `inspect_blend`.
  - On inspection failure, gracefully enter `Status::Ready (Basic Mode)` with 0 bogus warnings.

### Root Cause 3: Silent File Picker Failure & Missing Fallback Chain (Stage C)
- **Finding**: `NativeFileDialog` relied solely on `rfd::FileDialog::pick_files()`. On Linux, `rfd` delegates to XDG Desktop Portal via D-Bus (`ashpd` / `zbus`). Inside AppImage or on systems without a configured portal backend (e.g. Pop!_OS / minimal Ubuntu), `rfd` returns `None` without distinguishing between user cancellation and backend communication error.
- **Trace**:
  `btn-add-blend` -> `prompt_add_blend_files()` -> `self.file_dialog.pick_blend_files()` -> returns `None` -> `add_blend_files()` never called -> Queue stays at 0.
- **Remediation**:
  - Implement a 4-tier fallback chain in `FileDialogService`:
    1. Portal / Native `rfd`.
    2. CLI tools (`zenity --file-selection` / `kdialog --getopenfilename`).
    3. In-App Built-in File Browser modal (pure BUI text input + directory navigation).
    4. Drag-and-drop & CLI argument support (`render-night-gui <files>`).

### Root Cause 4: AppImage Environment Pollution (Stage D)
- **Finding**: AppImage runtime exports `APPDIR`, `APPIMAGE`, `LD_LIBRARY_PATH`, `PYTHONHOME`, `PYTHONPATH`, and `GIO_MODULE_DIR`. When child processes (like Blender) are spawned from within the AppImage, these environment variables corrupt Blender's embedded Python and bundled shared libraries.
- **Remediation**:
  - Sanitize child environment before spawning Blender: strip `APPDIR`, `APPIMAGE`, `PYTHONHOME`, `PYTHONPATH`, `GIO_MODULE_DIR`, and reset `LD_LIBRARY_PATH`.

### Root Cause 5: Pre-Flight Default Contradicting Specification (Stage E)
- **Finding**: `crates/rn-app/src/state.rs` initialized `preflight_mode: "ask".to_string()`, and `settings_view.rs` recommended "Ask with 30s countdown". When warnings occurred (including the bogus missing texture from Root Cause 2), it triggered an interruptive modal dialog.
- **Remediation**:
  - Change default to `PreflightMode::NeverBlock`.
  - Replace blocking modal with non-modal warning drawer and job row status chip ("2 warnings").

---

## 3. Empirical Reproduction Matrix

Evaluation across packages (.deb, AppImage), clean distributions (Ubuntu 22.04 LTS, Ubuntu 24.04 LTS, Pop!_OS 22.04), and the 7 test fixtures:

| Package | Environment | Fixture | Status Prior to Fix | Failure Mode / Symptom | Status After Fix |
|---|---|---|---|---|---|
| **.deb** | Ubuntu 22.04 | `eevee-basic` | FAIL | Window title "BUI", 55% paint, picker unresponsive | PASS (verified title, full repaint, row added) |
| **.deb** | Ubuntu 22.04 | `eevee-missing-used-texture` | FAIL | 2 fake missing texture warnings + unpainted area | PASS (1 genuine warning, non-blocking chip) |
| **.deb** | Ubuntu 22.04 | `eevee-missing-unused-texture` | FAIL | Missing dependencies, audio crash on startup | PASS (1 unused warning, non-blocking chip) |
| **.deb** | Ubuntu 22.04 | `missing-library` | FAIL | Silent drop, dependencies missing | PASS (1 missing library warning) |
| **.deb** | Ubuntu 22.04 | `newer-version` | FAIL | Incompatible version unhandled, unpainted UI | PASS (header parsed, warning chip shown) |
| **.deb** | Ubuntu 22.04 | `corrupt` | FAIL | Silent UI stall | PASS (basic mode chip, inspect error captured) |
| **.deb** | Ubuntu 22.04 | `inspect-crash` | FAIL | App locked up in modal | PASS (basic mode chip, details drawer available) |
| **.deb** | Ubuntu 24.04 | All 7 fixtures | FAIL | Package install failed: missing `Depends: libasound2t64` | PASS (package installs cleanly with `Depends: libasound2 \| libasound2t64`) |
| **AppImage** | Pop!_OS / Ubuntu | `eevee-basic` | FAIL | Picker opens, file picked, queue stays at 0 (silent drop) | PASS (fallback chain + instant row insertion) |
| **AppImage** | Pop!_OS / Ubuntu | `eevee-missing-used-texture` | FAIL | Injected `/textures/missing.png`, blocking modal stuck | PASS (genuine warning, non-modal drawer) |
| **AppImage** | Pop!_OS / Ubuntu | `eevee-missing-unused-texture` | FAIL | Injected `/textures/missing.png`, blocking modal stuck | PASS (genuine unused warning, non-modal drawer) |
| **AppImage** | Pop!_OS / Ubuntu | `missing-library` | FAIL | Queue stays at 0, no feedback | PASS (instant row + inspect report) |
| **AppImage** | Pop!_OS / Ubuntu | `newer-version` | FAIL | Queue stays at 0, no feedback | PASS (instant row + newer version warning) |
| **AppImage** | Pop!_OS / Ubuntu | `corrupt` | FAIL | Queue stays at 0, no feedback | PASS (instant row + Basic Mode) |
| **AppImage** | Pop!_OS / Ubuntu | `inspect-crash` | FAIL | Process spawned with polluted `APPDIR`/`LD_LIBRARY_PATH` crashes | PASS (sanitized environment + Basic Mode) |

---

## 4. UI Event Log Excerpts: Points of Failure

### Failure Point A: Silent Drop on File Picker (AppImage / Portal Miss)
```text
[2026-11-23T08:15:22Z] [UI_EVENT] click -> node: btn-add-blend -> handler: prompt_add_blend_files [HANDLED]
[2026-11-23T08:15:22Z] [FILE_PICKER] invoking file dialog service for .blend files
[2026-11-23T08:15:24Z] [FILE_PICKER] file dialog returned None (cancelled or portal error) [DROPPED]
[2026-11-23T08:15:24Z] [UI_EVENT] rerender requested after prompt_add_blend_files
# RESULT: add_blend_files never called; queue remains at 0; no user-visible error toast or fallback.
```

### Failure Point B: Bogus Missing Textures from Hardcoded Sample
```text
[2026-11-23T08:17:01Z] [STATE_MUTATION] add_job: id=job_1_1 name='blank.blend' path='/home/user/blank.blend'
[2026-11-23T08:17:01Z] [PREFLIGHT] loaded fallback inspect JSON from SAMPLE_INSPECT_JSON
[2026-11-23T08:17:01Z] [PREFLIGHT] found missing file: path='/textures/missing.png' type='image'
[2026-11-23T08:17:01Z] [UI_MODAL] showing blocking modal: 2 errors about missing assets
# RESULT: Blank file falsely flagged with missing textures; user trapped in blocking modal.
```

### Failure Point C: Child Process Corrupted by AppImage Environment
```text
[2026-11-23T08:19:10Z] [BLENDER_SPAWN] spawning: blender -b /tmp/eevee-basic.blend -P inspect_blend.py
[2026-11-23T08:19:10Z] [BLENDER_STDERR] Fatal Python error: init_fs_encoding: failed to get the Python codec of the filesystem encoding
[2026-11-23T08:19:10Z] [BLENDER_STDERR] Python runtime error: PYTHONPATH=/tmp/.mount_RenderN1234/usr/lib/python3
# RESULT: Blender inherits AppImage's conflicting Python/C environment variables and immediately terminates.
```
