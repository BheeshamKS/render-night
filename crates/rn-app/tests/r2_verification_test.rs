// Render Night - Phase R2 Integration & UI Verification Suite
// SPDX-License-Identifier: GPL-3.0-or-later

use rn_app::screenshots::capture_view;
use rn_app::state::{AppState, DockTab};
use rn_core::queue::{QueueEvent, QueueStatus};
use rn_core::schemas::queue_state::JobStatus;

#[test]
fn test_acceptance_scenario_clean_non_blocking_warnings() {
    let mut state = AppState::new();
    state.load_acceptance_scenario();
    assert_eq!(state.queue_state.jobs.len(), 3);
    assert!(state.preflight_report.is_some());
    let report = state.preflight_report.as_ref().unwrap();
    assert_eq!(
        report.errors.len(),
        0,
        "Acceptance scenario must have zero blocking errors"
    );
    assert!(
        !report.warnings.is_empty(),
        "Acceptance scenario exhibits non-blocking warnings"
    );
    assert!(
        !report.is_blocked,
        "Queue must never be blocked in acceptance scenario"
    );
}

#[test]
fn test_acceptance_criteria_drop_3_files_start_in_2_actions() {
    let mut state = AppState::new();
    assert_eq!(state.queue_state.jobs.len(), 0);
    assert_eq!(state.queue_status, QueueStatus::Idle);

    // Action 1: Add/drop 3 files
    let j1 = state.add_job(
        "scene_01.blend",
        "/projects/scene_01.blend",
        1,
        100,
        "GPU · OptiX",
        "CYCLES",
        None,
    );
    let _j2 = state.add_job(
        "scene_02.blend",
        "/projects/scene_02.blend",
        1,
        250,
        "GPU · CUDA",
        "CYCLES",
        None,
    );
    let _j3 = state.add_job(
        "scene_03.blend",
        "/projects/scene_03.blend",
        50,
        150,
        "CPU",
        "BLENDER_EEVEE_NEXT",
        None,
    );

    assert_eq!(state.queue_state.jobs.len(), 3);
    assert_eq!(state.queue_state.jobs[0].status, JobStatus::Inspecting);
    assert_eq!(state.queue_state.jobs[1].status, JobStatus::Inspecting);
    assert_eq!(state.queue_state.jobs[2].status, JobStatus::Inspecting);

    // Action 2: Press Start Queue
    state.start_queue();

    // Verify queue is actively rendering job 1
    assert_eq!(state.queue_status, QueueStatus::Running);
    assert_eq!(state.active_job_id.as_deref(), Some(j1.as_str()));
    assert_eq!(state.queue_state.jobs[0].status, JobStatus::Active);
    assert_eq!(state.queue_state.jobs[1].status, JobStatus::Inspecting);
    assert_eq!(state.queue_state.jobs[2].status, JobStatus::Inspecting);

    // Verify pause and resume
    state.pause_queue();
    assert_eq!(state.queue_status, QueueStatus::Paused);
    assert_eq!(state.queue_state.jobs[0].status, JobStatus::Paused);

    state.start_queue(); // Resume
    assert_eq!(state.queue_status, QueueStatus::Running);

    state.stop_queue();
    assert_eq!(state.queue_status, QueueStatus::Idle);
    assert_eq!(state.active_job_id, None);
}

#[test]
fn test_change_one_job_overrides_without_affecting_others() {
    let mut state = AppState::new();

    let j1 = state.add_job("job1.blend", "/p/job1.blend", 1, 100, "GPU", "CYCLES", None);
    let j2 = state.add_job("job2.blend", "/p/job2.blend", 1, 100, "GPU", "CYCLES", None);
    let j3 = state.add_job("job3.blend", "/p/job3.blend", 1, 100, "CPU", "CYCLES", None);

    // Initial state: no overrides on any job
    assert!(state.queue_state.jobs[0].overrides.is_empty());
    assert!(state.queue_state.jobs[1].overrides.is_empty());
    assert!(state.queue_state.jobs[2].overrides.is_empty());

    // Modify Job 1: samples = 512, resolution_percentage = 50.0
    state.set_job_override(&j1, "scene.cycles.samples", serde_json::json!(512));
    state.set_job_override(
        &j1,
        "scene.render.resolution_percentage",
        serde_json::json!(50.0),
    );

    // Verify only Job 1 was modified
    let job1 = state.queue_state.jobs.iter().find(|j| j.id == j1).unwrap();
    let job2 = state.queue_state.jobs.iter().find(|j| j.id == j2).unwrap();
    let job3 = state.queue_state.jobs.iter().find(|j| j.id == j3).unwrap();

    assert_eq!(job1.overrides.len(), 2);
    assert_eq!(
        job1.overrides.get("scene.cycles.samples"),
        Some(&serde_json::json!(512))
    );
    assert_eq!(
        job1.overrides.get("scene.render.resolution_percentage"),
        Some(&serde_json::json!(50.0))
    );

    assert!(
        job2.overrides.is_empty(),
        "Job 2 must remain completely unaffected"
    );
    assert!(
        job3.overrides.is_empty(),
        "Job 3 must remain completely unaffected"
    );

    // Test Reset of a single override
    state.reset_job_override(&j1, "scene.cycles.samples");
    let job1_after = state.queue_state.jobs.iter().find(|j| j.id == j1).unwrap();
    assert_eq!(job1_after.overrides.len(), 1);
    assert_eq!(
        job1_after
            .overrides
            .get("scene.render.resolution_percentage"),
        Some(&serde_json::json!(50.0))
    );

    // Test Reset of all overrides
    state.reset_all_job_overrides(&j1);
    let job1_reset = state.queue_state.jobs.iter().find(|j| j.id == j1).unwrap();
    assert!(job1_reset.overrides.is_empty());
}

#[test]
fn test_device_badge_and_progress_at_a_glance() {
    let mut state = AppState::new();
    let j1 = state.add_job(
        "gpu_job.blend",
        "/p/gpu.blend",
        1,
        100,
        "GPU · RTX 4090",
        "CYCLES",
        Some(rn_mock_blender::fixtures::create_default_inspect_output(
            "/p/gpu.blend",
        )),
    );
    let j2 = state.add_job(
        "cpu_job.blend",
        "/p/cpu.blend",
        1,
        50,
        "CPU",
        "BLENDER_EEVEE_NEXT",
        Some(rn_mock_blender::fixtures::create_default_inspect_output(
            "/p/cpu.blend",
        )),
    );

    let job1 = state.queue_state.jobs.iter().find(|j| j.id == j1).unwrap();
    let job2 = state.queue_state.jobs.iter().find(|j| j.id == j2).unwrap();

    assert_eq!(job1.device.as_deref(), Some("GPU · RTX 4090"));
    assert_eq!(job2.device.as_deref(), Some("CPU"));

    // Check effective settings formatting
    let s1 = state.effective_settings_summary(job1);
    assert!(s1.contains("GPU · RTX 4090"));
    assert!(s1.contains("1..100 (100 f)"));
    assert!(s1.contains("Cycles"));

    let s2 = state.effective_settings_summary(job2);
    assert!(s2.contains("CPU"));
    assert!(s2.contains("1..50 (50 f)"));
}

#[test]
fn test_multi_selection_and_bulk_actions() {
    let mut state = AppState::new();
    let j1 = state.add_job("j1.blend", "/p/j1.blend", 1, 100, "GPU", "CYCLES", None);
    let j2 = state.add_job("j2.blend", "/p/j2.blend", 1, 100, "GPU", "CYCLES", None);
    let _j3 = state.add_job("j3.blend", "/p/j3.blend", 1, 100, "GPU", "CYCLES", None);

    assert_eq!(state.selected_job_ids.len(), 0);

    // Multi-select 2 jobs
    state.toggle_select_job(&j1);
    state.toggle_select_job(&j2);
    assert_eq!(state.selected_job_ids.len(), 2);

    // Bulk set samples to 256
    state.bulk_set_samples(256);
    assert_eq!(
        state.queue_state.jobs[0]
            .overrides
            .get("scene.cycles.samples"),
        Some(&serde_json::json!(256))
    );
    assert_eq!(
        state.queue_state.jobs[1]
            .overrides
            .get("scene.cycles.samples"),
        Some(&serde_json::json!(256))
    );
    assert!(
        state.queue_state.jobs[2].overrides.is_empty(),
        "Unselected job 3 must remain untouched"
    );

    // Bulk set engine to EEVEE
    state.bulk_set_engine("BLENDER_EEVEE_NEXT");
    assert_eq!(
        state.queue_state.jobs[0].engine.as_deref(),
        Some("BLENDER_EEVEE_NEXT")
    );
    assert_eq!(
        state.queue_state.jobs[1].engine.as_deref(),
        Some("BLENDER_EEVEE_NEXT")
    );
    assert_eq!(state.queue_state.jobs[2].engine.as_deref(), Some("CYCLES"));

    // Select all & deselect all
    state.select_all();
    assert_eq!(state.selected_job_ids.len(), 3);
    state.deselect_all();
    assert_eq!(state.selected_job_ids.len(), 0);
}

#[test]
fn test_preflight_non_modal_behavior() {
    let mut state = AppState::new();

    // Create an actual temp blend file so BLEND_NOT_FOUND blocking condition is NOT triggered
    let temp_blend = std::env::temp_dir().join("test_preflight_asset.blend");
    std::fs::write(&temp_blend, b"BLENDER_V402").unwrap();

    // Add job with inspect data containing missing texture asset
    let _j1 = state.add_job(
        "missing_asset.blend",
        temp_blend.to_str().unwrap(),
        1,
        100,
        "GPU",
        "CYCLES",
        Some(
            rn_mock_blender::fixtures::create_missing_assets_inspect_output(
                temp_blend.to_str().unwrap(),
            ),
        ),
    );

    assert!(state.preflight_report.is_some());
    let report = state.preflight_report.as_ref().unwrap();

    // MISSING_ASSETS warning should exist but is never blocking
    assert!(report.has_warnings);
    assert!(
        !report.is_blocked,
        "Preflight must never block unattended queue for non-fatal warnings"
    );

    // Non-modal banner is visible
    assert!(state.show_preflight_banner);

    // Render anyway starts queue immediately
    state.render_anyway();
    assert!(!state.show_preflight_banner);
    assert_eq!(state.queue_status, QueueStatus::Running);

    std::fs::remove_file(temp_blend).ok();
}

#[test]
fn test_core_events_dispatch_and_throttling() {
    let mut state = AppState::new();
    let j1 = state.add_job(
        "render_test.blend",
        "/p/render_test.blend",
        1,
        200,
        "GPU",
        "CYCLES",
        None,
    );

    // 1. State change event
    state.handle_queue_event(QueueEvent::StateChanged {
        state: QueueStatus::Running,
        active_job_id: Some(j1.clone()),
    });
    assert_eq!(state.queue_status, QueueStatus::Running);
    assert_eq!(state.active_job_id.as_deref(), Some(j1.as_str()));

    // 2. Job start event
    state.handle_queue_event(QueueEvent::JobStart {
        job_id: j1.clone(),
        total_frames: 200,
        frames: (1..=200).collect(),
    });
    assert_eq!(state.current_frame, Some((1, 200)));

    // 3. High-frequency Progress events
    state.handle_queue_event(QueueEvent::JobProgress {
        job_id: j1.clone(),
        frame: Some(42),
        sample_current: Some(64),
        sample_total: Some(128),
        progress: 0.21,
        eta_seconds: Some(180),
    });
    assert_eq!(state.queue_state.jobs[0].progress, 0.21);
    assert_eq!(state.queue_state.jobs[0].last_frame, Some(42));
    assert_eq!(state.current_sample, Some((64, 128)));
    assert_eq!(state.current_frame, Some((42, 200)));
    assert_eq!(state.eta_seconds, Some(180));

    // 4. Log line event
    state.handle_queue_event(QueueEvent::LogLine {
        job_id: j1.clone(),
        stream: "stdout".to_string(),
        line: "Fra:42 Mem:128.0M | Rendered 64/128 Tiles".to_string(),
        is_error: false,
    });
    assert_eq!(state.console_logs.len(), 1);
    assert_eq!(
        state.console_logs[0].line,
        "Fra:42 Mem:128.0M | Rendered 64/128 Tiles"
    );

    // 5. Job done event
    state.handle_queue_event(QueueEvent::JobDone {
        job_id: j1,
        status: rn_core::schemas::history::HistoryResult::Completed,
        completed_frames: 200,
        failed_frames: 0,
    });
    assert_eq!(state.queue_state.jobs[0].status, JobStatus::Done);
    assert_eq!(state.queue_state.jobs[0].progress, 1.0);
}

#[test]
fn test_long_and_non_latin_filenames() {
    let mut state = AppState::new();

    let names = [
        "ASCII_normal_scene_01.blend",
        "production_render_shot_042_sequence_lighting_final_v098_with_compositing_passes.blend",
        "منظر_رینڈر_رات_کمرہ_نمبر_ایک.blend",       // Urdu
        "夜のレンダリング_シーン01_メカ設計.blend", // Japanese
        "太空站内部_夜间渲染_最终版.blend",         // Chinese
        "🎬_Render_Night_✨_Final_Render_🚀.blend", // Emoji
    ];

    for name in &names {
        let j = state.add_job(
            name,
            &format!("/scenes/{}", name),
            1,
            100,
            "GPU",
            "CYCLES",
            None,
        );
        let job = state
            .queue_state
            .jobs
            .iter()
            .find(|job| job.id == j)
            .unwrap();
        assert_eq!(job.name, *name);
        let summary = state.effective_settings_summary(job);
        assert!(!summary.is_empty());
    }
    assert_eq!(state.queue_state.jobs.len(), 6);
}

#[test]
fn test_headless_screenshots_1100x700_1280x800_1920x1080() {
    let mut state = AppState::new();
    state.load_acceptance_scenario();

    let tmp_dir = std::env::temp_dir().join("rn_app_test_screenshots");
    std::fs::create_dir_all(&tmp_dir).unwrap();

    // 1100x700
    let path_1100 = tmp_dir.join("test_1100x700.png");
    let (w1, h1, p1) = capture_view(&state, 1100, 700, &path_1100);
    assert_eq!(w1, 1100);
    assert_eq!(h1, 700);
    assert!(
        p1 > 500_000,
        "Rendered pixels should cover view (actual: {})",
        p1
    );
    assert!(path_1100.exists());

    // 1280x800 with expanded dock
    state.monitor_expanded = true;
    state.active_dock_tab = DockTab::FrameTimes;
    let path_1280 = tmp_dir.join("test_1280x800.png");
    let (w2, h2, p2) = capture_view(&state, 1280, 800, &path_1280);
    assert_eq!(w2, 1280);
    assert_eq!(h2, 800);
    assert!(
        p2 > 700_000,
        "Rendered pixels should cover view (actual: {})",
        p2
    );
    assert!(path_1280.exists());

    // 1920x1080 with editor drawer open
    if let Some(j) = state.queue_state.jobs.first() {
        state.editing_job_id = Some(j.id.clone());
    }
    let path_1920 = tmp_dir.join("test_1920x1080.png");
    let (w3, h3, p3) = capture_view(&state, 1920, 1080, &path_1920);
    assert_eq!(w3, 1920);
    assert_eq!(h3, 1080);
    assert!(
        p3 > 1_500_000,
        "Rendered pixels should cover view (actual: {})",
        p3
    );
    assert!(path_1920.exists());
}
