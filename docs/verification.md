# Phase F1: Verification & Proof Registry

*All claims in this document are backed by empirical test logs, inspected screenshots, or command outputs. Items without direct proof are marked UNVERIFIED per Phase F1 Evidence Rules.*

---

## 1. CI Triage & Root Cause Verification

- **Status**: **VERIFIED**
- **Evidence Reference**: [`docs/ci-triage.md`](file:///mnt/SSD_Storage/Coding/Render-Night/docs/ci-triage.md)
- **Log Excerpts / Proof**:
  - Windows CMake Generator failure triaged: `cmake-rs` auto-detected `Visual Studio 18 2026` which CMake 3.31 rejected. Fixed via `CMAKE_GENERATOR: "Ninja"`.
  - Ubuntu Linux Alsa missing package triaged: `alsa-sys` build failure due to missing `libasound2-dev` and `pkg-config`. Fixed via apt dependencies.
  - Windows test path binary name: missing `.exe` suffix on `render-night`. Fixed via `std::env::consts::EXE_SUFFIX`.
  - Consolidated CI workflow replacing broken `bui-matrix.yml` and old CI runs.

---

## 2. Runtime UI Layout & Control Wiring

### 2.1 Window Title & Full Viewport Fill (No White Background)
- **Status**: **VERIFIED**
- **Evidence**:
  - `crates/rn-app/tests/runtime_ui_interaction_test.rs:test_window_full_height_and_no_white_background`
  - Output excerpt:
    ```
    running 2 tests
    test test_window_full_height_and_no_white_background ... ok
    test test_all_interactive_buttons_wire_and_dispatch ... ok
    test result: ok. 2 passed; 0 failed; 0 ignored; finished in 0.39s
    ```
  - Framebuffer check: 1280x800 resolution renders 1,024,000 pixels. Exactly 0 white pixels (`0xFFFFFF`). Bottom-right pixel is `#181818` (theme dark surface background).
  - Titlebar set explicitly to `"Render Night"` via `TitlebarOptions { title: Some("Render Night".into()) }`.

### 2.2 Interactive Button Dispatch via BUI Simulated Input
- **Status**: **VERIFIED**
- **Evidence**:
  - Automated test `test_all_interactive_buttons_wire_and_dispatch` exercised via `cx.simulate_click()`:
    1. Navigation Rail (`nav-history`, `nav-tools`, `nav-settings`, `nav-queue`) switched view states correctly.
    2. Empty State Browse (`btn-browse-blend`) triggered `MockFileDialog::pick_blend_files()`.
    3. Toolbar `+ Add .blend` (`btn-add-blend`) triggered `MockFileDialog::pick_blend_files()`.
    4. Dock Toggle (`btn-toggle-dock`) toggled `monitor_expanded` from `false` -> `true` -> `false`.
    5. Dock Tabs (`btn-dock-tab-frametimes`, `btn-dock-tab-console`, `btn-dock-tab-preview`) toggled `active_dock_tab`.
    6. Toolbar Queue Controls (`btn-start-queue`, `btn-pause-queue`, `btn-resume-queue`, `btn-stop-queue`) transitioned queue states: `Idle` -> `Running` -> `Paused` -> `Running` -> `Idle`.

### 2.3 Smoke Test (`--smoke-test`)
- **Status**: **VERIFIED**
- **Evidence**:
  - Command: `cargo run -p rn-cli --bin render-night -- --smoke-test`
  - Output:
    ```
    ============================================================
    RENDER NIGHT: RUNNING SMOKE TEST (1 FRAME DRAW)
    ============================================================
    Smoke test passed: rendered 1280x800 viewport with 1024000 non-zero pixels
    ```

---

## 3. Real Blender E2E Verification

- **Status**: *IN_PROGRESS*
- **Blender Version on Host**: Flatpak Blender 5.3.0 (`flatpak run org.blender.Blender`) / CLI integration.
- Target items to verify:
  - Real .blend creation via `tools/make-test-blend.py`.
  - Live progress, FPS, frame times, CPU/GPU stats during render.
  - Device badge verification.
  - Audio rodio synthesis with clean headless fallback.
  - `kill -9` Blender mid-render handling.
  - `kill -9` Render Night crash recovery modal with post-action safety disarm.
  - Preflight never-block with used vs unused missing asset classification.
