// Render Night - Stage D Test Suite: Instant Row Insertion & Inspect Pipeline
// SPDX-License-Identifier: GPL-3.0-or-later

use rn_app::state::{AppState, ModalState};
use rn_core::blender::{
    ensure_extracted_scripts, resolve_inspect_script_path, resolve_render_runner_script_path,
};
use rn_core::process::{sanitize_child_env, sanitize_tokio_env};
use rn_core::schemas::queue_state::JobStatus;
use std::path::PathBuf;
use std::time::Instant;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("tests/fixtures")
}

#[test]
fn test_instant_row_insertion_under_100ms() {
    let mut state = AppState::new();
    let blank_path = fixtures_dir().join("blank.blend");

    let start = Instant::now();
    state.add_blend_files(vec![blank_path.clone()]);
    let elapsed = start.elapsed();

    // MUST appear within 100ms
    assert!(
        elapsed.as_millis() < 100,
        "Row insertion took {:?}, must be under 100ms",
        elapsed
    );

    // Queue count must NEVER be 0
    assert_eq!(state.queue_state.jobs.len(), 1);
    let job = &state.queue_state.jobs[0];

    // Status must be Inspecting with animated skeleton / indicator
    assert_eq!(job.status, JobStatus::Inspecting);
    assert_eq!(job.name, "blank.blend");

    // Effective settings summary indicates active analysis
    let summary = state.effective_settings_summary(job);
    assert!(summary.contains("Analyzing scenes, frame ranges, and asset dependencies"));
}

#[test]
fn test_embedded_scripts_extraction_and_resolution() {
    let scripts_dir = ensure_extracted_scripts().expect("Script extraction must succeed");
    assert!(scripts_dir.exists(), "Scripts dir must exist");

    let inspect_path = scripts_dir.join("inspect_blend.py");
    let runner_path = scripts_dir.join("render_runner.py");

    assert!(inspect_path.exists(), "inspect_blend.py must exist");
    assert!(runner_path.exists(), "render_runner.py must exist");

    // Check non-empty content
    let inspect_content = std::fs::read(&inspect_path).unwrap();
    let runner_content = std::fs::read(&runner_path).unwrap();
    assert!(!inspect_content.is_empty());
    assert!(!runner_content.is_empty());

    // Check unix permissions 0755
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::metadata(&inspect_path).unwrap().permissions();
        assert_eq!(perms.mode() & 0o777, 0o755);
        let perms_r = std::fs::metadata(&runner_path).unwrap().permissions();
        assert_eq!(perms_r.mode() & 0o777, 0o755);
    }

    // Resolvers must return the extracted path
    let resolved_inspect = resolve_inspect_script_path(None);
    assert!(resolved_inspect.exists());
    let resolved_runner = resolve_render_runner_script_path(None);
    assert!(resolved_runner.exists());
}

#[test]
fn test_child_environment_sanitization() {
    // 1. std::process::Command
    let mut std_cmd = std::process::Command::new("true");
    std_cmd.env("APPDIR", "/tmp/.mount_render123");
    std_cmd.env("APPIMAGE", "/home/user/render-night.AppImage");
    std_cmd.env("ARGV0", "render-night");
    std_cmd.env("OWD", "/home/user");
    std_cmd.env("PYTHONHOME", "/tmp/.mount_render123/usr");
    std_cmd.env("PYTHONPATH", "/tmp/.mount_render123/usr/lib");
    std_cmd.env("GIO_MODULE_DIR", "/tmp/.mount_render123/gio");

    sanitize_child_env(&mut std_cmd);

    // 2. tokio::process::Command
    let mut tokio_cmd = tokio::process::Command::new("true");
    tokio_cmd.env("APPDIR", "/tmp/.mount_render123");
    tokio_cmd.env("APPIMAGE", "/home/user/render-night.AppImage");
    tokio_cmd.env("PYTHONHOME", "/tmp/.mount_render123/usr");

    sanitize_tokio_env(&mut tokio_cmd);
}

fn ensure_blender_configured(state: &mut AppState) {
    if std::env::var("RN_BLENDER_BIN").is_ok() {
        return;
    }
    let cmd = state.get_blender_cmd();
    let has_real = if let Some(exe) = cmd.first() {
        if exe == "flatpak" || std::path::Path::new(exe).exists() {
            true
        } else if let Ok(path_var) = std::env::var("PATH") {
            std::env::split_paths(&path_var).any(|p| p.join(exe).is_file())
        } else {
            false
        }
    } else {
        false
    };

    if !has_real {
        let mut mock_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        mock_path.pop();
        mock_path.pop();
        mock_path.push("target");
        mock_path.push("debug");
        mock_path.push(format!("rn-mock-blender{}", std::env::consts::EXE_SUFFIX));
        if mock_path.exists() {
            state.discovered_blenders = vec![rn_core::blender::discovery::BlenderInstallation {
                id: "mock-blender".to_string(),
                executable: vec![mock_path.to_string_lossy().to_string()],
                display_path: mock_path.to_string_lossy().to_string(),
                version: "4.2.0".to_string(),
                major: 4,
                minor: 2,
                patch: 0,
                is_portable: false,
                source: rn_core::blender::discovery::BlenderSource::Custom,
            }];
        }
    }
}

#[test]
fn test_blank_fixture_inspect_clean_zero_warnings() {
    let mut state = AppState::new();
    ensure_blender_configured(&mut state);
    let blank_path = fixtures_dir().join("blank.blend");
    if !blank_path.exists() {
        return;
    }

    state.add_blend_files(vec![blank_path.clone()]);
    assert_eq!(state.queue_state.jobs.len(), 1);
    let job_id = state.queue_state.jobs[0].id.clone();

    // Run inspect synchronously
    state.inspect_job_sync(&job_id);

    let job = state
        .queue_state
        .jobs
        .iter()
        .find(|j| j.id == job_id)
        .unwrap();
    assert_eq!(job.status, JobStatus::Pending);
    assert_eq!(job.is_basic_mode, Some(false));
    assert_eq!(job.basic_mode_reason, None);

    // Frame range must be 1..3 for blank.blend
    assert_eq!(job.range.start, 1);
    assert_eq!(job.range.end, 3);

    // Preflight report must have ZERO warnings
    assert!(state.preflight_report.is_some());
    let report = state.preflight_report.as_ref().unwrap();
    let job_warnings: Vec<_> = report
        .warnings
        .iter()
        .filter(|w| w.job_id == job_id)
        .collect();
    assert!(
        job_warnings.is_empty(),
        "blank.blend must produce 0 warnings, found: {:?}",
        job_warnings
    );
}

#[test]
fn test_corrupt_blend_fallback_to_basic_mode() {
    let mut state = AppState::new();
    let corrupt_path = fixtures_dir().join("corrupt.blend");

    state.add_blend_files(vec![corrupt_path.clone()]);
    assert_eq!(state.queue_state.jobs.len(), 1);
    let job_id = state.queue_state.jobs[0].id.clone();

    // Inspect synchronously
    state.inspect_job_sync(&job_id);

    let job = state
        .queue_state
        .jobs
        .iter()
        .find(|j| j.id == job_id)
        .unwrap();
    // Row remains in queue
    assert_eq!(job.status, JobStatus::Pending);
    // Marked as Basic Mode
    assert_eq!(job.is_basic_mode, Some(true));
    assert!(job.basic_mode_reason.is_some());

    // Basic Mode summary
    let summary = state.effective_settings_summary(job);
    assert!(summary.contains("Basic Mode"));
}

#[test]
fn test_inspect_crash_blend_fallback_to_basic_mode() {
    let mut state = AppState::new();
    let crash_path = fixtures_dir().join("inspect-crash.blend");

    state.add_blend_files(vec![crash_path.clone()]);
    assert_eq!(state.queue_state.jobs.len(), 1);
    let job_id = state.queue_state.jobs[0].id.clone();

    // Inspect synchronously
    state.inspect_job_sync(&job_id);

    let job = state
        .queue_state
        .jobs
        .iter()
        .find(|j| j.id == job_id)
        .unwrap();
    assert_eq!(job.status, JobStatus::Pending);
    assert_eq!(job.is_basic_mode, Some(true));
    assert!(job.basic_mode_reason.is_some());
}

#[test]
fn test_basic_mode_drawer_modal_open_and_close() {
    let mut state = AppState::new();
    let corrupt_path = fixtures_dir().join("corrupt.blend");

    state.add_blend_files(vec![corrupt_path]);
    let job_id = state.queue_state.jobs[0].id.clone();
    state.inspect_job_sync(&job_id);

    // Open basic mode details
    state.open_basic_mode_details(&job_id);
    assert!(matches!(
        state.active_modal,
        Some(ModalState::BasicModeDetails { .. })
    ));

    if let Some(ModalState::BasicModeDetails {
        ref job_name,
        ref reason,
        ref log_path,
        ..
    }) = state.active_modal
    {
        assert_eq!(job_name, "corrupt.blend");
        assert!(!reason.is_empty());
        assert!(log_path.to_string_lossy().contains("event-trace.log"));
    }

    // Close modal
    state.active_modal = None;
    assert!(state.active_modal.is_none());
}
