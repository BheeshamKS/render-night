// Render Night - Queue Engine & Persistence Integration Tests
// SPDX-License-Identifier: GPL-3.0-or-later

use rn_core::persistence::{QueuePersistence, SessionLockManager};
use rn_core::queue::{QueueEngine, QueueEngineOptions, QueueEvent, QueueStatus};
use rn_core::schemas::queue_state::{Job, JobStatus, QueueState, SimpleRange};
use std::path::PathBuf;
use tempfile::tempdir;

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
async fn test_queue_engine_execution_and_events() {
    let temp = tempdir().unwrap();
    let app_data = temp.path().join("app_data");
    let runtime = temp.path().join("runtime");
    let logs = temp.path().join("logs");

    let persistence = QueuePersistence::new(&app_data);
    let blend_path = temp.path().join("engine_test.blend");
    std::fs::write(&blend_path, b"BLENDER_v402").unwrap();

    let mut state = QueueState::default();
    state.jobs.push(Job {
        id: "job-e1".to_string(),
        blend_path: blend_path.to_string_lossy().to_string(),
        name: "engine_test.blend".to_string(),
        status: JobStatus::Pending,
        range: SimpleRange {
            start: 1,
            end: 2,
            step: 1,
        },
        range_config: None,
        crash_policy: None,
        render_missing_only: false,
        failed_frames: vec![],
        overrides: Default::default(),
        presets: vec![],
        output_dir: Some(runtime.join("output").to_string_lossy().to_string()),
        output_pattern: Some("frame_####.png".to_string()),
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
        blender_executable: vec![mock_blender_bin().to_string_lossy().to_string()],
    };

    let (_engine, handle) = QueueEngine::new(options);
    let mut rx = handle.subscribe();

    handle.start().await.unwrap();

    let mut saw_running = false;
    let mut saw_job_done = false;
    let mut saw_idle = false;

    while let Ok(ev) = rx.recv().await {
        match ev {
            QueueEvent::StateChanged { state: s, .. } => {
                if s == QueueStatus::Running {
                    saw_running = true;
                }
                if s == QueueStatus::Idle && saw_running {
                    saw_idle = true;
                    break;
                }
            }
            QueueEvent::JobDone { job_id, status, .. } => {
                assert_eq!(job_id, "job-e1");
                assert_eq!(status, rn_core::schemas::history::HistoryResult::Completed);
                saw_job_done = true;
            }
            _ => {}
        }
    }

    assert!(saw_running);
    assert!(saw_job_done);
    assert!(saw_idle);

    // Verify persisted state shows job Done
    let updated_state = persistence.load_state().unwrap();
    assert_eq!(updated_state.jobs[0].status, JobStatus::Done);
}

#[test]
fn test_unclean_shutdown_and_resume_detection() {
    let temp = tempdir().unwrap();
    let lock_mgr = SessionLockManager::new(temp.path());

    // Clean initial state
    let (is_unclean, _) = lock_mgr.check_unclean_shutdown();
    assert!(!is_unclean);

    // Simulate an unclean shutdown by writing a lock with dead PID
    let dead_lock = rn_core::persistence::SessionLockData {
        pid: 99_999_999,
        timestamp: 12345,
        worker_pids: vec![],
        active_job_id: Some("crashed-job-1".to_string()),
        state_path: None,
    };
    rn_core::persistence::write_atomic_json(lock_mgr.lock_path(), &dead_lock).unwrap();

    let (is_unclean, lock_data) = lock_mgr.check_unclean_shutdown();
    assert!(is_unclean);
    assert_eq!(
        lock_data.unwrap().active_job_id.as_deref(),
        Some("crashed-job-1")
    );
}
