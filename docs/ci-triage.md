# CI Triage & Failure Diagnosis Report

**Date:** 2026-11-23  
**Branch:** `fix/green-and-working`  
**Reference Runs:**
- BUI Build Matrix: #1 (`44948027126`), #10 (`44957904466`), #18 (`45072722106`)
- CI: #17 (`45069883437`), #18 (`45070182963`), #19 (`45072707257`), #20 (`45072722210`), #21 (`45074058129`)

---

## 1. Matrix of Triage Failures

| Run ID | Workflow | Job / OS Leg | Failing Step | First Error Line | Root Cause | Proposed Fix |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **44948027126** (BUI #1) | BUI Build Matrix | `windows-latest` | `Build rn-spike (Verification)` | `CMake Error: Could not create named generator Visual Studio 18 2026` | `cmake-rs` auto-detects MSVC and attempts to pass an unrecognised Visual Studio year/version to CMake on Windows runners. | Set `CMAKE_GENERATOR: "Ninja"` in environment for Windows build steps. |
| **44957904466** (BUI #10) | BUI Build Matrix | `ubuntu-latest` | `Test Workspace Core` | `The system library 'alsa' required by crate 'alsa-sys' was not found.` | `bui-matrix.yml` apt install step lacked `libasound2-dev` and `pkg-config` required by `rodio` / `alsa-sys`. | Add `libasound2-dev` and `pkg-config` (plus `libdbus-1-dev`) to apt packages. |
| **44957904466** (BUI #10) | BUI Build Matrix | `macos-latest` | `Test Workspace Core` | `thread 'test_parity_scenario_3_slow_control_stop' panicked at crates/rn-cli/tests/parity_integration.rs:222:5: Frame 5 must not be rendered when stopped early via sentinel` | Path mismatch between `parity_integration.rs` (which writes to `runtime/control.json`) and `rn-mock-blender` (which only read `payload.control_file`), combined with timing race in mock delay. | Support fallback to `runtime/control.json` in `rn-mock-blender` and allow supervisor to actively abort child process when sentinel is set. |
| **44957904466** (BUI #10) | BUI Build Matrix | `windows-latest` | `Build rn-spike (Verification)` | `CMake Error: Could not create named generator Visual Studio 18 2026` | Same generator issue in `cmake-rs`. | Set `CMAKE_GENERATOR: "Ninja"`. |
| **45072722106** (BUI #18) | BUI Build Matrix | `ubuntu-latest`, `macos-latest`, `windows-latest` | `Test Workspace Core` / `Build rn-spike` | Same `alsa-sys` missing on Ubuntu, `CMake generator` on Windows, and `slow_control_stop` on macOS. | Workflow setup issues never fixed in `bui-matrix.yml`. | Consolidate and replace with unified, hardened `ci.yml`. |
| **45069883437** (CI #17) | CI | `windows-latest` | `Run Workspace Tests` | `thread 'test_cli_help_and_version' (2500) panicked at crates\rn-cli\tests\cli_integration.rs:32:5: render-night binary must exist` | Integration test helpers built binary path as `path.push("render-night")` without `.exe` suffix on Windows (`std::env::consts::EXE_SUFFIX`). | Use `std::env::consts::EXE_SUFFIX` or Cargo's `env!("CARGO_BIN_EXE_...")` for binary paths. |
| **45069883437** (CI #17) | CI | `macos-latest` | `Run Workspace Tests` | `test_parity_scenario_3_slow_control_stop` failed | Sentinel path and timing race. | Add fallback lookup for `control.json` in mock blender and test. |
| **45070182963** (CI #18) | CI | `ubuntu-latest`, `windows-latest`, `macos-latest` | `Run Workspace Tests` | `test_parity_scenario_3_slow_control_stop` failed on Ubuntu/macOS; missing `.exe` on Windows | Same root causes as CI #17. | Fix binary suffixes and control sentinel polling. |
| **45072722210** (CI #20) | CI | `ubuntu-latest`, `windows-latest`, `macos-latest` | `Run Workspace Tests` | `test_parity_scenario_3_slow_control_stop` failed on Ubuntu/macOS; missing `.exe` on Windows | Same root causes as CI #17. | Same fix. |
| **45079807929** (CI #22) | CI | `ubuntu-latest` | `Run Tests (Linux with xvfb)` | `thread 'test_parity_scenario_3_slow_control_stop' (8538) panicked at crates/rn-cli/tests/parity_integration.rs:222:5: Frame 5 must not be rendered when stopped early via sentinel` | `check_sentinel` returned `(false, false)` immediately when the first candidate (`run/job/control.json`) held `"continue"`, masking `"stop"` in `runtime/control.json`. | Check all ancestor `control.json` paths for `"stop"` / `"pause"` and synchronize test stop signal with frame 1 disk write. |
| **45079807929** (CI #22) | CI | `windows-latest` | `Run Tests (Windows)` | Runner timed out after 49m | `test_kill_9_crash_simulation_orphans_safety_and_resume` piped child stdout/stderr without reading, and only killed child under `#[cfg(unix)]`. Child pipe filled, blocking forever. `is_pid_alive` was also a stub on Windows. | Terminate child on Windows via `child.kill()`, use `Stdio::null()`, and implement Win32 `is_pid_alive` via `OpenProcess`/`GetExitCodeProcess`. |

---

## 2. Infrastructure & Workflow Flaws Identified

1. **Two Separate, Desynchronized Workflows (`ci.yml` and `bui-matrix.yml`)**:
   - `bui-matrix.yml` tested `rn-spike` (which was a temporary feasibility spike) instead of testing the actual application and workspace.
   - `ci.yml` did not set up CMake/Ninja for Windows, causing build script failures in C dependencies.
2. **Missing System Packages**:
   - Ubuntu runners lacked `libasound2-dev`, `pkg-config`, `libdbus-1-dev`, `libx11-dev`, `libgl1-mesa-dev`.
3. **Audio Fallback**:
   - Rodio/alsa-sys must never panic if an audio device is unavailable in headless CI; the sound engine must degrade to silent no-op.
4. **Display Absence**:
   - Headless screenshot and UI tests on Linux must be invoked under `xvfb-run` to ensure clean windowing/buffer initialization.
5. **Python Resources**:
   - No workflow validated syntax or linting of `resources/python/*.py` (`inspect_blend.py` and `render_runner.py`).

---

## 3. Plan for Consolidated `ci.yml`

Consolidate all checks into a single, unified `.github/workflows/ci.yml`:
1. **fmt & clippy**:
   - `cargo fmt --check`
   - `cargo clippy --all-targets -- -D warnings`
2. **python-lint**:
   - `ruff check resources/python/`
   - `python3 -m py_compile resources/python/*.py`
3. **test (ubuntu-latest & windows-latest)**:
   - Full dependency provisioning (`libasound2-dev`, `pkg-config`, `libdbus-1-dev`, etc. on Ubuntu; `CMake` & `Ninja` with `CMAKE_GENERATOR: "Ninja"` on Windows).
   - Uses `Swatinem/rust-cache@v2`.
   - `xvfb-run cargo test --workspace` on Linux; `cargo test --workspace` on Windows.
4. **build-app (ubuntu-latest, windows-latest, macos-latest [experimental])**:
   - `cargo build --release --workspace`
   - Verifies headless audit: `render-night-gui --headless-audit` or `xvfb-run target/release/render-night-gui --smoke-test`.
   - macOS leg marked `continue-on-error: true` (labelled experimental).
