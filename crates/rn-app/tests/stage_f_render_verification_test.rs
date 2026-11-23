// Render Night - Stage F Test Suite: Real Blender / Mock Start -> Render -> Finish & Crash Recovery
// SPDX-License-Identifier: GPL-3.0-or-later

use rn_app::state::{AppState, ModalState, QueueStatus};
use rn_core::render::{RunnerSupervisor, SupervisorEvent, SupervisorJobConfig};
use rn_core::schemas::history::HistoryResult;
use rn_core::schemas::override_schema::DevicePreferences;
use rn_core::schemas::queue_state::{Job, JobStatus, PostAction};
use rn_core::sound::{synthesize_todung_samples, SoundPlayer};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("tests/fixtures")
}

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

fn resolve_blender_or_mock() -> Vec<String> {
    if let Ok(exe) = std::env::var("RN_BLENDER_BIN") {
        return vec![exe];
    }

    let home = std::env::var("HOME").unwrap_or_default();
    let flatpak_user =
        std::path::Path::new(&home).join(".local/share/flatpak/app/org.blender.Blender");
    let flatpak_sys = std::path::Path::new("/var/lib/flatpak/app/org.blender.Blender");

    if flatpak_user.exists() || flatpak_sys.exists() {
        return vec![
            "flatpak".to_string(),
            "run".to_string(),
            "org.blender.Blender".to_string(),
        ];
    }

    let mock = mock_blender_bin();
    if mock.exists() {
        return vec![mock.to_string_lossy().to_string()];
    }

    vec!["blender".to_string()]
}

fn create_scratch_dir(name: &str) -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop(); // crates/
    path.pop(); // root/
    path.push("target");
    path.push("scratch_stage_f");
    path.push(name);
    let _ = fs::remove_dir_all(&path);
    fs::create_dir_all(&path).expect("create scratch dir");
    path
}

#[tokio::test]
async fn test_render_eevee_basic_10_frames_and_verify_png_headers() {
    let fixture_path = fixtures_dir().join("eevee-basic.blend");
    assert!(
        fixture_path.exists(),
        "eevee-basic.blend fixture must exist"
    );

    let test_dir = create_scratch_dir("render_10_frames");
    let out_dir = test_dir.join("frames");
    let runtime_dir = test_dir.join("runtime");
    let logs_dir = test_dir.join("logs");
    fs::create_dir_all(&out_dir).unwrap();

    let output_pattern = out_dir.join("frame_####.png").to_string_lossy().to_string();
    let executable = resolve_blender_or_mock();

    let config = SupervisorJobConfig {
        job_id: "job-eevee-basic".to_string(),
        blend_path: fixture_path,
        executable,
        runner_script: python_runner_script(),
        scene: None,
        camera: None,
        view_layers: None,
        overrides: HashMap::new(),
        frames: (1..=10).collect(),
        output_pattern,
        output_dir: out_dir.clone(),
        device_preferences: Some(DevicePreferences {
            enable_gpu: true,
            device_type: None,
            selected_devices: None,
        }),
        threads: Some(2),
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

    let (event_tx, mut event_rx) = tokio::sync::mpsc::unbounded_channel();
    let (supervisor, _handle) = RunnerSupervisor::new(config, event_tx);

    let supervisor_task = tokio::spawn(async move { supervisor.run().await });

    let mut frame_events = Vec::new();
    while let Some(ev) = event_rx.recv().await {
        if let SupervisorEvent::FrameDone { frame, .. } = ev {
            frame_events.push(frame);
        }
    }

    let result = supervisor_task
        .await
        .unwrap()
        .expect("render task must succeed");
    assert_eq!(result, HistoryResult::Completed);

    // Assert frames 1..10 were rendered
    assert_eq!(
        frame_events.len(),
        10,
        "All 10 frames must emit FrameDone events"
    );
    assert_eq!(frame_events, (1..=10).collect::<Vec<_>>());

    // Assert all 10 frames exist on disk, are non-empty, and contain PNG magic bytes
    for f in 1..=10 {
        let frame_file = out_dir.join(format!("frame_{:04}.png", f));
        assert!(
            frame_file.exists(),
            "Frame file must exist: {}",
            frame_file.display()
        );

        let data = fs::read(&frame_file).expect("read frame file");
        assert!(
            data.len() >= 67,
            "Frame {} file size ({} bytes) must be >= 67 bytes",
            f,
            data.len()
        );

        // Standard PNG Magic Header: 89 50 4E 47 0D 0A 1A 0A
        assert_eq!(
            &data[0..8],
            b"\x89PNG\r\n\x1a\n",
            "Frame {} must have valid PNG magic bytes",
            f
        );
    }
}

#[test]
fn test_sound_synthesis_and_silent_fallback_never_crashes() {
    // 1. Synthesize raw Todung samples
    let samples = synthesize_todung_samples();
    assert!(
        !samples.is_empty(),
        "Todung synthesized waveform must not be empty"
    );
    assert!(
        samples.len() > 1000,
        "Waveform must contain full chime audio samples"
    );

    // Verify samples are bounded in valid audio range [-1.0, 1.0]
    for &sample in &samples {
        assert!(
            (-1.0..=1.0).contains(&sample),
            "Sample value {} exceeds audio bounds [-1.0, 1.0]",
            sample
        );
    }

    // 2. Play sound via SoundPlayer
    let player = SoundPlayer::new(true, 100);
    assert!(player.is_enabled());
    assert_eq!(player.volume(), 100);

    // Play finish sound: in headless CI / container environments without an ALSA/Pulse audio device,
    // this must gracefully fallback to silent logging and NEVER panic or abort.
    player.play_finish_sound();

    // Verify disabled and muted sound player
    let muted_player = SoundPlayer::new(false, 0);
    assert!(!muted_player.is_enabled());
    muted_player.play_finish_sound();
}

#[test]
fn test_failed_job_shows_resume_from_frame_n_and_disarms_post_actions() {
    let mut state = AppState::new();

    // 1. Setup a 50-frame job
    let mut job = Job {
        id: "job-50-frames".to_string(),
        blend_path: "/tmp/project_50.blend".to_string(),
        name: "project_50.blend".to_string(),
        status: JobStatus::Active,
        range: rn_core::ranges::SimpleRange {
            start: 1,
            end: 50,
            step: 1,
        },
        range_config: None,
        crash_policy: None,
        render_missing_only: false,
        failed_frames: Vec::new(),
        overrides: HashMap::new(),
        presets: Vec::new(),
        output_dir: Some("/tmp/out".to_string()),
        output_pattern: Some("frame_####.png".to_string()),
        device: Some("GPU".to_string()),
        engine: Some("CYCLES".to_string()),
        created_at: 1732300000,
        started_at: Some(1732300000),
        completed_at: None,
        error: None,
        progress: 0.46,
        last_frame: Some(23), // Failed after completing frame 23
        inspect: None,
        pre_render_hook: None,
        is_basic_mode: Some(false),
        basic_mode_reason: None,
        ignore_all_warnings: Some(false),
        ignored_warning_codes: Some(Vec::new()),
        ignored_warning_ids: Some(Vec::new()),
        missing_path_remaps: None,
    };

    // User configured auto-shutdown when finished
    state.when_finished = PostAction::Shutdown;
    state.queue_state.settings.post_action = PostAction::Shutdown;

    // Simulate child crash mid-render
    job.status = JobStatus::Failed;
    state.queue_state.jobs.push(job);
    state.queue_status = QueueStatus::Idle;

    // 2. Verify next frame calculation is last_frame + 1 = 24
    let failed_job = &state.queue_state.jobs[0];
    let next_frame = failed_job
        .last_frame
        .map(|f| f + 1)
        .unwrap_or(failed_job.range.start);
    assert_eq!(next_frame, 24);

    // 3. User clicks "Resume from frame 24" button
    state.resume_job_from_frame("job-50-frames", next_frame);

    // 4. Assert invariants per docs/behavior/crash-recovery.md:
    let resumed_job = &state.queue_state.jobs[0];
    assert_eq!(resumed_job.range.start, 24, "Job must resume from frame 24");
    assert_eq!(resumed_job.range.end, 50, "Job end frame must remain 50");
    assert!(
        resumed_job.render_missing_only,
        "render_missing_only must be true to avoid duplicate frame renders"
    );
    assert_eq!(
        resumed_job.status,
        JobStatus::Active,
        "Resumed job must be Active"
    );

    // STRICT INVARIANT: post-actions MUST be disarmed on crash recovery
    assert_eq!(
        state.when_finished,
        PostAction::None,
        "Post-action MUST be strictly disarmed on crash recovery"
    );
    assert_eq!(
        state.queue_status,
        QueueStatus::Running,
        "Queue must be running after resume"
    );
}

#[test]
fn test_unclean_shutdown_modal_flow() {
    let mut state = AppState::new();

    let job = Job {
        id: "job-crashed-session".to_string(),
        blend_path: "/tmp/crashed_session.blend".to_string(),
        name: "crashed_session.blend".to_string(),
        status: JobStatus::Pending,
        range: rn_core::ranges::SimpleRange {
            start: 1,
            end: 100,
            step: 1,
        },
        range_config: None,
        crash_policy: None,
        render_missing_only: false,
        failed_frames: Vec::new(),
        overrides: HashMap::new(),
        presets: Vec::new(),
        output_dir: Some("/tmp/out".to_string()),
        output_pattern: Some("frame_####.png".to_string()),
        device: Some("GPU".to_string()),
        engine: Some("CYCLES".to_string()),
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
    };
    state.queue_state.jobs.push(job);

    // Previous session had post-action Hibernate configured
    state.when_finished = PostAction::Hibernate;

    // On unclean shutdown detection, app surfaces ResumeAfterCrash modal
    state.active_modal = Some(ModalState::ResumeAfterCrash {
        job_id: "job-crashed-session".to_string(),
        job_name: "crashed_session.blend".to_string(),
        last_frame: 42,
    });

    // User accepts modal prompt to restore queue
    state.resume_after_crash();

    let resumed_job = &state.queue_state.jobs[0];
    assert_eq!(
        resumed_job.range.start, 43,
        "Queue must resume from missing frame (last_frame + 1 = 43)"
    );
    assert_eq!(resumed_job.status, JobStatus::Active);
    assert!(resumed_job.render_missing_only);

    // Strict safety invariant: post-action MUST be disarmed to None
    assert_eq!(
        state.when_finished,
        PostAction::None,
        "Post-action MUST be strictly disarmed to None"
    );
    assert_eq!(state.queue_status, QueueStatus::Running);
    assert!(state.active_modal.is_none());
}
