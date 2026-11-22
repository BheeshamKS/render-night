// Render Night - Phase R3 Verification Suite
// SPDX-License-Identifier: GPL-3.0-or-later

use rn_app::screenshots::run_full_audit_suite;
use rn_app::state::{AppState, ModalState, NavItem};
use rn_core::queue::QueueStatus;
use rn_core::schemas::history::HistoryResult;
use rn_core::schemas::queue_state::PostAction;

#[test]
fn test_history_search_filter_and_readd() {
    let mut state = AppState::new();
    state.load_acceptance_scenario();

    assert_eq!(state.history_entries.len(), 3);

    // Test Search filter
    state.history_search = "commercial".to_string();
    let matches: Vec<_> = state
        .history_entries
        .iter()
        .filter(|e| e.file_name.to_lowercase().contains(&state.history_search))
        .collect();
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].file_name, "commercial_vfx_shot12.blend");

    // Test Status filter
    state.history_search.clear();
    state.history_filter = Some(HistoryResult::Failed);
    let failed_matches: Vec<_> = state
        .history_entries
        .iter()
        .filter(|e| e.result == HistoryResult::Failed)
        .collect();
    assert_eq!(failed_matches.len(), 1);
    assert_eq!(failed_matches[0].file_name, "fluid_simulation_splash.blend");

    // Test Re-add to Queue
    let initial_queue_len = state.queue_state.jobs.len();
    state.readd_history_entry("hist_001");
    assert_eq!(state.queue_state.jobs.len(), initial_queue_len + 1);
    let new_job = state.queue_state.jobs.last().unwrap();
    assert_eq!(new_job.name, "commercial_vfx_shot12.blend");
    assert_eq!(state.active_nav_item, NavItem::Queue);

    // Test Clear History
    state.clear_history();
    assert_eq!(state.history_entries.len(), 0);
}

#[test]
fn test_settings_and_sound_synthesis() {
    let mut state = AppState::new();
    state.load_acceptance_scenario();

    assert_eq!(state.discovered_blenders.len(), 2);
    assert_eq!(state.default_samples, 128);
    assert_eq!(state.default_resolution_pct, 100.0);
    assert_eq!(state.background_thread_limit, 4);
    assert_eq!(state.memory_cache_budget_gb, 4);
    assert_eq!(state.sound_volume, 80);
    assert!(!state.sound_muted);

    // Verify test sound synthesis runs without panic
    state.play_test_sound();

    // Verify mute toggle
    state.sound_muted = true;
    state.play_test_sound();
}

#[test]
fn test_presets_crud_and_import_export() {
    let mut state = AppState::new();
    state.load_acceptance_scenario();

    // Save current job overrides as preset
    let j1 = state.queue_state.jobs[0].id.clone();
    state.set_job_override(&j1, "scene.cycles.samples", serde_json::json!(256));
    let preset = state.save_preset_from_job(&j1, "Archviz Draft 256");
    assert!(preset.is_some());
    assert_eq!(state.presets.len(), 2);

    // Export Presets to JSON
    let json_str = state.export_presets_json();
    assert!(json_str.contains("Archviz Draft 256"));
    assert!(json_str.contains("256"));

    // Import Presets from JSON
    let mut fresh_state = AppState::new();
    let imported_count = fresh_state.import_presets_json(&json_str).unwrap();
    assert_eq!(imported_count, 2);
    assert_eq!(fresh_state.presets.len(), 2);
}

#[test]
fn test_copy_paste_overrides_with_engine_compatibility_skip_report() {
    let mut state = AppState::new();
    state.load_acceptance_scenario();

    // Job 1 is CYCLES, Job 3 is BLENDER_EEVEE_NEXT
    let j1 = state.queue_state.jobs[0].id.clone();
    let j3 = state.queue_state.jobs[2].id.clone();

    // Set Cycles specific override and Common override on Job 1
    state.set_job_override(&j1, "scene.cycles.samples", serde_json::json!(512));
    state.set_job_override(
        &j1,
        "scene.render.resolution_percentage",
        serde_json::json!(50.0),
    );

    // Copy overrides from Job 1
    state.editing_job_id = Some(j1);
    state.copy_selected_overrides();
    assert!(state.copied_overrides.is_some());
    let copied = state.copied_overrides.as_ref().unwrap();
    assert_eq!(copied.len(), 2);

    // Select Job 3 (EEVEE) and Paste overrides
    state.editing_job_id = None;
    state.selected_job_ids.clear();
    state.selected_job_ids.insert(j3.clone());

    state.paste_overrides_to_selected();

    // Incompatible Cycles override must be skipped, common override applied
    let job3 = state.queue_state.jobs.iter().find(|j| j.id == j3).unwrap();
    assert_eq!(
        job3.overrides.get("scene.render.resolution_percentage"),
        Some(&serde_json::json!(50.0))
    );
    assert_eq!(job3.overrides.get("scene.cycles.samples"), None);

    // Skip report modal must be triggered with details of skipped property
    assert!(matches!(
        state.active_modal,
        Some(ModalState::SkipReport { .. })
    ));
    if let Some(ModalState::SkipReport { skipped }) = &state.active_modal {
        assert_eq!(skipped.len(), 1);
        assert_eq!(skipped[0].rna_path, "scene.cycles.samples");
        assert!(skipped[0].reason.contains("not supported by engine"));
    }
}

#[test]
fn test_resume_after_crash_modal_flow() {
    let mut state = AppState::new();
    state.load_acceptance_scenario();
    state.when_finished = PostAction::Shutdown;

    let j1 = state.queue_state.jobs[0].id.clone();
    state.active_modal = Some(ModalState::ResumeAfterCrash {
        job_id: j1.clone(),
        job_name: "scene.blend".to_string(),
        last_frame: 114,
    });

    // Invoke resume after crash
    state.resume_after_crash();

    assert_eq!(state.active_modal, None);
    assert_eq!(state.queue_status, QueueStatus::Running);
    assert_eq!(state.active_job_id.as_deref(), Some(j1.as_str()));

    let job = state.queue_state.jobs.iter().find(|j| j.id == j1).unwrap();
    assert_eq!(job.range.start, 115);
    assert!(job.render_missing_only);

    // Hard safety invariant: post-action must be strictly disarmed to None
    assert_eq!(state.when_finished, PostAction::None);
    assert_eq!(state.queue_state.settings.post_action, PostAction::None);
}

#[test]
fn test_shutdown_countdown_and_disarm_on_keystroke() {
    let mut state = AppState::new();
    state.when_finished = PostAction::Shutdown;
    state.active_modal = Some(ModalState::ShutdownCountdown {
        seconds_remaining: 60,
        action: PostAction::Shutdown,
    });

    // Any keystroke must disarm shutdown countdown immediately
    state.handle_key_event("Space", false, false, false);

    assert_eq!(state.active_modal, None);
    assert_eq!(state.when_finished, PostAction::None);
    assert_eq!(state.queue_state.settings.post_action, PostAction::None);
}

#[test]
fn test_confirm_quit_modal_flow() {
    let mut state = AppState::new();
    state.load_acceptance_scenario();
    state.start_queue();
    assert_eq!(state.queue_status, QueueStatus::Running);

    state.active_modal = Some(ModalState::ConfirmQuit);
    state.confirm_quit();

    assert_eq!(state.queue_status, QueueStatus::Idle);
    assert_eq!(state.when_finished, PostAction::None);
    assert_eq!(state.active_modal, None);
}

#[test]
fn test_keyboard_shortcuts_and_undo_toasts() {
    let mut state = AppState::new();
    state.load_acceptance_scenario();

    let initial_count = state.queue_state.jobs.len();
    assert_eq!(initial_count, 3);

    // Test Ctrl+A (Select All)
    state.handle_key_event("a", true, false, false);
    assert_eq!(state.selected_job_ids.len(), 3);

    // Test Ctrl+D (Duplicate selected)
    state.handle_key_event("d", true, false, false);
    assert_eq!(state.queue_state.jobs.len(), 6);

    // Select 1 job and Delete with Undo
    state.selected_job_ids.clear();
    let to_delete = state.queue_state.jobs[0].id.clone();
    state.selected_job_ids.insert(to_delete.clone());

    state.handle_key_event("Delete", false, false, false);
    assert_eq!(state.queue_state.jobs.len(), 5);
    assert!(!state.queue_state.jobs.iter().any(|j| j.id == to_delete));

    // Verify Undo Toast
    assert_eq!(state.toasts.len(), 1);
    let toast_id = state.toasts[0].id.clone();
    assert!(state.toasts[0].undo_jobs.is_some());

    // Undo removal
    state.undo_removal(&toast_id);
    assert_eq!(state.queue_state.jobs.len(), 6);
    assert_eq!(state.queue_state.jobs[0].id, to_delete);

    // Test ? toggles Shortcuts Cheat Sheet
    assert_eq!(state.active_modal, None);
    state.handle_key_event("?", false, false, false);
    assert_eq!(state.active_modal, Some(ModalState::ShortcutsCheatSheet));
    state.handle_key_event("Escape", false, false, false);
    assert_eq!(state.active_modal, None);
}

#[test]
fn test_full_headless_screenshots_audit() {
    let tmp_dir = std::env::temp_dir().join("rn_r3_audit_screenshots");
    let results = run_full_audit_suite(&tmp_dir);

    assert_eq!(
        results.len(),
        14,
        "All 14 UI screens and modal states must be captured"
    );

    for (name, w, h, pixels) in results {
        assert!(
            pixels > 5000,
            "Screenshot {} ({}x{}) has insufficient rendered pixels ({})",
            name,
            w,
            h,
            pixels
        );
    }
}
