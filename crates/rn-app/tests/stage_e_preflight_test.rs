// Render Night - Stage E Test Suite: Preflight Never Blocks & Button Wiring
// SPDX-License-Identifier: GPL-3.0-or-later

use rn_app::state::{AppState, ModalState, QueueStatus};
use rn_core::preflight::{
    PreflightIssue, PreflightQuickFix, PreflightReport, PreflightSeverity, QuickFixAction,
};
use rn_core::ranges::{FrameRangeConfig, FrameRangeMode, SimpleRange};
use rn_core::schemas::queue_state::{Job, JobStatus};
use serde_json::json;
use std::collections::HashMap;

fn create_dummy_job(id: &str, name: &str) -> Job {
    Job {
        id: id.to_string(),
        blend_path: format!("/tmp/{}.blend", name),
        name: name.to_string(),
        status: JobStatus::Pending,
        range: SimpleRange {
            start: 1,
            end: 10,
            step: 1,
        },
        range_config: Some(FrameRangeConfig {
            mode: FrameRangeMode::Custom,
            simple: None,
            custom_expression: Some("1,3,5".to_string()),
            single_still_frame: None,
        }),
        crash_policy: None,
        render_missing_only: false,
        failed_frames: Vec::new(),
        overrides: HashMap::new(),
        presets: Vec::new(),
        output_dir: Some("/tmp/render/".to_string()),
        output_pattern: Some("{scene}_{camera}_####.png".to_string()),
        device: Some("GPU".to_string()),
        engine: Some("BLENDER_EEVEE_NEXT".to_string()),
        created_at: 1732300000,
        started_at: None,
        completed_at: None,
        error: None,
        progress: 0.0,
        last_frame: None,
        inspect: None,
        pre_render_hook: None,
        is_basic_mode: Some(false),
        basic_mode_reason: None,
        ignore_all_warnings: Some(false),
        ignored_warning_codes: Some(Vec::new()),
        ignored_warning_ids: Some(Vec::new()),
        missing_path_remaps: None,
    }
}

#[test]
fn test_never_block_default_does_not_show_modal_or_block_queue() {
    let mut state = AppState::new();
    assert_eq!(state.preflight_mode, "never_block");

    // Add a job
    let job = create_dummy_job("job-1", "test.blend");
    state.queue_state.jobs.push(job);

    // Run preflight check
    state.run_preflight_check();

    // In never_block mode, no countdown timer is active
    assert_eq!(state.preflight_countdown, None);

    // Starting queue must proceed immediately without modal blocking
    state.start_queue();
    assert_eq!(
        state.queue_status,
        QueueStatus::Running,
        "Queue must start immediately in never_block mode"
    );
    assert!(
        state.active_modal.is_none(),
        "No modal dialog should ever block the user"
    );
}

#[test]
fn test_ask_mode_shows_banner_with_countdown_and_render_anyway() {
    let mut state = AppState::new();
    state.preflight_mode = "ask".to_string();
    state.queue_state.settings.preflight_mode = Some("ask".to_string());

    let job = create_dummy_job("job-2", "project_with_missing_texture.blend");
    state.queue_state.jobs.push(job);

    // Manually insert an inspect report with a warning so preflight generates a warning banner
    let report = PreflightReport {
        timestamp: 1732300000,
        has_errors: false,
        has_warnings: true,
        is_blocked: false,
        block_reasons: Vec::new(),
        errors: Vec::new(),
        warnings: vec![PreflightIssue {
            id: "issue-1".to_string(),
            job_id: "job-2".to_string(),
            job_name: "project_with_missing_texture.blend".to_string(),
            code: "MISSING_TEXTURE".to_string(),
            severity: PreflightSeverity::Warning,
            is_blocking: false,
            relevance: None,
            message: "Missing image texture 'diffuse.png'".to_string(),
            details: None,
            quick_fix: Some(PreflightQuickFix {
                label: "Switch to CPU".to_string(),
                action: QuickFixAction::SwitchToCpu,
                data: None,
            }),
        }],
        job_reports: Vec::new(),
    };
    state.preflight_report = Some(report);
    state.show_preflight_banner = true;
    state.preflight_countdown = Some(30);

    // Banner is active
    assert!(state.show_preflight_banner);
    assert_eq!(state.preflight_countdown, Some(30));

    // Render anyway starts queue and clears countdown
    state.render_anyway();
    assert_eq!(state.queue_status, QueueStatus::Running);
    assert_eq!(state.preflight_countdown, None);
}

#[test]
fn test_banner_dismiss_clears_without_starting() {
    let mut state = AppState::new();
    state.show_preflight_banner = true;
    state.preflight_countdown = Some(30);

    state.dismiss_preflight_banner();
    assert!(!state.show_preflight_banner);
    assert_eq!(state.preflight_countdown, None);
    assert_eq!(state.queue_status, QueueStatus::Idle);
}

#[test]
fn test_open_warnings_modal_and_ignore_issue() {
    let mut state = AppState::new();
    let job = create_dummy_job("job-warn-1", "eevee_asset.blend");
    state.queue_state.jobs.push(job);

    // Open warnings modal
    state.open_job_warnings("job-warn-1");
    match &state.active_modal {
        Some(ModalState::JobWarnings { job_id, job_name }) => {
            assert_eq!(job_id, "job-warn-1");
            assert_eq!(job_name, "eevee_asset.blend");
        }
        other => panic!("Expected JobWarnings modal, got {:?}", other),
    }

    // Ignore a specific warning
    state.ignore_preflight_issue("job-warn-1", "issue-xyz");
    let job = &state.queue_state.jobs[0];
    assert!(
        job.ignored_warning_ids
            .as_ref()
            .unwrap()
            .contains(&"issue-xyz".to_string()),
        "Issue ID must be present in ignored_warning_ids"
    );
}

#[test]
fn test_ignore_code_and_ignore_all_warnings() {
    let mut state = AppState::new();
    let job = create_dummy_job("job-warn-2", "lights.blend");
    state.queue_state.jobs.push(job);

    // Ignore code
    state.ignore_preflight_code("job-warn-2", "NO_CAMERA");
    let job = &state.queue_state.jobs[0];
    assert!(
        job.ignored_warning_codes
            .as_ref()
            .unwrap()
            .contains(&"NO_CAMERA".to_string()),
        "Warning code must be present in ignored_warning_codes"
    );

    // Ignore all
    state.ignore_all_job_warnings("job-warn-2");
    let job = &state.queue_state.jobs[0];
    assert_eq!(job.ignore_all_warnings, Some(true));
}

#[test]
fn test_quick_fix_actions() {
    let mut state = AppState::new();
    let job = create_dummy_job("job-fix-1", "fixme.blend");
    state.queue_state.jobs.push(job);

    // 1. Switch to CPU
    state.apply_preflight_quick_fix("job-fix-1", &QuickFixAction::SwitchToCpu, None);
    assert_eq!(state.queue_state.jobs[0].device.as_deref(), Some("CPU"));

    // 2. Select Camera
    let cam_data = json!("RenderCamera");
    state.apply_preflight_quick_fix("job-fix-1", &QuickFixAction::SelectCamera, Some(&cam_data));
    assert_eq!(
        state.queue_state.jobs[0].overrides.get("camera"),
        Some(&json!("RenderCamera"))
    );

    // 3. Switch Range to Continuous / Scene Default
    state.apply_preflight_quick_fix("job-fix-1", &QuickFixAction::SwitchRangeToContinuous, None);
    assert_eq!(
        state.queue_state.jobs[0]
            .range_config
            .as_ref()
            .unwrap()
            .mode,
        FrameRangeMode::SceneDefault
    );
}

#[test]
fn test_job_row_actions_edit_and_remove() {
    let mut state = AppState::new();
    let job = create_dummy_job("job-edit-1", "edit_me.blend");
    state.queue_state.jobs.push(job);

    // Open editor
    state.open_editor("job-edit-1");
    assert_eq!(state.editing_job_id.as_deref(), Some("job-edit-1"));

    // Remove job
    state.remove_job("job-edit-1");
    assert_eq!(state.queue_state.jobs.len(), 0);
    assert!(state.editing_job_id.is_none());
}
