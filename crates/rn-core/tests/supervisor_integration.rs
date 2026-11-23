// Render Night - Supervisor Integration Tests
// SPDX-License-Identifier: GPL-3.0-or-later

use rn_core::render::{RunnerSupervisor, SupervisorEvent, SupervisorJobConfig};
use rn_core::schemas::history::HistoryResult;
use rn_core::schemas::override_schema::{CrashPolicy, DevicePreferences};
use std::collections::HashMap;
use std::path::PathBuf;
use tempfile::tempdir;
use tokio::sync::mpsc;

fn mock_blender_bin() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop(); // crates/
    path.pop(); // root/
    path.push("target");
    path.push("debug");
    path.push(format!("rn-mock-blender{}", std::env::consts::EXE_SUFFIX));
    path
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

#[tokio::test]
async fn test_supervisor_normal_render_mock_blender() {
    let mock_bin = mock_blender_bin();
    assert!(mock_bin.exists(), "mock blender binary must exist");

    let temp = tempdir().expect("tempdir");
    let out_dir = temp.path().join("output");
    let runtime_dir = temp.path().join("runtime");
    let logs_dir = temp.path().join("logs");
    let blend_path = temp.path().join("test.blend");
    std::fs::write(&blend_path, b"BLENDER_v402").unwrap();

    let config = SupervisorJobConfig {
        job_id: "job-normal-1".to_string(),
        blend_path,
        executable: vec![mock_bin.to_string_lossy().to_string()],
        runner_script: python_runner_script(),
        scene: Some("Scene".to_string()),
        camera: Some("Camera".to_string()),
        view_layers: None,
        overrides: HashMap::new(),
        frames: vec![1, 2, 3],
        output_pattern: "frame_####.png".to_string(),
        output_dir: out_dir.clone(),
        device_preferences: Some(DevicePreferences {
            enable_gpu: true,
            device_type: Some("CUDA".to_string()),
            selected_devices: None,
        }),
        threads: Some(4),
        priority: None,
        isolated_mode: false,
        auto_exec: false,
        is_video: false,
        crash_policy: None,
        render_missing_only: false,
        pre_render_hook: None,
        path_remaps: None,
        make_paths_absolute: None,
        runtime_dir,
        logs_dir,
    };

    let (event_tx, mut event_rx) = mpsc::unbounded_channel();
    let (supervisor, _handle) = RunnerSupervisor::new(config, event_tx);

    let supervisor_task = tokio::spawn(async move { supervisor.run().await });

    let mut events = Vec::new();
    while let Some(ev) = event_rx.recv().await {
        events.push(ev);
    }

    let status = supervisor_task.await.unwrap().expect("run should succeed");
    assert_eq!(status, HistoryResult::Completed);

    // Verify frames 1, 2, 3 output files were created by mock blender
    assert!(out_dir.join("frame_0001.png").exists());
    assert!(out_dir.join("frame_0002.png").exists());
    assert!(out_dir.join("frame_0003.png").exists());

    // Verify events received
    let frame_dones: Vec<i32> = events
        .iter()
        .filter_map(|ev| match ev {
            SupervisorEvent::FrameDone { frame, .. } => Some(*frame),
            _ => None,
        })
        .collect();
    assert_eq!(frame_dones, vec![1, 2, 3]);

    let job_done_opt = events.iter().find_map(|ev| match ev {
        SupervisorEvent::JobDone {
            status,
            completed_frames,
            failed_frames,
            ..
        } => Some((*status, *completed_frames, failed_frames.len())),
        _ => None,
    });
    assert_eq!(job_done_opt, Some((HistoryResult::Completed, 3, 0)));
}

#[tokio::test]
async fn test_supervisor_crash_114_gpu_recovery_to_cpu() {
    let mock_bin = mock_blender_bin();
    let temp = tempdir().expect("tempdir");
    let out_dir = temp.path().join("output");
    let runtime_dir = temp.path().join("runtime");
    let logs_dir = temp.path().join("logs");
    let blend_path = temp.path().join("crash_test.blend");
    std::fs::write(&blend_path, b"BLENDER_v402").unwrap();

    let config = SupervisorJobConfig {
        job_id: "job-crash-1".to_string(),
        blend_path,
        // Trigger Scenario 2: gpu_oom (crashes frame 114 on GPU, succeeds on CPU fallback)
        executable: vec![
            mock_bin.to_string_lossy().to_string(),
            "--mock-scenario".to_string(),
            "gpu_oom".to_string(),
        ],
        runner_script: python_runner_script(),
        scene: Some("Scene".to_string()),
        camera: Some("Camera".to_string()),
        view_layers: None,
        overrides: HashMap::new(),
        frames: vec![114],
        output_pattern: "frame_####.png".to_string(),
        output_dir: out_dir.clone(),
        device_preferences: Some(DevicePreferences {
            enable_gpu: true,
            device_type: Some("CUDA".to_string()),
            selected_devices: None,
        }),
        threads: None,
        priority: None,
        isolated_mode: false,
        auto_exec: false,
        is_video: false,
        crash_policy: Some(CrashPolicy {
            max_retries: 1,
            fallback_to_cpu: true,
            skip_on_failure: true,
            max_consecutive_crashes: 3,
        }),
        render_missing_only: false,
        pre_render_hook: None,
        path_remaps: None,
        make_paths_absolute: None,
        runtime_dir,
        logs_dir,
    };

    let (event_tx, mut event_rx) = mpsc::unbounded_channel();
    let (supervisor, _handle) = RunnerSupervisor::new(config, event_tx);

    let supervisor_task = tokio::spawn(async move { supervisor.run().await });

    let mut events = Vec::new();
    while let Some(ev) = event_rx.recv().await {
        if let SupervisorEvent::Log { line, .. } = &ev {
            println!("LOG: {}", line);
        }
        events.push(ev);
    }

    let status = supervisor_task.await.unwrap().expect("run should complete");
    assert_eq!(status, HistoryResult::Completed);

    // Verify recovery messages were emitted
    let recovery_logs: Vec<String> = events
        .iter()
        .filter_map(|ev| match ev {
            SupervisorEvent::Log { line, .. }
                if line.contains("[Recovery]") || line.contains("[Crash]") =>
            {
                Some(line.clone())
            }
            _ => None,
        })
        .collect();

    assert!(recovery_logs.iter().any(|l| l.contains("Blender crashed")));
    assert!(recovery_logs
        .iter()
        .any(|l| l.contains("Retrying frame 114")));
    assert!(recovery_logs
        .iter()
        .any(|l| l.contains("Falling back to CPU")));
    assert!(out_dir.join("frame_0114.png").exists());
}

#[tokio::test]
async fn test_supervisor_stop_cancellation() {
    let mock_bin = mock_blender_bin();
    let temp = tempdir().expect("tempdir");
    let out_dir = temp.path().join("output");
    let runtime_dir = temp.path().join("runtime");
    let logs_dir = temp.path().join("logs");
    let blend_path = temp.path().join("slow_test.blend");
    std::fs::write(&blend_path, b"BLENDER_v402").unwrap();

    let config = SupervisorJobConfig {
        job_id: "job-stop-1".to_string(),
        blend_path,
        // Scenario slow_control: slow frames (allows stopping)
        executable: vec![
            mock_bin.to_string_lossy().to_string(),
            "--mock-scenario".to_string(),
            "slow_control".to_string(),
        ],
        runner_script: python_runner_script(),
        scene: Some("Scene".to_string()),
        camera: Some("Camera".to_string()),
        view_layers: None,
        overrides: HashMap::new(),
        frames: vec![1, 2, 3, 4, 5],
        output_pattern: "frame_####.png".to_string(),
        output_dir: out_dir.clone(),
        device_preferences: None,
        threads: None,
        priority: None,
        isolated_mode: false,
        auto_exec: false,
        is_video: false,
        crash_policy: None,
        render_missing_only: false,
        pre_render_hook: None,
        path_remaps: None,
        make_paths_absolute: None,
        runtime_dir,
        logs_dir,
    };

    let (event_tx, mut event_rx) = mpsc::unbounded_channel();
    let (supervisor, handle) = RunnerSupervisor::new(config, event_tx);

    let supervisor_task = tokio::spawn(async move { supervisor.run().await });

    // Wait until we see frame 1 start, then issue stop
    while let Some(ev) = event_rx.recv().await {
        if matches!(ev, SupervisorEvent::FrameStart { frame: 1, .. }) {
            handle.stop();
            break;
        }
    }

    // Drain remaining events
    while event_rx.recv().await.is_some() {}

    let status = supervisor_task.await.unwrap().expect("run should return");
    assert_eq!(status, HistoryResult::Canceled);
}
