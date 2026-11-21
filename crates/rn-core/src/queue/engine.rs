// Render Night - Queue Engine Actor
// SPDX-License-Identifier: GPL-3.0-or-later

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, oneshot, Mutex};

use crate::history::HistoryStore;
use crate::persistence::{QueuePersistence, SessionLockData, SessionLockManager};
use crate::ranges::{resolve_frame_range, FrameRangeConfig, FrameRangeMode};
use crate::render::{RunnerSupervisor, SupervisorEvent, SupervisorJobConfig};
use crate::schemas::history::{HistoryEntry, HistoryResult};
use crate::schemas::queue_state::{Job, JobStatus, QueueState};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QueueStatus {
    Idle,
    Running,
    Paused,
    Stopping,
}

#[derive(Debug, Clone)]
pub enum QueueEvent {
    StateChanged {
        state: QueueStatus,
        active_job_id: Option<String>,
    },
    JobStart {
        job_id: String,
        total_frames: usize,
        frames: Vec<i32>,
    },
    JobProgress {
        job_id: String,
        frame: Option<i32>,
        sample_current: Option<i32>,
        sample_total: Option<i32>,
        progress: f64,
        eta_seconds: Option<u64>,
    },
    JobDone {
        job_id: String,
        status: HistoryResult,
        completed_frames: usize,
        failed_frames: usize,
    },
    JobHistory(Box<HistoryEntry>),
    LogLine {
        job_id: String,
        stream: String,
        line: String,
        is_error: bool,
    },
}

#[derive(Debug)]
pub enum QueueCommand {
    Start,
    Pause,
    Resume,
    Stop,
    GetState(oneshot::Sender<QueueState>),
    UpdateState(Box<QueueState>),
}

pub struct QueueEngineOptions {
    pub app_data_dir: PathBuf,
    pub runtime_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub runner_script: PathBuf,
    pub blender_executable: Vec<String>,
}

pub struct QueueEngineHandle {
    cmd_tx: mpsc::Sender<QueueCommand>,
    event_rx_factory: broadcast::Sender<QueueEvent>,
}

impl QueueEngineHandle {
    pub async fn start(&self) -> Result<(), String> {
        self.cmd_tx
            .send(QueueCommand::Start)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn pause(&self) -> Result<(), String> {
        self.cmd_tx
            .send(QueueCommand::Pause)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn resume(&self) -> Result<(), String> {
        self.cmd_tx
            .send(QueueCommand::Resume)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn stop(&self) -> Result<(), String> {
        self.cmd_tx
            .send(QueueCommand::Stop)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn get_state(&self) -> Result<QueueState, String> {
        let (tx, rx) = oneshot::channel();
        self.cmd_tx
            .send(QueueCommand::GetState(tx))
            .await
            .map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())
    }

    pub fn subscribe(&self) -> broadcast::Receiver<QueueEvent> {
        self.event_rx_factory.subscribe()
    }
}

pub struct QueueEngine {
    options: QueueEngineOptions,
    persistence: QueuePersistence,
    session_lock: SessionLockManager,
    history_store: HistoryStore,
    state: Arc<Mutex<QueueState>>,
    status: Arc<Mutex<QueueStatus>>,
    active_job_id: Arc<Mutex<Option<String>>>,
    event_tx: broadcast::Sender<QueueEvent>,
    stop_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
}

impl QueueEngine {
    pub fn new(options: QueueEngineOptions) -> (Self, QueueEngineHandle) {
        let persistence = QueuePersistence::new(&options.app_data_dir);
        let session_lock = SessionLockManager::new(&options.app_data_dir);
        let history_store = HistoryStore::new(&options.app_data_dir);
        let loaded_state = persistence.load_state().unwrap_or_default();

        let (event_tx, _) = broadcast::channel(500);
        let (cmd_tx, mut cmd_rx) = mpsc::channel::<QueueCommand>(32);

        let state = Arc::new(Mutex::new(loaded_state));
        let status = Arc::new(Mutex::new(QueueStatus::Idle));
        let active_job_id = Arc::new(Mutex::new(None));
        let stop_flag = Arc::new(AtomicBool::new(false));
        let pause_flag = Arc::new(AtomicBool::new(false));

        let handle = QueueEngineHandle {
            cmd_tx,
            event_rx_factory: event_tx.clone(),
        };

        let engine = Self {
            options,
            persistence,
            session_lock,
            history_store,
            state: state.clone(),
            status: status.clone(),
            active_job_id: active_job_id.clone(),
            event_tx: event_tx.clone(),
            stop_flag: stop_flag.clone(),
            pause_flag: pause_flag.clone(),
        };

        // Actor command loop
        let engine_runner = engine.clone();
        tokio::spawn(async move {
            while let Some(cmd) = cmd_rx.recv().await {
                match cmd {
                    QueueCommand::Start => {
                        let cur_status = *engine_runner.status.lock().await;
                        if cur_status == QueueStatus::Idle {
                            engine_runner.spawn_queue_runner();
                        }
                    }
                    QueueCommand::Pause => {
                        engine_runner.pause_flag.store(true, Ordering::SeqCst);
                        *engine_runner.status.lock().await = QueueStatus::Paused;
                        let active = engine_runner.active_job_id.lock().await.clone();
                        let _ = engine_runner.event_tx.send(QueueEvent::StateChanged {
                            state: QueueStatus::Paused,
                            active_job_id: active,
                        });
                    }
                    QueueCommand::Resume => {
                        engine_runner.pause_flag.store(false, Ordering::SeqCst);
                        *engine_runner.status.lock().await = QueueStatus::Running;
                        let active = engine_runner.active_job_id.lock().await.clone();
                        let _ = engine_runner.event_tx.send(QueueEvent::StateChanged {
                            state: QueueStatus::Running,
                            active_job_id: active,
                        });
                    }
                    QueueCommand::Stop => {
                        engine_runner.stop_flag.store(true, Ordering::SeqCst);
                        *engine_runner.status.lock().await = QueueStatus::Stopping;
                        let active = engine_runner.active_job_id.lock().await.clone();
                        let _ = engine_runner.event_tx.send(QueueEvent::StateChanged {
                            state: QueueStatus::Stopping,
                            active_job_id: active,
                        });
                    }
                    QueueCommand::GetState(responder) => {
                        let s = engine_runner.state.lock().await.clone();
                        let _ = responder.send(s);
                    }
                    QueueCommand::UpdateState(new_state) => {
                        *engine_runner.state.lock().await = *new_state.clone();
                        let _ = engine_runner.persistence.save_state(&new_state);
                    }
                }
            }
        });

        (engine, handle)
    }

    /// Check if previous session crashed uncleanly
    pub fn check_unclean_shutdown(&self) -> (bool, Option<SessionLockData>) {
        self.session_lock.check_unclean_shutdown()
    }

    fn spawn_queue_runner(&self) {
        let runner = self.clone();
        tokio::spawn(async move {
            runner.run_queue().await;
        });
    }

    async fn run_queue(&self) {
        self.stop_flag.store(false, Ordering::SeqCst);
        self.pause_flag.store(false, Ordering::SeqCst);
        *self.status.lock().await = QueueStatus::Running;

        let _ = self.session_lock.acquire_lock(vec![], None, None);

        let _ = self.event_tx.send(QueueEvent::StateChanged {
            state: QueueStatus::Running,
            active_job_id: None,
        });

        loop {
            if self.stop_flag.load(Ordering::SeqCst) {
                break;
            }

            // Find next pending job
            let next_job_opt = {
                let mut state_guard = self.state.lock().await;
                let job_idx = state_guard
                    .jobs
                    .iter()
                    .position(|j| j.status == JobStatus::Pending);

                if let Some(idx) = job_idx {
                    state_guard.jobs[idx].status = JobStatus::Active;
                    state_guard.jobs[idx].started_at =
                        Some(chrono::Utc::now().timestamp_millis() as u64);
                    let job_clone = state_guard.jobs[idx].clone();
                    let _ = self.persistence.save_state(&state_guard);
                    Some(job_clone)
                } else {
                    None
                }
            };

            let Some(job) = next_job_opt else {
                break; // No more pending jobs!
            };

            *self.active_job_id.lock().await = Some(job.id.clone());
            let _ = self
                .session_lock
                .update_worker_pids(vec![], Some(job.id.clone()));

            let _ = self.event_tx.send(QueueEvent::StateChanged {
                state: QueueStatus::Running,
                active_job_id: Some(job.id.clone()),
            });

            // Execute the job via RunnerSupervisor
            self.execute_job(&job).await;

            *self.active_job_id.lock().await = None;
        }

        self.session_lock.release_lock();
        *self.status.lock().await = QueueStatus::Idle;
        *self.active_job_id.lock().await = None;

        let _ = self.event_tx.send(QueueEvent::StateChanged {
            state: QueueStatus::Idle,
            active_job_id: None,
        });
    }

    async fn execute_job(&self, job: &Job) {
        let range_config = job.range_config.clone().unwrap_or(FrameRangeConfig {
            mode: FrameRangeMode::Simple,
            simple: Some(job.range.clone()),
            ..Default::default()
        });

        let resolved = resolve_frame_range(
            &range_config,
            job.range.start,
            job.range.end,
            job.range.step,
        );
        let frames = resolved
            .map(|r| r.frames)
            .unwrap_or_else(|_| vec![job.range.start]);

        let output_pattern = job
            .output_pattern
            .clone()
            .unwrap_or_else(|| "frame_####.png".to_string());

        let output_dir = job
            .output_dir
            .as_deref()
            .map(PathBuf::from)
            .unwrap_or_else(|| self.options.runtime_dir.join("output"));

        let supervisor_config = SupervisorJobConfig {
            job_id: job.id.clone(),
            blend_path: PathBuf::from(&job.blend_path),
            executable: self.options.blender_executable.clone(),
            runner_script: self.options.runner_script.clone(),
            scene: None,
            camera: None,
            view_layers: None,
            overrides: job.overrides.clone(),
            frames: frames.clone(),
            output_pattern,
            output_dir,
            device_preferences: None,
            threads: None,
            priority: None,
            isolated_mode: false,
            auto_exec: false,
            is_video: false,
            crash_policy: job.crash_policy.clone(),
            render_missing_only: job.render_missing_only,
            pre_render_hook: job.pre_render_hook.clone(),
            path_remaps: job.missing_path_remaps.clone(),
            make_paths_absolute: None,
            runtime_dir: self.options.runtime_dir.clone(),
            logs_dir: self.options.logs_dir.clone(),
        };

        let (sup_tx, mut sup_rx) = mpsc::unbounded_channel();
        let (supervisor, _sup_handle) = RunnerSupervisor::new(supervisor_config, sup_tx);

        let sup_task = tokio::spawn(async move { supervisor.run().await });

        // Forward supervisor events to queue broadcast
        while let Some(ev) = sup_rx.recv().await {
            match ev {
                SupervisorEvent::JobStart {
                    total_frames,
                    frames,
                    ..
                } => {
                    let _ = self.event_tx.send(QueueEvent::JobStart {
                        job_id: job.id.clone(),
                        total_frames,
                        frames,
                    });
                }
                SupervisorEvent::Progress {
                    frame,
                    sample_current,
                    sample_total,
                    ..
                } => {
                    let _ = self.event_tx.send(QueueEvent::JobProgress {
                        job_id: job.id.clone(),
                        frame,
                        sample_current,
                        sample_total,
                        progress: 0.0,
                        eta_seconds: None,
                    });
                }
                SupervisorEvent::FrameDone {
                    frame, eta_seconds, ..
                } => {
                    let _ = self.event_tx.send(QueueEvent::JobProgress {
                        job_id: job.id.clone(),
                        frame: Some(frame),
                        sample_current: None,
                        sample_total: None,
                        progress: 100.0,
                        eta_seconds,
                    });
                }
                SupervisorEvent::Log {
                    stream,
                    line,
                    is_error,
                } => {
                    let _ = self.event_tx.send(QueueEvent::LogLine {
                        job_id: job.id.clone(),
                        stream,
                        line,
                        is_error,
                    });
                }
                SupervisorEvent::JobDone {
                    status,
                    completed_frames,
                    failed_frames,
                    history_entry,
                    ..
                } => {
                    let _ = self.history_store.append_entry(&history_entry);
                    let _ = self.event_tx.send(QueueEvent::JobHistory(history_entry));
                    let _ = self.event_tx.send(QueueEvent::JobDone {
                        job_id: job.id.clone(),
                        status,
                        completed_frames,
                        failed_frames: failed_frames.len(),
                    });
                }
                _ => {}
            }
        }

        let run_result = sup_task
            .await
            .unwrap_or(Err("Supervisor panicked".to_string()));

        // Update job status in persistent state
        let mut state_guard = self.state.lock().await;
        if let Some(j) = state_guard.jobs.iter_mut().find(|j| j.id == job.id) {
            j.completed_at = Some(chrono::Utc::now().timestamp_millis() as u64);
            match run_result {
                Ok(HistoryResult::Completed) | Ok(HistoryResult::CompletedWithWarnings) => {
                    j.status = JobStatus::Done;
                    j.progress = 100.0;
                }
                Ok(HistoryResult::CompletedWithErrors) => {
                    j.status = JobStatus::Done;
                }
                Ok(HistoryResult::Canceled) => {
                    j.status = JobStatus::Canceled;
                }
                _ => {
                    j.status = JobStatus::Failed;
                }
            }
        }
        let _ = self.persistence.save_state(&state_guard);
    }
}

impl Clone for QueueEngine {
    fn clone(&self) -> Self {
        Self {
            options: QueueEngineOptions {
                app_data_dir: self.options.app_data_dir.clone(),
                runtime_dir: self.options.runtime_dir.clone(),
                logs_dir: self.options.logs_dir.clone(),
                runner_script: self.options.runner_script.clone(),
                blender_executable: self.options.blender_executable.clone(),
            },
            persistence: QueuePersistence::new(&self.options.app_data_dir),
            session_lock: SessionLockManager::new(&self.options.app_data_dir),
            history_store: HistoryStore::new(&self.options.app_data_dir),
            state: self.state.clone(),
            status: self.status.clone(),
            active_job_id: self.active_job_id.clone(),
            event_tx: self.event_tx.clone(),
            stop_flag: self.stop_flag.clone(),
            pause_flag: self.pause_flag.clone(),
        }
    }
}
