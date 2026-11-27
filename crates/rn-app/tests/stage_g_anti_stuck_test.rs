// Render Night - Stage G Anti-Stuck & Diagnostics Tests
// SPDX-License-Identifier: GPL-3.0-or-later

use rn_app::state::{AppState, ModalState};
use rn_app::watchdog::{is_stalled, last_ui_tick, record_ui_tick};

#[test]
fn test_system_diagnostics_report_generation() {
    let report = rn_core::diagnostics::run_diagnostics(None);
    assert_eq!(report.version, env!("CARGO_PKG_VERSION"));
    assert!(!report.timestamp.is_empty());

    let md = report.to_markdown();
    assert!(
        md.contains("# Render Night Diagnostic Report"),
        "Missing report title"
    );
    assert!(
        md.contains("## 1. Blender Installations"),
        "Missing Blender section"
    );
    assert!(
        md.contains("## 2. Bundled Python Scripts"),
        "Missing Python Scripts section"
    );
    assert!(
        md.contains("## 3. File Picker Subsystem"),
        "Missing File Picker section"
    );
    assert!(
        md.contains("## 4. Audio Subsystem"),
        "Missing Audio section"
    );
    assert!(
        md.contains("## 5. GPU & Compute Device"),
        "Missing GPU section"
    );
    assert!(
        md.contains("## 6. Output Storage & Filesystem"),
        "Missing Storage section"
    );

    // Audio & Todung chime check
    assert!(
        report.audio.todung_synth_ready,
        "Todung chime synthesizer must be ready"
    );
    assert!(
        report.audio.samples_count > 0,
        "Synthesizer must produce PCM samples"
    );

    // Storage write check
    assert!(
        report.storage.is_writable,
        "Current directory should be writable"
    );
}

#[test]
fn test_system_diagnostics_with_custom_target_dir() {
    let temp = tempfile::tempdir().expect("Failed to create tempdir");
    let report = rn_core::diagnostics::run_diagnostics(Some(temp.path()));
    assert_eq!(report.storage.path, temp.path());
    assert!(report.storage.is_writable);
}

#[test]
fn test_gui_diagnostics_modal_flow() {
    let mut state = AppState::new();
    assert!(state.active_modal.is_none());

    // 1. Open diagnostics modal
    state.open_diagnostics();
    let modal = state.active_modal.clone().expect("Modal should be active");
    let (report_text, copied) = match modal {
        ModalState::DiagnosticsReport { report, copied } => (report, copied),
        _ => panic!("Expected ModalState::DiagnosticsReport, got {:?}", modal),
    };
    assert!(!copied, "Initial copied status should be false");
    assert!(
        report_text.contains("# Render Night Diagnostic Report"),
        "Report markdown must be populated in modal"
    );

    // 2. Trigger copy diagnostics report
    state.copy_diagnostics_report();
    let updated_modal = state
        .active_modal
        .clone()
        .expect("Modal should still be active");
    match updated_modal {
        ModalState::DiagnosticsReport { copied: true, .. } => {}
        _ => panic!("Expected copied=true after copy_diagnostics_report"),
    }
    assert!(
        state
            .toasts
            .iter()
            .any(|t| t.message.contains("copied to clipboard")),
        "Toast notification must confirm clipboard copy"
    );

    // 3. Press Escape to dismiss modal
    state.handle_key_event("Escape", false, false, false);
    assert!(
        state.active_modal.is_none(),
        "Escape key must dismiss modal"
    );
}

#[test]
fn test_panic_hook_log_path() {
    let path = rn_app::panic_hook::get_panic_log_path();
    assert!(
        path.to_string_lossy().ends_with("panic.log"),
        "Panic log path must end with panic.log"
    );
}

#[test]
fn test_ui_watchdog_heartbeat() {
    record_ui_tick();
    let tick = last_ui_tick();
    assert!(tick > 0, "UI tick timestamp must be recorded");
    assert!(!is_stalled(), "Fresh UI tick must not be stalled");
}
