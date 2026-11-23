// Render Night - Real Blender End-to-End Test Suite
// SPDX-License-Identifier: GPL-3.0-or-later

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use rn_core::blender::{discover_all_blenders, inspect_blend, InspectOptions};
use rn_core::persistence::QueuePersistence;
use rn_core::queue::{QueueEngine, QueueEngineOptions, QueueEvent, QueueStatus};
use rn_core::render::gpu_monitor::sample_gpu_utilization;
use rn_core::schemas::queue_state::{Job, JobStatus, PostAction, QueueState, SimpleRange};
use rn_core::sound::synthesize_todung_samples;

fn create_test_dir(name: &str) -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop(); // crates/
    path.pop(); // root/
    path.push("target");
    path.push("e2e_test_scratch");
    path.push(name);
    let _ = fs::remove_dir_all(&path);
    fs::create_dir_all(&path).expect("create test dir");
    path
}

fn resolve_blender_cmd() -> Option<Vec<String>> {
    let blenders = discover_all_blenders(&[]);
    if let Some(b) = blenders.first() {
        return Some(b.executable.clone());
    }
    if Command::new("which")
        .arg("blender")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return Some(vec!["blender".to_string()]);
    }
    None
}

fn python_runner_script() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop(); // crates/
    path.pop(); // root/
    path.push("resources");
    path.push("python");
    path.push("render_runner.py");
    path
}

fn make_test_blend_script() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop(); // crates/
    path.pop(); // root/
    path.push("tools");
    path.push("make-test-blend.py");
    path
}

#[tokio::test]
async fn test_real_blender_e2e_render_pipeline() {
    let Some(blender_cmd) = resolve_blender_cmd() else {
        println!("SKIPPING: No real Blender installation found on test runner host.");
        return;
    };

    println!("Running Real Blender E2E test with: {:?}", blender_cmd);

    let temp_dir = create_test_dir("e2e_pipeline");
    let test_blend = temp_dir.join("cube_scene.blend");

    // 1. Generate real self-contained .blend file using tools/make-test-blend.py
    let make_script = make_test_blend_script();
    let status = Command::new("python3")
        .arg(&make_script)
        .arg(&test_blend)
        .status()
        .expect("Failed to execute make-test-blend.py");
    assert!(status.success(), "make-test-blend.py must exit with 0");
    assert!(test_blend.exists(), "cube_scene.blend must be created");

    // 2. Real Blender Inspection
    let inspect_opts = InspectOptions::default();
    let inspect_result = inspect_blend(&test_blend, &blender_cmd, &inspect_opts)
        .await
        .expect("inspect_blend with real Blender must succeed");

    assert!(!inspect_result.blender_version.is_empty());
    assert_eq!(inspect_result.active_scene, "Scene");
    let scene = inspect_result
        .scenes
        .iter()
        .find(|s| s.name == "Scene")
        .expect("Scene must exist");
    assert_eq!(scene.resolution_x, 32);
    assert_eq!(scene.resolution_y, 32);
    assert_eq!(scene.active_camera.as_deref(), Some("Camera"));
    assert!(
        inspect_result
            .errors
            .as_ref()
            .map(|e| e.is_empty())
            .unwrap_or(true),
        "Inspection should produce 0 errors"
    );

    // 3. Render 3 frames to disk using QueueEngine
    let output_dir = temp_dir.join("frames");
    fs::create_dir_all(&output_dir).unwrap();
    let output_pattern = output_dir
        .join("cube_####.png")
        .to_string_lossy()
        .to_string();

    let app_data = temp_dir.join("app_data");
    let runtime = temp_dir.join("runtime");
    let logs = temp_dir.join("logs");

    let persistence = QueuePersistence::new(&app_data);
    let mut state = QueueState::default();
    state.jobs.push(Job {
        id: "real-e2e-job-1".to_string(),
        blend_path: test_blend.to_string_lossy().to_string(),
        name: "cube_scene.blend".to_string(),
        status: JobStatus::Pending,
        range: SimpleRange {
            start: 1,
            end: 3,
            step: 1,
        },
        range_config: None,
        crash_policy: None,
        render_missing_only: false,
        failed_frames: vec![],
        overrides: Default::default(),
        presets: vec![],
        output_dir: Some(output_dir.to_string_lossy().to_string()),
        output_pattern: Some(output_pattern),
        device: Some("CPU".to_string()),
        engine: Some("CYCLES".to_string()),
        created_at: 1000,
        started_at: None,
        completed_at: None,
        error: None,
        progress: 0.0,
        last_frame: None,
        inspect: None,
        pre_render_hook: None,
        is_basic_mode: None,
        basic_mode_reason: None,
        ignore_all_warnings: None,
        ignored_warning_codes: None,
        ignored_warning_ids: None,
        missing_path_remaps: None,
    });
    persistence.save_state(&state).unwrap();

    let options = QueueEngineOptions {
        app_data_dir: app_data.clone(),
        runtime_dir: runtime.clone(),
        logs_dir: logs.clone(),
        runner_script: python_runner_script(),
        blender_executable: blender_cmd.clone(),
    };

    let (_engine, handle) = QueueEngine::new(options);
    let mut rx = handle.subscribe();

    handle.start().await.expect("Queue start should succeed");

    let mut completed_frames = 0;
    let mut saw_progress = false;
    let timeout_duration = Duration::from_secs(60);
    let start_time = std::time::Instant::now();

    while start_time.elapsed() < timeout_duration {
        if let Ok(ev) = tokio::time::timeout(Duration::from_millis(500), rx.recv()).await {
            match ev {
                Ok(QueueEvent::JobProgress {
                    frame, progress, ..
                }) => {
                    println!(
                        "  ✓ E2E Live Event: Progress={:.1}%, current frame={:?}",
                        progress, frame
                    );
                    saw_progress = true;
                }
                Ok(QueueEvent::JobDone {
                    completed_frames: c,
                    ..
                }) => {
                    completed_frames = c;
                    break;
                }
                Ok(QueueEvent::StateChanged {
                    state: QueueStatus::Idle,
                    ..
                }) if completed_frames >= 3 => {
                    break;
                }
                _ => {}
            }
        }
    }

    assert!(saw_progress, "Live progress events must be observed");
    assert_eq!(completed_frames, 3, "QueueEngine must render all 3 frames");

    // Verify frames exist on disk and are non-empty PNGs
    for f in 1..=3 {
        let frame_path = output_dir.join(format!("cube_{:04}.png", f));
        assert!(
            frame_path.exists(),
            "Rendered frame {} must exist",
            frame_path.display()
        );
        let meta = fs::metadata(&frame_path).expect("Frame metadata");
        assert!(
            meta.len() > 100,
            "Frame file must be a non-empty PNG (was {} bytes)",
            meta.len()
        );

        let bytes = fs::read(&frame_path).expect("Read frame bytes");
        assert_eq!(
            &bytes[0..8],
            b"\x89PNG\r\n\x1a\n",
            "Frame file must start with PNG magic bytes"
        );
    }

    // 4. Test GPU Telemetry
    let gpu_status = sample_gpu_utilization().await;
    println!(
        "  ✓ GPU Telemetry: verified={}, name={:?}, total_mb={:?}",
        gpu_status.verified, gpu_status.name, gpu_status.memory_total_mb
    );
    if gpu_status.verified {
        assert!(
            gpu_status.name.is_some(),
            "GPU name should be populated if verified"
        );
        if let Some(total) = gpu_status.memory_total_mb {
            assert!(total > 0, "GPU total memory must be non-zero");
        }
    }

    // 5. Sound synthesis test: synthesizes todung sound without panic
    let sound_samples = synthesize_todung_samples();
    assert!(
        !sound_samples.is_empty(),
        "Sound synthesis must produce PCM audio samples"
    );
    assert!(sound_samples.len() > 1000);
}

#[tokio::test]
async fn test_real_blender_preflight_missing_assets_classification() {
    let Some(blender_cmd) = resolve_blender_cmd() else {
        println!("SKIPPING: No real Blender installation found on test runner host.");
        return;
    };

    let temp_dir = create_test_dir("e2e_preflight");
    let make_script = make_test_blend_script();

    // 1. Create blend with 1 USED missing texture
    let used_blend = temp_dir.join("used.blend");
    let status_used = Command::new("python3")
        .arg(&make_script)
        .arg(&used_blend)
        .arg("--missing-used")
        .status()
        .expect("make used blend");
    assert!(status_used.success());

    // 2. Create blend with 1 UNUSED missing texture
    let unused_blend = temp_dir.join("unused.blend");
    let status_unused = Command::new("python3")
        .arg(&make_script)
        .arg(&unused_blend)
        .arg("--missing-unused")
        .status()
        .expect("make unused blend");
    assert!(status_unused.success());

    let inspect_opts = InspectOptions::default();

    // Inspect used
    let inspect_used = inspect_blend(&used_blend, &blender_cmd, &inspect_opts)
        .await
        .expect("inspect used blend");
    let missing_used = &inspect_used.missing_files;
    assert_eq!(missing_used.len(), 1, "Should detect 1 missing asset");
    assert_eq!(
        missing_used[0].relevance.as_deref(),
        Some("used"),
        "Missing texture connected to cube shader must be classified as 'used'"
    );

    // Inspect unused
    let inspect_unused = inspect_blend(&unused_blend, &blender_cmd, &inspect_opts)
        .await
        .expect("inspect unused blend");
    let missing_unused = &inspect_unused.missing_files;
    assert_eq!(missing_unused.len(), 1, "Should detect 1 missing asset");
    assert_eq!(
        missing_unused[0].relevance.as_deref(),
        Some("unused"),
        "Unconnected missing datablock must be classified as 'unused'"
    );
}

#[tokio::test]
async fn test_crash_recovery_modal_and_safety_disarm() {
    let mut state = rn_app::state::AppState::new();
    state.add_job(
        "scene_interrupted.blend",
        "/path/scene.blend",
        1,
        100,
        "GPU",
        "CYCLES",
        None,
    );
    let job_id = state.queue_state.jobs[0].id.clone();

    // Simulate crash after rendering frame 42
    state.when_finished = PostAction::Shutdown;
    state.active_modal = Some(rn_app::state::ModalState::ResumeAfterCrash {
        job_id: job_id.clone(),
        job_name: "scene_interrupted.blend".to_string(),
        last_frame: 42,
    });

    // User accepts "Resume after crash"
    state.resume_after_crash();

    let job = &state.queue_state.jobs[0];
    assert_eq!(
        job.range.start, 43,
        "Queue must resume from missing frame (last_frame + 1 = 43)"
    );
    assert_eq!(job.status, JobStatus::Active);
    assert!(job.render_missing_only);

    // Strict safety invariant: post-action MUST be disarmed to None
    assert_eq!(
        state.when_finished,
        PostAction::None,
        "Post-actions must be disarmed on crash recovery"
    );
}
