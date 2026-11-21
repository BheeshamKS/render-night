// Render Night - Render Runner Supervisor
// SPDX-License-Identifier: GPL-3.0-or-later

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;
use tracing::{debug, error};

use super::stdout_parser::{parse_stdout_line, ParsedLine};
use crate::process::{spawn_isolated_child, ProcessPriority};
use crate::ranges::filter_missing_frames;
use crate::schemas::history::{HistoryEntry, HistoryResult};
use crate::schemas::override_schema::{CrashPolicy, DevicePreferences, OverrideMap, RunnerPayload};
use crate::schemas::queue_state::FailedFrame;
use crate::schemas::runner_event::{
    DeviceInfo, OverrideAppliedEntry, OverrideSkippedEntry, RunnerEvent,
};

#[derive(Debug, Clone)]
pub struct SupervisorJobConfig {
    pub job_id: String,
    pub blend_path: PathBuf,
    pub executable: Vec<String>,
    pub runner_script: PathBuf,
    pub scene: Option<String>,
    pub camera: Option<String>,
    pub view_layers: Option<Vec<String>>,
    pub overrides: OverrideMap,
    pub frames: Vec<i32>,
    pub output_pattern: String,
    pub output_dir: PathBuf,
    pub device_preferences: Option<DevicePreferences>,
    pub threads: Option<u32>,
    pub priority: Option<ProcessPriority>,
    pub isolated_mode: bool,
    pub auto_exec: bool,
    pub is_video: bool,
    pub crash_policy: Option<CrashPolicy>,
    pub render_missing_only: bool,
    pub pre_render_hook: Option<String>,
    pub path_remaps: Option<HashMap<String, String>>,
    pub make_paths_absolute: Option<bool>,
    pub runtime_dir: PathBuf,
    pub logs_dir: PathBuf,
}

#[derive(Debug, Clone)]
pub enum SupervisorEvent {
    Log {
        stream: String,
        line: String,
        is_error: bool,
    },
    JobStart {
        total_frames: usize,
        frames: Vec<i32>,
        scene: String,
        camera: Option<String>,
        engine: Option<String>,
    },
    DeviceReport {
        compute_device_type: String,
        engine: String,
        mode: String,
        devices: Vec<DeviceInfo>,
        requested_gpu: bool,
        fallback_to_cpu: bool,
        threads: Option<u32>,
    },
    OverridesReport {
        applied: Vec<OverrideAppliedEntry>,
        skipped: Vec<OverrideSkippedEntry>,
    },
    FrameStart {
        frame: i32,
        frame_index: usize,
        total_frames: usize,
    },
    FrameDone {
        frame: i32,
        saved_path: Option<String>,
        time_seconds: Option<f64>,
        peak_memory: Option<String>,
        eta_seconds: Option<u64>,
    },
    Progress {
        frame: Option<i32>,
        sample_current: Option<i32>,
        sample_total: Option<i32>,
        memory: Option<String>,
        peak_memory: Option<String>,
        time: Option<String>,
        remaining: Option<String>,
        eta_seconds: Option<u64>,
    },
    FrameFailed {
        frame: i32,
        error: String,
        stderr_tail: String,
    },
    JobDone {
        status: HistoryResult,
        completed_frames: usize,
        failed_frames: Vec<FailedFrame>,
        duration_seconds: f64,
        history_entry: Box<HistoryEntry>,
    },
}

pub struct SupervisorHandle {
    pub stop_flag: Arc<AtomicBool>,
    pub pause_flag: Arc<AtomicBool>,
    pub control_file: PathBuf,
}

impl SupervisorHandle {
    pub fn pause(&self) {
        self.pause_flag.store(true, Ordering::SeqCst);
        let _ = fs::write(
            &self.control_file,
            r#"{"command":"pause","action":"pause"}"#,
        );
    }

    pub fn resume(&self) {
        self.pause_flag.store(false, Ordering::SeqCst);
        let _ = fs::write(
            &self.control_file,
            r#"{"command":"continue","action":"continue"}"#,
        );
    }

    pub fn stop(&self) {
        self.stop_flag.store(true, Ordering::SeqCst);
        let _ = fs::write(&self.control_file, r#"{"command":"stop","action":"stop"}"#);
    }
}

pub struct RunnerSupervisor {
    config: SupervisorJobConfig,
    stop_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    control_file: PathBuf,
    event_tx: mpsc::UnboundedSender<SupervisorEvent>,
}

impl RunnerSupervisor {
    pub fn new(
        config: SupervisorJobConfig,
        event_tx: mpsc::UnboundedSender<SupervisorEvent>,
    ) -> (Self, SupervisorHandle) {
        let stop_flag = Arc::new(AtomicBool::new(false));
        let pause_flag = Arc::new(AtomicBool::new(false));

        let run_dir = config.runtime_dir.join("run").join(&config.job_id);
        let _ = fs::create_dir_all(&run_dir);
        let control_file = run_dir.join("control.json");
        let _ = fs::write(
            &control_file,
            r#"{"command":"continue","action":"continue"}"#,
        );

        let handle = SupervisorHandle {
            stop_flag: stop_flag.clone(),
            pause_flag: pause_flag.clone(),
            control_file: control_file.clone(),
        };

        let supervisor = Self {
            config,
            stop_flag,
            pause_flag,
            control_file,
            event_tx,
        };

        (supervisor, handle)
    }

    pub fn is_paused(&self) -> bool {
        self.pause_flag.load(Ordering::SeqCst)
    }

    pub fn check_sentinel_stop(&self) -> bool {
        if self.stop_flag.load(Ordering::SeqCst) {
            return true;
        }

        let check = |p: &Path| -> bool {
            if p.exists() {
                if let Ok(content) = fs::read_to_string(p) {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                        if v.get("command").and_then(|c| c.as_str()) == Some("stop")
                            || v.get("action").and_then(|a| a.as_str()) == Some("stop")
                        {
                            return true;
                        }
                    }
                }
            }
            false
        };

        if check(&self.control_file) || check(&self.config.runtime_dir.join("control.json")) {
            self.stop_flag.store(true, Ordering::SeqCst);
            let _ = fs::write(&self.control_file, r#"{"command":"stop","action":"stop"}"#);
            return true;
        }
        false
    }

    pub async fn run(self) -> Result<HistoryResult, String> {
        let job = &self.config;
        let job_start_time = Instant::now();
        let logs_job_dir = job.logs_dir.join(&job.job_id);
        let _ = fs::create_dir_all(&logs_job_dir);
        let log_file_path =
            logs_job_dir.join(format!("{}.log", chrono::Utc::now().timestamp_millis()));

        // 1. Missing frames check
        let mut remaining_frames = job.frames.clone();
        if job.render_missing_only {
            let (missing_frames, existing_frames) =
                filter_missing_frames(&job.frames, &job.output_pattern, &job.output_dir, None);
            if !existing_frames.is_empty() {
                let _ = self.event_tx.send(SupervisorEvent::Log {
                    stream: "stdout".to_string(),
                    line: format!(
                        "[MissingFrames] Skipping {} existing frame(s). {} frame(s) remain to render.",
                        existing_frames.len(),
                        missing_frames.len()
                    ),
                    is_error: false,
                });
            }

            if missing_frames.is_empty() {
                let project_opt = job
                    .blend_path
                    .parent()
                    .and_then(|p| p.file_name())
                    .map(|f| f.to_string_lossy().to_string());

                let history_entry = HistoryEntry {
                    id: uuid_simple(),
                    job_id: job.job_id.clone(),
                    file_path: job.blend_path.to_string_lossy().to_string(),
                    file_name: job
                        .blend_path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    project: project_opt,
                    scene: job.scene.clone().unwrap_or_else(|| "Scene".to_string()),
                    camera: job.camera.clone().unwrap_or_else(|| "Camera".to_string()),
                    frame_count: existing_frames.len() as u32,
                    total_time_seconds: 0.0,
                    average_frame_time_seconds: 0.0,
                    engine: "CYCLES".to_string(),
                    device: "CPU".to_string(),
                    result: HistoryResult::Completed,
                    failed_frames: Vec::new(),
                    output_path: job.output_dir.to_string_lossy().to_string(),
                    timestamp: chrono::Utc::now().timestamp_millis() as u64,
                };

                let _ = self.event_tx.send(SupervisorEvent::JobDone {
                    status: HistoryResult::Completed,
                    completed_frames: existing_frames.len(),
                    failed_frames: Vec::new(),
                    duration_seconds: 0.0,
                    history_entry: Box::new(history_entry),
                });
                return Ok(HistoryResult::Completed);
            }
            remaining_frames = missing_frames;
        }

        // 2. Crash policy configuration
        let crash_policy = job.crash_policy.clone().unwrap_or(CrashPolicy {
            max_retries: 2,
            fallback_to_cpu: true,
            skip_on_failure: true,
            max_consecutive_crashes: 3,
        });

        let mut frame_retry_counts: HashMap<i32, u32> = HashMap::new();
        let mut frame_cpu_fallback_tried: HashSet<i32> = HashSet::new();
        let mut failed_frames_list: Vec<FailedFrame> = Vec::new();
        let mut completed_frames_set: HashSet<i32> = HashSet::new();
        let mut consecutive_crashes: u32 = 0;
        let mut recent_frame_durations: Vec<f64> = Vec::new();
        let rolling_window_size = 10;

        let mut detected_scene = job.scene.clone();
        let mut detected_camera = job.camera.clone();
        let mut detected_engine: Option<String> = None;
        let mut detected_device_info: Option<(String, Vec<DeviceInfo>)> = None;

        // 3. Execution loop (resumes by relaunching Blender with remaining frames if crash occurs)
        while !remaining_frames.is_empty() && !self.check_sentinel_stop() {
            let active_frame = remaining_frames[0];
            let run_on_cpu = frame_cpu_fallback_tried.contains(&active_frame);

            // If CPU fallback is active for this frame, run it standalone first
            let frames_for_process = if run_on_cpu {
                vec![active_frame]
            } else {
                remaining_frames.clone()
            };

            let payload_path = job.runtime_dir.join("run").join(&job.job_id).join(format!(
                "payload-{}.json",
                chrono::Utc::now().timestamp_millis()
            ));

            let effective_device_prefs = if run_on_cpu {
                Some(DevicePreferences {
                    enable_gpu: false,
                    device_type: None,
                    selected_devices: None,
                })
            } else {
                job.device_preferences.clone()
            };

            let payload = RunnerPayload {
                blend_path: job.blend_path.to_string_lossy().to_string(),
                scene: job.scene.clone(),
                camera: job.camera.clone(),
                view_layers: job.view_layers.clone(),
                overrides: job.overrides.clone(),
                frames: frames_for_process,
                output_pattern: job.output_pattern.clone(),
                output_dir: job.output_dir.to_string_lossy().to_string(),
                control_file: self.control_file.to_string_lossy().to_string(),
                device_preferences: effective_device_prefs,
                threads: job.threads,
                crash_policy: Some(crash_policy.clone()),
                crash_config: None,
                render_missing_only: Some(false),
                pre_render_hook: job.pre_render_hook.clone(),
                path_remaps: job.path_remaps.clone(),
                make_paths_absolute: job.make_paths_absolute,
            };

            if let Ok(json_str) = serde_json::to_string_pretty(&payload) {
                let _ = fs::write(&payload_path, json_str);
            }

            // Build Command
            let mut cmd = std::process::Command::new(&job.executable[0]);
            for arg in &job.executable[1..] {
                cmd.arg(arg);
            }
            cmd.arg("-b").arg(&job.blend_path);

            if job.isolated_mode {
                cmd.arg("--factory-startup");
            }
            if job.auto_exec {
                cmd.arg("--enable-autoexec");
            }
            if let Some(t) = job.threads {
                if t > 0 {
                    cmd.arg("-t").arg(t.to_string());
                }
            }

            cmd.arg("-P")
                .arg(&job.runner_script)
                .arg("--")
                .arg(&payload_path);

            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());

            let mut child = match spawn_isolated_child(cmd, job.priority).await {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Failed to spawn Blender process: {}", e);
                    error!("{}", err_msg);
                    return Err(err_msg);
                }
            };

            let child_pid = child.id();
            debug!("Spawned Blender worker process PID {}", child_pid);

            let stdout = child.stdout.take().expect("Child stdout piped");
            let stderr = child.stderr.take().expect("Child stderr piped");

            let mut stdout_reader = BufReader::new(
                tokio::process::ChildStdout::from_std(stdout).map_err(|e| e.to_string())?,
            )
            .lines();
            let mut stderr_reader = BufReader::new(
                tokio::process::ChildStderr::from_std(stderr).map_err(|e| e.to_string())?,
            )
            .lines();

            let mut stderr_tail = Vec::new();
            let mut last_completed_frame = None;
            let mut stdout_done = false;
            let mut stderr_done = false;

            while !stdout_done || !stderr_done {
                tokio::select! {
                    stdout_res = stdout_reader.next_line(), if !stdout_done => {
                        match stdout_res {
                            Ok(Some(line)) => {
                                let trimmed = line.trim();
                                if trimmed.is_empty() {
                                    continue;
                                }

                                append_log_line(&log_file_path, "stdout", trimmed);

                                let is_error_kw = is_error_keyword(trimmed);
                                let _ = self.event_tx.send(SupervisorEvent::Log {
                                    stream: "stdout".to_string(),
                                    line: trimmed.to_string(),
                                    is_error: is_error_kw,
                                });

                                let parsed = parse_stdout_line(trimmed);
                                match parsed {
                                    Ok(ParsedLine::Event(ev)) => {
                                        match ev {
                                            RunnerEvent::JobStart { total_frames, frames, scene, camera, engine, .. } => {
                                                detected_scene = Some(scene.clone());
                                                if camera.is_some() { detected_camera = camera.clone(); }
                                                if engine.is_some() { detected_engine = engine.clone(); }

                                                let _ = self.event_tx.send(SupervisorEvent::JobStart {
                                                    total_frames,
                                                    frames,
                                                    scene,
                                                    camera,
                                                    engine,
                                                });
                                            }
                                            RunnerEvent::DeviceReport { compute_device_type, engine, mode, devices, requested_gpu, fallback_to_cpu, threads } => {
                                                detected_device_info = Some((compute_device_type.clone(), devices.clone()));
                                                let _ = self.event_tx.send(SupervisorEvent::DeviceReport {
                                                    compute_device_type,
                                                    engine,
                                                    mode,
                                                    devices,
                                                    requested_gpu,
                                                    fallback_to_cpu,
                                                    threads,
                                                });
                                            }
                                            RunnerEvent::OverridesReport { applied, skipped } => {
                                                let _ = self.event_tx.send(SupervisorEvent::OverridesReport { applied, skipped });
                                            }
                                            RunnerEvent::FrameStart { frame, frame_index, total_frames, .. } => {
                                                let _ = self.event_tx.send(SupervisorEvent::FrameStart {
                                                    frame,
                                                    frame_index: frame_index.unwrap_or(0),
                                                    total_frames: total_frames.unwrap_or(job.frames.len()),
                                                });
                                            }
                                            RunnerEvent::FrameDone { frame, saved, time_seconds, peak_memory, .. } => {
                                                completed_frames_set.insert(frame);
                                                remaining_frames.retain(|&f| f != frame);
                                                last_completed_frame = Some(frame);
                                                consecutive_crashes = 0;

                                                if let Some(secs) = time_seconds {
                                                    if secs > 0.0 {
                                                        recent_frame_durations.push(secs);
                                                        if recent_frame_durations.len() > rolling_window_size {
                                                            recent_frame_durations.remove(0);
                                                        }
                                                    }
                                                }

                                                let eta_seconds = if !job.is_video && !recent_frame_durations.is_empty() {
                                                    let avg: f64 = recent_frame_durations.iter().sum::<f64>() / (recent_frame_durations.len() as f64);
                                                    Some((avg * (remaining_frames.len() as f64)).round() as u64)
                                                } else {
                                                    None
                                                };

                                                let _ = self.event_tx.send(SupervisorEvent::FrameDone {
                                                    frame,
                                                    saved_path: Some(saved),
                                                    time_seconds,
                                                    peak_memory,
                                                    eta_seconds,
                                                });
                                            }
                                            _ => {}
                                        }
                                    }
                                    Ok(ParsedLine::Progress(p)) => {
                                        let eta_seconds = if job.is_video {
                                            p.remaining.as_deref().and_then(parse_remaining_seconds)
                                        } else {
                                            None
                                        };

                                        let _ = self.event_tx.send(SupervisorEvent::Progress {
                                            frame: p.frame,
                                            sample_current: p.samples.as_ref().map(|s| s.current as i32),
                                            sample_total: p.samples.as_ref().map(|s| s.total as i32),
                                            memory: p.memory,
                                            peak_memory: p.peak_memory,
                                            time: p.time,
                                            remaining: p.remaining,
                                            eta_seconds,
                                        });
                                    }
                                    _ => {}
                                }
                            }
                            Ok(None) | Err(_) => {
                                stdout_done = true;
                            }
                        }
                    }
                    stderr_res = stderr_reader.next_line(), if !stderr_done => {
                        match stderr_res {
                            Ok(Some(line)) => {
                                let trimmed = line.trim();
                                if !trimmed.is_empty() {
                                    append_log_line(&log_file_path, "stderr", trimmed);
                                    stderr_tail.push(trimmed.to_string());
                                    if stderr_tail.len() > 20 {
                                        stderr_tail.remove(0);
                                    }

                                    let is_error_kw = is_error_keyword(trimmed);
                                    let _ = self.event_tx.send(SupervisorEvent::Log {
                                        stream: "stderr".to_string(),
                                        line: trimmed.to_string(),
                                        is_error: is_error_kw,
                                    });
                                }
                            }
                            Ok(None) | Err(_) => {
                                stderr_done = true;
                            }
                        }
                    }
                }
            }

            // Wait for child process exit
            let status = tokio::task::spawn_blocking(move || child.wait())
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?;

            let exit_code = status.code().unwrap_or(-1);
            debug!("Blender child process exited with status {}", exit_code);

            if self.check_sentinel_stop() {
                break;
            }

            if remaining_frames.is_empty() {
                break; // All frames completed!
            }

            // If non-zero exit or premature exit before completing remaining frames
            if exit_code != 0 || last_completed_frame.is_none() {
                let crashed_frame = remaining_frames[0];
                let attempts = *frame_retry_counts.get(&crashed_frame).unwrap_or(&0);
                let tail_str = stderr_tail.join("\n");

                let _ = self.event_tx.send(SupervisorEvent::Log {
                    stream: "stderr".to_string(),
                    line: format!(
                        "[Crash] Blender crashed at frame {} (exit code {}).",
                        crashed_frame, exit_code
                    ),
                    is_error: true,
                });

                // Step A: Retry
                if attempts < crash_policy.max_retries {
                    frame_retry_counts.insert(crashed_frame, attempts + 1);
                    let _ = self.event_tx.send(SupervisorEvent::Log {
                        stream: "stdout".to_string(),
                        line: format!(
                            "[Recovery] Retrying frame {} (attempt {}/{})...",
                            crashed_frame,
                            attempts + 1,
                            crash_policy.max_retries
                        ),
                        is_error: false,
                    });
                    continue;
                }

                // Step B: Fallback to CPU
                if crash_policy.fallback_to_cpu
                    && !frame_cpu_fallback_tried.contains(&crashed_frame)
                {
                    frame_cpu_fallback_tried.insert(crashed_frame);
                    let _ = self.event_tx.send(SupervisorEvent::Log {
                        stream: "stdout".to_string(),
                        line: format!(
                            "[Recovery] Frame {} failed GPU retries. Falling back to CPU for frame {}...",
                            crashed_frame, crashed_frame
                        ),
                        is_error: false,
                    });
                    continue;
                }

                // Step C: Skip frame and record as failed
                let _ = self.event_tx.send(SupervisorEvent::Log {
                    stream: "stderr".to_string(),
                    line: format!(
                        "[Recovery] Frame {} failed permanently. Skipping frame and continuing queue.",
                        crashed_frame
                    ),
                    is_error: true,
                });

                let failed_frame = FailedFrame {
                    frame: crashed_frame,
                    error: format!("Blender process crashed (exit code {})", exit_code),
                    stderr_tail: Some(tail_str.clone()),
                    timestamp: chrono::Utc::now().timestamp_millis() as u64,
                    attempt_count: attempts + 1,
                };
                failed_frames_list.push(failed_frame);

                let _ = self.event_tx.send(SupervisorEvent::FrameFailed {
                    frame: crashed_frame,
                    error: format!("Blender process crashed (exit code {})", exit_code),
                    stderr_tail: tail_str,
                });

                remaining_frames.retain(|&f| f != crashed_frame);
                consecutive_crashes += 1;

                if consecutive_crashes >= crash_policy.max_consecutive_crashes {
                    let _ = self.event_tx.send(SupervisorEvent::Log {
                        stream: "stderr".to_string(),
                        line: format!(
                            "[Recovery] Exceeded maximum consecutive crashes ({}). Failing job {}.",
                            crash_policy.max_consecutive_crashes, job.job_id
                        ),
                        is_error: true,
                    });

                    let duration_seconds = job_start_time.elapsed().as_secs_f64();
                    let history_entry = build_history_entry(
                        job,
                        HistoryResult::Failed,
                        completed_frames_set.len(),
                        &failed_frames_list,
                        duration_seconds,
                        &recent_frame_durations,
                        detected_scene.as_deref(),
                        detected_camera.as_deref(),
                        detected_engine.as_deref(),
                        detected_device_info.as_ref(),
                    );

                    let _ = self.event_tx.send(SupervisorEvent::JobDone {
                        status: HistoryResult::Failed,
                        completed_frames: completed_frames_set.len(),
                        failed_frames: failed_frames_list,
                        duration_seconds,
                        history_entry: Box::new(history_entry),
                    });

                    return Ok(HistoryResult::Failed);
                }
            }
        }

        let duration_seconds = job_start_time.elapsed().as_secs_f64();
        let final_status = if self.stop_flag.load(Ordering::SeqCst) {
            HistoryResult::Canceled
        } else if !failed_frames_list.is_empty() && completed_frames_set.is_empty() {
            HistoryResult::Failed
        } else if !failed_frames_list.is_empty() {
            HistoryResult::CompletedWithErrors
        } else {
            HistoryResult::Completed
        };

        let history_entry = build_history_entry(
            job,
            final_status,
            completed_frames_set.len(),
            &failed_frames_list,
            duration_seconds,
            &recent_frame_durations,
            detected_scene.as_deref(),
            detected_camera.as_deref(),
            detected_engine.as_deref(),
            detected_device_info.as_ref(),
        );

        let _ = self.event_tx.send(SupervisorEvent::JobDone {
            status: final_status,
            completed_frames: completed_frames_set.len(),
            failed_frames: failed_frames_list,
            duration_seconds,
            history_entry: Box::new(history_entry),
        });

        Ok(final_status)
    }
}

fn append_log_line(log_path: &Path, stream: &str, line: &str) {
    use std::io::Write;
    if let Ok(mut f) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
    {
        let ts = chrono::Utc::now().to_rfc3339();
        let _ = writeln!(f, "[{}] [{}] {}", ts, stream, line);
    }
}

fn is_error_keyword(line: &str) -> bool {
    let lower = line.to_lowercase();
    lower.contains("error")
        || lower.contains("traceback")
        || lower.contains("cuda error")
        || lower.contains("out of memory")
        || lower.contains("segmentation fault")
}

pub fn parse_remaining_seconds(time_str: &str) -> Option<u64> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.iter().any(|p| p.parse::<f64>().is_err()) {
        return None;
    }

    match parts.len() {
        1 => parts[0].parse::<f64>().ok().map(|s| s.round() as u64),
        2 => {
            let m = parts[0].parse::<f64>().ok()?;
            let s = parts[1].parse::<f64>().ok()?;
            Some((m * 60.0 + s).round() as u64)
        }
        3 => {
            let h = parts[0].parse::<f64>().ok()?;
            let m = parts[1].parse::<f64>().ok()?;
            let s = parts[2].parse::<f64>().ok()?;
            Some((h * 3600.0 + m * 60.0 + s).round() as u64)
        }
        _ => None,
    }
}

fn uuid_simple() -> String {
    use std::time::SystemTime;
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:x}", nanos)
}

#[allow(clippy::too_many_arguments)]
fn build_history_entry(
    job: &SupervisorJobConfig,
    status: HistoryResult,
    completed_count: usize,
    failed_list: &[FailedFrame],
    duration_secs: f64,
    recent_durations: &[f64],
    scene: Option<&str>,
    camera: Option<&str>,
    engine: Option<&str>,
    device_info: Option<&(String, Vec<DeviceInfo>)>,
) -> HistoryEntry {
    let avg_frame_time = if !recent_durations.is_empty() {
        recent_durations.iter().sum::<f64>() / (recent_durations.len() as f64)
    } else if completed_count > 0 {
        duration_secs / (completed_count as f64)
    } else {
        0.0
    };

    let device_str = if let Some((dev_type, devices)) = device_info {
        if dev_type.to_uppercase() != "CPU" && !devices.is_empty() {
            let names: Vec<String> = devices.iter().map(|d| d.name.clone()).collect();
            format!("GPU ({})", names.join(", "))
        } else {
            "CPU".to_string()
        }
    } else if let Some(prefs) = &job.device_preferences {
        if !prefs.enable_gpu {
            "CPU".to_string()
        } else {
            "GPU".to_string()
        }
    } else {
        "CPU".to_string()
    };

    let project_opt = job
        .blend_path
        .parent()
        .and_then(|p| p.file_name())
        .map(|f| f.to_string_lossy().to_string());

    HistoryEntry {
        id: uuid_simple(),
        job_id: job.job_id.clone(),
        file_path: job.blend_path.to_string_lossy().to_string(),
        file_name: job
            .blend_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        project: project_opt,
        scene: scene.unwrap_or("Scene").to_string(),
        camera: camera.unwrap_or("Camera").to_string(),
        frame_count: completed_count as u32,
        total_time_seconds: (duration_secs * 100.0).round() / 100.0,
        average_frame_time_seconds: (avg_frame_time * 100.0).round() / 100.0,
        engine: engine.unwrap_or("CYCLES").to_string(),
        device: device_str,
        result: status,
        failed_frames: failed_list.iter().map(|f| f.frame).collect(),
        output_path: job.output_dir.to_string_lossy().to_string(),
        timestamp: chrono::Utc::now().timestamp_millis() as u64,
    }
}
