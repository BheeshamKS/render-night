// Render Night CLI - Queue Runner
// SPDX-License-Identifier: GPL-3.0-or-later

use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use rn_core::blender::{
    resolve_blender_for_cli, BlenderInstallation, Platform, RealBlenderFs, RealBlenderProber,
    RealEnv,
};
use rn_core::power::{PostAction, PostActionManager};
use rn_core::preflight::{PreflightChecker, PreflightJobInput, PreflightOptions, SelectedBlender};
use rn_core::queue::engine::{QueueEngine, QueueEngineOptions, QueueEvent, QueueStatus};
use rn_core::ranges::{
    filter_missing_frames, parse_custom_range, resolve_frame_range, FrameRangeConfig,
    FrameRangeMode, SimpleRange,
};
use rn_core::schemas::cli::{CliJobItem, CliQueueFile, CliRange};
use rn_core::schemas::history::HistoryResult;
use rn_core::schemas::queue_state::{Job, JobStatus, QueueSettings, QueueState};
use rn_core::sound::SoundPlayer;

use crate::terminal::{format_summary_table, render_progress_line, ring_terminal_bell, CliSummary};

pub struct CliRunOptions {
    pub queue_file: String,
    pub blender: Option<String>,
    pub post_action: Option<String>,
    pub resume: bool,
    pub preset: Option<String>,
    pub dry_run: bool,
    pub strict: bool,
    pub fail_on_warning: bool,
    pub runner_script_path: Option<String>,
    pub base_dir: Option<String>,
    pub skip_countdown: bool,
}

pub struct CliRunResult {
    pub exit_code: i32,
    #[allow(dead_code)]
    pub summary: CliSummary,
}

pub fn resolve_runner_script_path(override_path: Option<&str>) -> PathBuf {
    if let Some(p) = override_path {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return pb;
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidates = [
                parent.join("resources/python/render_runner.py"),
                parent.join("../share/render-night/python/render_runner.py"),
                parent.join("../resources/python/render_runner.py"),
            ];
            for c in &candidates {
                if c.exists() {
                    return c.clone();
                }
            }
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        let p = PathBuf::from(home).join(".local/share/render-night/python/render_runner.py");
        if p.exists() {
            return p;
        }
    }

    let sys_candidates = [
        PathBuf::from("/usr/share/render-night/python/render_runner.py"),
        PathBuf::from("/usr/local/share/render-night/python/render_runner.py"),
    ];
    for c in &sys_candidates {
        if c.exists() {
            return c.clone();
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        manifest_dir.join("../../resources/python/render_runner.py"),
        manifest_dir.join("../resources/python/render_runner.py"),
        PathBuf::from("resources/python/render_runner.py"),
    ];

    for c in &candidates {
        if c.exists() {
            return c.clone();
        }
    }

    PathBuf::from("resources/python/render_runner.py")
}

fn resolve_job_range(
    job: &CliJobItem,
) -> Result<(Vec<i32>, FrameRangeConfig, SimpleRange), String> {
    match &job.range {
        Some(CliRange::String(expr)) => {
            let frames = parse_custom_range(expr).map_err(|e| e.to_string())?;
            let first = frames.first().copied().unwrap_or(1);
            let last = frames.last().copied().unwrap_or(first);
            let cfg = FrameRangeConfig {
                mode: FrameRangeMode::Custom,
                custom_expression: Some(expr.clone()),
                ..Default::default()
            };
            let simple = SimpleRange {
                start: first,
                end: last,
                step: 1,
            };
            Ok((frames, cfg, simple))
        }
        Some(CliRange::Simple { start, end, step }) => {
            let simple = SimpleRange {
                start: *start,
                end: *end,
                step: *step,
            };
            let cfg = FrameRangeConfig {
                mode: FrameRangeMode::Simple,
                simple: Some(simple.clone()),
                ..Default::default()
            };
            let resolved = resolve_frame_range(&cfg, *start, *end, *step)
                .map_err(|e| format!("Invalid frame range: {e}"))?;
            Ok((resolved.frames, cfg, simple))
        }
        None => {
            let simple = SimpleRange {
                start: 1,
                end: 1,
                step: 1,
            };
            let cfg = FrameRangeConfig {
                mode: FrameRangeMode::Simple,
                simple: Some(simple.clone()),
                ..Default::default()
            };
            Ok((vec![1], cfg, simple))
        }
    }
}

pub async fn run_cli_queue(options: CliRunOptions) -> CliRunResult {
    let start_time = std::time::Instant::now();
    let mut summary = CliSummary {
        dry_run: options.dry_run,
        ..Default::default()
    };

    // 1. File existence
    let queue_path = Path::new(&options.queue_file);
    if !queue_path.exists() {
        eprintln!("Error: Queue file not found: {}", options.queue_file);
        summary.duration_seconds = start_time.elapsed().as_secs_f64();
        return CliRunResult {
            exit_code: 2,
            summary,
        };
    }

    // 2. Read and parse JSON
    let content = match fs::read_to_string(queue_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Error reading {}: {}", options.queue_file, e);
            summary.duration_seconds = start_time.elapsed().as_secs_f64();
            return CliRunResult {
                exit_code: 2,
                summary,
            };
        }
    };

    let parsed_queue: CliQueueFile = match serde_json::from_str(&content) {
        Ok(q) => q,
        Err(e) => {
            eprintln!("Error parsing JSON in {}: {}", options.queue_file, e);
            summary.duration_seconds = start_time.elapsed().as_secs_f64();
            return CliRunResult {
                exit_code: 2,
                summary,
            };
        }
    };

    if parsed_queue.jobs.is_empty() {
        eprintln!("Error: At least one job is required in jobs array");
        summary.duration_seconds = start_time.elapsed().as_secs_f64();
        return CliRunResult {
            exit_code: 2,
            summary,
        };
    }

    summary.total_jobs = parsed_queue.jobs.len();

    // 3. Resolve Blender
    let blender_spec = options
        .blender
        .as_deref()
        .or(parsed_queue.blender.as_deref())
        .unwrap_or("latest");

    let resolved_blender: BlenderInstallation = match resolve_blender_for_cli(
        Some(blender_spec),
        &[],
        &RealBlenderFs,
        &RealBlenderProber::default(),
        &RealEnv,
        Platform::current(),
    ) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("Blender resolution failed: {}", e);
            summary.duration_seconds = start_time.elapsed().as_secs_f64();
            return CliRunResult {
                exit_code: 2,
                summary,
            };
        }
    };

    // 4. Preflight and Queue Jobs Preparation
    let mut is_queue_blocked = false;
    let mut has_preflight_warnings = false;
    let mut state_jobs = Vec::new();

    let queue_parent_dir = queue_path.parent().unwrap_or_else(|| Path::new("."));

    for (idx, job_input) in parsed_queue.jobs.iter().enumerate() {
        let job_id = job_input
            .id
            .clone()
            .unwrap_or_else(|| format!("job-{}-{}", idx + 1, uuid_v4_short()));

        let blend_path_buf = Path::new(&job_input.blend_path);
        let full_blend_path = if blend_path_buf.is_absolute() {
            blend_path_buf.to_path_buf()
        } else {
            queue_parent_dir.join(blend_path_buf)
        };
        let file_name = full_blend_path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "unnamed.blend".to_string());

        let (mut frames, range_cfg, simple_range) = match resolve_job_range(job_input) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("Job #{} ({}) error: {}", idx + 1, file_name, e);
                summary.duration_seconds = start_time.elapsed().as_secs_f64();
                return CliRunResult {
                    exit_code: 2,
                    summary,
                };
            }
        };

        let output_dir = full_blend_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_string_lossy()
            .to_string();

        let stem = full_blend_path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "render".to_string());
        let default_pattern = format!("{output_dir}/{stem}_####.png");
        let output_pattern = job_input.output_pattern.clone().unwrap_or(default_pattern);

        if options.resume || job_input.render_missing_only {
            let (missing, _) =
                filter_missing_frames(&frames, &output_pattern, Path::new(&output_dir), None);
            frames = missing;
        }

        summary.total_frames += frames.len();

        // Run Pre-flight Check
        let pf_input = PreflightJobInput {
            id: job_id.clone(),
            file_name: file_name.clone(),
            file_path: full_blend_path.to_string_lossy().to_string(),
            selected_scene: job_input.scene.clone(),
            selected_camera: job_input.camera.clone(),
            output_path_pattern: Some(output_pattern.clone()),
            output_preview: Some(output_pattern.clone()),
            range_config: Some(range_cfg.clone()),
            overrides: job_input.overrides.clone(),
            ..Default::default()
        };

        let pf_opts = PreflightOptions {
            selected_blender: Some(SelectedBlender {
                version: resolved_blender.version.clone(),
                executable: resolved_blender
                    .executable
                    .first()
                    .cloned()
                    .unwrap_or_default(),
            }),
            check_disk_access: true,
            ..Default::default()
        };

        let pf_report = PreflightChecker::check_job(&pf_input, &pf_opts);
        if pf_report.is_blocked {
            is_queue_blocked = true;
            eprintln!("\nPre-flight blocking error(s) for job \"{}\":", file_name);
            for err in pf_report.errors.iter().filter(|e| e.is_blocking) {
                eprintln!("  - [{}] {}", err.code, err.message);
            }
        }

        if !pf_report.warnings.is_empty() {
            has_preflight_warnings = true;
            eprintln!("\nPre-flight warning(s) for job \"{}\":", file_name);
            for warn in &pf_report.warnings {
                eprintln!("  ⚠️ [{}] {}", warn.code, warn.message);
            }
        }

        let mut job_presets = job_input.presets.clone();
        if let Some(p) = &options.preset {
            if !job_presets.contains(p) {
                job_presets.push(p.clone());
            }
        }

        let job = Job {
            id: job_id,
            blend_path: full_blend_path.to_string_lossy().to_string(),
            name: file_name,
            status: JobStatus::Pending,
            range: simple_range,
            range_config: Some(range_cfg),
            crash_policy: job_input.crash_policy.as_ref().map(|p| p.to_crash_policy()),
            render_missing_only: job_input.render_missing_only || options.resume,
            failed_frames: Vec::new(),
            overrides: job_input.overrides.clone(),
            presets: job_presets,
            output_dir: Some(output_dir),
            output_pattern: Some(output_pattern),
            device: None,
            engine: None,
            created_at: Utc::now().timestamp_millis() as u64,
            started_at: None,
            completed_at: None,
            error: None,
            progress: 0.0,
            last_frame: None,
            inspect: None,
            pre_render_hook: job_input.pre_render_hook.clone(),
            is_basic_mode: Some(false),
            basic_mode_reason: None,
            ignore_all_warnings: None,
            ignored_warning_codes: None,
            ignored_warning_ids: None,
            missing_path_remaps: None,
        };
        state_jobs.push(job);
    }

    if is_queue_blocked || (options.strict && has_preflight_warnings) {
        if options.strict && has_preflight_warnings && !is_queue_blocked {
            eprintln!(
                "\nQueue stopped: --strict mode was specified and pre-flight warnings were detected."
            );
        }
        summary.duration_seconds = start_time.elapsed().as_secs_f64();
        return CliRunResult {
            exit_code: 1,
            summary,
        };
    }

    // Dry Run
    if options.dry_run {
        println!(
            "[DRY-RUN] Pre-flight checks passed for {} job(s).",
            state_jobs.len()
        );
        println!(
            "[DRY-RUN] Blender: {} (v{})",
            resolved_blender.display_path, resolved_blender.version
        );
        summary.completed_jobs = summary.total_jobs;
        summary.completed_frames = summary.total_frames;
        summary.duration_seconds = start_time.elapsed().as_secs_f64();
        println!("{}", format_summary_table(&summary));
        return CliRunResult {
            exit_code: 0,
            summary,
        };
    }

    // Set up Directories and Queue Engine
    let base_dir = options.base_dir.map(PathBuf::from).unwrap_or_else(|| {
        directories::BaseDirs::new()
            .map(|b| b.home_dir().join(".render-night"))
            .unwrap_or_else(|| PathBuf::from(".render-night"))
    });
    let logs_dir = base_dir.join("logs");
    let runtime_dir = base_dir.join("runtime");
    let _ = fs::create_dir_all(&logs_dir);
    let _ = fs::create_dir_all(&runtime_dir);

    let runner_script = resolve_runner_script_path(options.runner_script_path.as_deref());

    // Safety check: Unclean shutdown detection and post-action disarm
    let lock_mgr = rn_core::persistence::SessionLockManager::new(&base_dir);
    let (is_unclean, unclean_info) = lock_mgr.check_unclean_shutdown();
    let is_restored_or_resumed = is_unclean || options.resume;

    let target_post_action = if is_restored_or_resumed {
        let requested = if let Some(pa_str) = &options.post_action {
            serde_json::from_value::<PostAction>(serde_json::Value::String(pa_str.clone()))
                .unwrap_or(PostAction::None)
        } else {
            parsed_queue.post_action.unwrap_or(PostAction::None)
        };
        if requested != PostAction::None {
            eprintln!("Notice: Post-queue action strictly disarmed due to session restore/resume.");
        }
        if is_unclean {
            eprintln!(
                "Notice: Detected unclean shutdown from previous session (PID: {:?}). Resuming safely.",
                unclean_info.as_ref().map(|l| l.pid)
            );
        }
        PostAction::None
    } else if let Some(pa_str) = &options.post_action {
        serde_json::from_value::<PostAction>(serde_json::Value::String(pa_str.clone()))
            .unwrap_or(PostAction::None)
    } else {
        parsed_queue.post_action.unwrap_or(PostAction::None)
    };

    let queue_state = QueueState {
        version: 1,
        jobs: state_jobs,
        settings: QueueSettings {
            post_action: target_post_action,
            preflight_mode: Some(if options.strict {
                "strict".to_string()
            } else {
                "never_block".to_string()
            }),
            ..Default::default()
        },
    };

    let engine_opts = QueueEngineOptions {
        app_data_dir: base_dir.clone(),
        runtime_dir: runtime_dir.clone(),
        logs_dir: logs_dir.clone(),
        runner_script,
        blender_executable: resolved_blender.executable.clone(),
    };

    let (_engine, handle) = QueueEngine::new(engine_opts);
    let _ = handle.update_state(queue_state).await;

    let mut event_rx = handle.subscribe();

    let was_interrupted = Arc::new(AtomicBool::new(false));
    let was_interrupted_sig = was_interrupted.clone();
    let handle_stop = handle.clone();

    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            was_interrupted_sig.store(true, Ordering::SeqCst);
            println!("\nReceived interrupt signal. Stopping queue cleanly...");
            let _ = handle_stop.stop().await;
        }
    });

    let _ = handle.start().await;

    // Listen to events
    while let Ok(event) = event_rx.recv().await {
        match event {
            QueueEvent::JobStart {
                job_id,
                total_frames,
                ..
            } => {
                render_progress_line(&format!(
                    "Rendering Job {job_id} - Total frames: {total_frames}"
                ));
            }
            QueueEvent::JobProgress {
                job_id,
                frame,
                eta_seconds,
                ..
            } => {
                let frame_str = frame
                    .map(|f| f.to_string())
                    .unwrap_or_else(|| "-".to_string());
                let eta_str = eta_seconds
                    .map(|e| format!("{e}s"))
                    .unwrap_or_else(|| "--".to_string());
                render_progress_line(&format!(
                    "Job {job_id} - Frame {frame_str} - ETA: {eta_str}"
                ));
            }
            QueueEvent::JobDone {
                job_id,
                status,
                completed_frames,
                failed_frames,
            } => {
                ring_terminal_bell();
                if failed_frames == 0
                    && (status == HistoryResult::Completed
                        || status == HistoryResult::CompletedWithWarnings
                        || status == HistoryResult::Canceled)
                {
                    summary.completed_jobs += 1;
                } else {
                    summary.failed_jobs += 1;
                }
                summary.completed_frames += completed_frames;
                summary.failed_frames += failed_frames;
                println!(
                    "\nJob {job_id} completed ({completed_frames} rendered, {failed_frames} failed)."
                );
            }
            QueueEvent::LogLine { line, is_error, .. } => {
                if is_error {
                    eprintln!("{line}");
                }
            }
            QueueEvent::StateChanged {
                state: QueueStatus::Idle,
                ..
            } => {
                break;
            }
            _ => {}
        }
    }

    summary.duration_seconds = start_time.elapsed().as_secs_f64();
    println!("{}", format_summary_table(&summary));

    let has_failures = summary.failed_jobs > 0 || summary.failed_frames > 0;

    // Safety rule for Post-Queue Action
    let interrupted = was_interrupted.load(Ordering::SeqCst);
    if target_post_action != PostAction::None && !interrupted && !has_failures {
        let mut manager = PostActionManager::new(
            target_post_action,
            if options.skip_countdown { 0 } else { 60 },
        );
        if options.skip_countdown {
            PostActionManager::execute_os_action(target_post_action);
        } else {
            println!(
                "Executing post-action \"{:?}\" in 60s. Press Ctrl+C to cancel.",
                target_post_action
            );
            let _ = manager
                .run_countdown_and_execute(|sec| {
                    if sec % 10 == 0 || sec <= 5 {
                        println!("Post-action in {}s...", sec);
                    }
                })
                .await;
        }
    }

    // Play finish sound
    let sound_player = SoundPlayer::new(true, 100);
    sound_player.play_finish_sound();

    let exit_code = if has_failures || (options.fail_on_warning && has_preflight_warnings) {
        1
    } else {
        0
    };

    CliRunResult { exit_code, summary }
}

fn uuid_v4_short() -> String {
    use std::time::SystemTime;
    let n = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}", n & 0xffffffff)
}
