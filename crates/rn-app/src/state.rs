// Render Night - Application State & Event Architecture
// SPDX-License-Identifier: GPL-3.0-or-later

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use rn_core::preflight::checker::{PreflightChecker, PreflightJobInput, PreflightOptions};
use rn_core::queue::{QueueEvent, QueueStatus};
use rn_core::ranges::{FrameRangeConfig, FrameRangeMode, SimpleRange};
use rn_core::schemas::inspect::InspectOutput;
use rn_core::schemas::override_schema::OverrideMap;
use rn_core::schemas::preflight::PreflightReport;
use rn_core::schemas::queue_state::{Job, JobStatus, PostAction, QueueSettings, QueueState};

pub const SAMPLE_INSPECT_JSON: &str = include_str!("../../../tests/golden/inspect_sample.json");
static JOB_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavItem {
    Queue,
    History,
    Tools,
    Settings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DockTab {
    Preview,
    FrameTimes,
    Console,
}

#[derive(Debug, Clone)]
pub struct ConsoleLogLine {
    pub timestamp: u64,
    pub stream: String,
    pub line: String,
    pub is_error: bool,
}

#[derive(Debug, Clone)]
pub struct FrameTimeSample {
    pub frame: i32,
    pub duration_secs: f64,
    pub is_failed: bool,
}

#[derive(Debug, Clone)]
pub struct AppState {
    pub queue_state: QueueState,
    pub queue_status: QueueStatus,
    pub active_job_id: Option<String>,
    pub selected_job_ids: HashSet<String>,
    pub editing_job_id: Option<String>,
    pub preflight_report: Option<PreflightReport>,
    pub show_preflight_banner: bool,
    pub preflight_countdown: Option<u32>,
    pub monitor_expanded: bool,
    pub active_dock_tab: DockTab,
    pub active_nav_item: NavItem,
    pub console_logs: Vec<ConsoleLogLine>,
    pub frame_times: Vec<FrameTimeSample>,
    pub preview_image_path: Option<PathBuf>,
    pub when_finished: PostAction,
    pub current_sample: Option<(i32, i32)>,
    pub current_frame: Option<(i32, usize)>,
    pub eta_seconds: Option<u64>,
    pub last_ui_push: Instant,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        Self {
            queue_state: QueueState {
                version: 1,
                jobs: Vec::new(),
                settings: QueueSettings::default(),
            },
            queue_status: QueueStatus::Idle,
            active_job_id: None,
            selected_job_ids: HashSet::new(),
            editing_job_id: None,
            preflight_report: None,
            show_preflight_banner: false,
            preflight_countdown: None,
            monitor_expanded: false,
            active_dock_tab: DockTab::Preview,
            active_nav_item: NavItem::Queue,
            console_logs: Vec::new(),
            frame_times: Vec::new(),
            preview_image_path: None,
            when_finished: PostAction::None,
            current_sample: None,
            current_frame: None,
            eta_seconds: None,
            last_ui_push: Instant::now(),
        }
    }

    /// Add a job with default or custom configuration
    #[allow(clippy::too_many_arguments)]
    pub fn add_job(
        &mut self,
        name: &str,
        blend_path: &str,
        frame_start: i32,
        frame_end: i32,
        device: &str,
        engine: &str,
        inspect_data: Option<serde_json::Value>,
    ) -> String {
        let seq = JOB_COUNTER.fetch_add(1, Ordering::SeqCst);
        let job_id = format!("job_{}_{}", self.queue_state.jobs.len() + 1, seq);
        let inspect_val = inspect_data.unwrap_or_else(|| {
            serde_json::from_str(SAMPLE_INSPECT_JSON).unwrap_or(serde_json::Value::Null)
        });

        let job = Job {
            id: job_id.clone(),
            blend_path: blend_path.to_string(),
            name: name.to_string(),
            status: JobStatus::Pending,
            range: SimpleRange {
                start: frame_start,
                end: frame_end,
                step: 1,
            },
            range_config: Some(FrameRangeConfig {
                mode: FrameRangeMode::SceneDefault,
                simple: None,
                custom_expression: None,
                single_still_frame: None,
            }),
            crash_policy: None,
            render_missing_only: false,
            failed_frames: Vec::new(),
            overrides: OverrideMap::new(),
            presets: Vec::new(),
            output_dir: Some("//render/".to_string()),
            output_pattern: Some("{scene}_{camera}_####.png".to_string()),
            device: Some(device.to_string()),
            engine: Some(engine.to_string()),
            created_at: 1732300000,
            started_at: None,
            completed_at: None,
            error: None,
            progress: 0.0,
            last_frame: None,
            inspect: Some(inspect_val),
            pre_render_hook: None,
            is_basic_mode: None,
            basic_mode_reason: None,
            ignore_all_warnings: Some(false),
            ignored_warning_codes: Some(Vec::new()),
            ignored_warning_ids: Some(Vec::new()),
            missing_path_remaps: None,
        };

        self.queue_state.jobs.push(job);
        self.run_preflight_check();
        job_id
    }

    /// Run preflight checks over current queue jobs
    pub fn run_preflight_check(&mut self) {
        let mut preflight_inputs = Vec::new();
        for job in &self.queue_state.jobs {
            let inspect_out: Option<InspectOutput> = job
                .inspect
                .as_ref()
                .and_then(|v| serde_json::from_value(v.clone()).ok());

            preflight_inputs.push(PreflightJobInput {
                id: job.id.clone(),
                file_name: job.name.clone(),
                file_path: job.blend_path.clone(),
                selected_scene: inspect_out.as_ref().map(|i| i.active_scene.clone()),
                selected_camera: None,
                scenes: inspect_out
                    .as_ref()
                    .map(|i| i.scenes.clone())
                    .unwrap_or_default(),
                available_cameras: Vec::new(),
                output_path_pattern: job.output_pattern.clone(),
                output_preview: job.output_dir.clone(),
                range_config: job.range_config.clone(),
                overrides: job.overrides.clone(),
                saved_with_version: inspect_out.as_ref().map(|i| i.saved_with_version.clone()),
                inspect_data: inspect_out,
                inspect_error: None,
                requested_gpu: job
                    .device
                    .as_deref()
                    .unwrap_or("GPU")
                    .to_uppercase()
                    .contains("GPU"),
                ignored_warning_codes: job.ignored_warning_codes.clone().unwrap_or_default(),
                ignored_warning_ids: job.ignored_warning_ids.clone().unwrap_or_default(),
                ignore_all_warnings: job.ignore_all_warnings.unwrap_or(false),
            });
        }

        let options = PreflightOptions {
            selected_blender: None,
            min_free_disk_space_mb: Some(1024),
            check_disk_access: false,
            check_disk_space: false,
        };

        let report = PreflightChecker::check_all_jobs(&preflight_inputs, &options);
        if report.has_warnings || report.has_errors {
            self.show_preflight_banner = true;
            if self.queue_state.settings.preflight_mode.as_deref() == Some("ask") {
                self.preflight_countdown = self
                    .queue_state
                    .settings
                    .preflight_countdown_seconds
                    .or(Some(30));
            }
        } else {
            self.show_preflight_banner = false;
            self.preflight_countdown = None;
        }
        self.preflight_report = Some(report);
    }

    /// Remove a job by ID
    pub fn remove_job(&mut self, job_id: &str) {
        self.queue_state.jobs.retain(|j| j.id != job_id);
        self.selected_job_ids.remove(job_id);
        if self.editing_job_id.as_deref() == Some(job_id) {
            self.editing_job_id = None;
        }
        self.run_preflight_check();
    }

    /// Move job up in queue
    pub fn move_job_up(&mut self, job_id: &str) {
        if let Some(pos) = self.queue_state.jobs.iter().position(|j| j.id == job_id) {
            if pos > 0 {
                self.queue_state.jobs.swap(pos, pos - 1);
            }
        }
    }

    /// Move job down in queue
    pub fn move_job_down(&mut self, job_id: &str) {
        if let Some(pos) = self.queue_state.jobs.iter().position(|j| j.id == job_id) {
            if pos + 1 < self.queue_state.jobs.len() {
                self.queue_state.jobs.swap(pos, pos + 1);
            }
        }
    }

    /// Toggle selection of a single job
    pub fn toggle_select_job(&mut self, job_id: &str) {
        if self.selected_job_ids.contains(job_id) {
            self.selected_job_ids.remove(job_id);
        } else {
            self.selected_job_ids.insert(job_id.to_string());
        }
    }

    /// Select all jobs
    pub fn select_all(&mut self) {
        for job in &self.queue_state.jobs {
            self.selected_job_ids.insert(job.id.clone());
        }
    }

    /// Deselect all jobs
    pub fn deselect_all(&mut self) {
        self.selected_job_ids.clear();
    }

    /// Open slide-over editor for job
    pub fn open_editor(&mut self, job_id: &str) {
        self.editing_job_id = Some(job_id.to_string());
    }

    /// Close slide-over editor
    pub fn close_editor(&mut self) {
        self.editing_job_id = None;
    }

    /// Set an override on a specific job
    pub fn set_job_override(&mut self, job_id: &str, key: &str, val: serde_json::Value) {
        if let Some(job) = self.queue_state.jobs.iter_mut().find(|j| j.id == job_id) {
            job.overrides.insert(key.to_string(), val);
        }
        self.run_preflight_check();
    }

    /// Reset an override on a specific job
    pub fn reset_job_override(&mut self, job_id: &str, key: &str) {
        if let Some(job) = self.queue_state.jobs.iter_mut().find(|j| j.id == job_id) {
            job.overrides.remove(key);
        }
        self.run_preflight_check();
    }

    /// Reset all overrides on a job
    pub fn reset_all_job_overrides(&mut self, job_id: &str) {
        if let Some(job) = self.queue_state.jobs.iter_mut().find(|j| j.id == job_id) {
            job.overrides.clear();
        }
        self.run_preflight_check();
    }

    /// Bulk action: Set engine for selected jobs
    pub fn bulk_set_engine(&mut self, engine: &str) {
        let selected = self.selected_job_ids.clone();
        for job in &mut self.queue_state.jobs {
            if selected.contains(&job.id) {
                job.engine = Some(engine.to_string());
                job.overrides.insert(
                    "scene.render.engine".to_string(),
                    serde_json::Value::String(engine.to_string()),
                );
            }
        }
        self.run_preflight_check();
    }

    /// Bulk action: Set samples for selected jobs
    pub fn bulk_set_samples(&mut self, samples: i64) {
        let selected = self.selected_job_ids.clone();
        for job in &mut self.queue_state.jobs {
            if selected.contains(&job.id) {
                job.overrides.insert(
                    "scene.cycles.samples".to_string(),
                    serde_json::json!(samples),
                );
            }
        }
    }

    /// Bulk action: Set resolution percentage for selected jobs
    pub fn bulk_set_resolution_percentage(&mut self, pct: f64) {
        let selected = self.selected_job_ids.clone();
        for job in &mut self.queue_state.jobs {
            if selected.contains(&job.id) {
                job.overrides.insert(
                    "scene.render.resolution_percentage".to_string(),
                    serde_json::json!(pct),
                );
            }
        }
    }

    /// Bulk action: Reset all overrides on selected jobs
    pub fn bulk_reset_overrides(&mut self) {
        let selected = self.selected_job_ids.clone();
        for job in &mut self.queue_state.jobs {
            if selected.contains(&job.id) {
                job.overrides.clear();
            }
        }
        self.run_preflight_check();
    }

    /// Bulk action: Remove selected jobs
    pub fn bulk_remove(&mut self) {
        let selected = self.selected_job_ids.clone();
        self.queue_state.jobs.retain(|j| !selected.contains(&j.id));
        self.selected_job_ids.clear();
        if let Some(ref editing) = self.editing_job_id {
            if selected.contains(editing) {
                self.editing_job_id = None;
            }
        }
        self.run_preflight_check();
    }

    /// Start or Resume Queue
    pub fn start_queue(&mut self) {
        if self.queue_status == QueueStatus::Paused {
            self.queue_status = QueueStatus::Running;
            return;
        }
        if self.queue_state.jobs.is_empty() {
            return;
        }

        self.queue_status = QueueStatus::Running;
        if self.active_job_id.is_none() {
            if let Some(first) = self.queue_state.jobs.first_mut() {
                first.status = JobStatus::Active;
                self.active_job_id = Some(first.id.clone());
            }
        }
    }

    /// Pause Queue
    pub fn pause_queue(&mut self) {
        self.queue_status = QueueStatus::Paused;
        if let Some(ref active_id) = self.active_job_id {
            if let Some(job) = self
                .queue_state
                .jobs
                .iter_mut()
                .find(|j| &j.id == active_id)
            {
                job.status = JobStatus::Paused;
            }
        }
    }

    /// Stop Queue
    pub fn stop_queue(&mut self) {
        self.queue_status = QueueStatus::Idle;
        if let Some(ref active_id) = self.active_job_id {
            if let Some(job) = self
                .queue_state
                .jobs
                .iter_mut()
                .find(|j| &j.id == active_id)
            {
                job.status = JobStatus::Pending;
            }
        }
        self.active_job_id = None;
        self.current_sample = None;
        self.current_frame = None;
        self.eta_seconds = None;
    }

    /// Dismiss / Bypass preflight warnings and proceed immediately
    pub fn render_anyway(&mut self) {
        self.show_preflight_banner = false;
        self.preflight_countdown = None;
        self.start_queue();
    }

    /// Ignore a specific preflight warning
    pub fn dismiss_preflight_warning(&mut self, issue_id: &str) {
        for job in &mut self.queue_state.jobs {
            let mut ids = job.ignored_warning_ids.clone().unwrap_or_default();
            ids.push(issue_id.to_string());
            job.ignored_warning_ids = Some(ids);
        }
        self.run_preflight_check();
    }

    /// Toggle bottom monitor dock
    pub fn toggle_monitor_dock(&mut self) {
        self.monitor_expanded = !self.monitor_expanded;
    }

    /// Set active tab in monitor dock
    pub fn set_dock_tab(&mut self, tab: DockTab) {
        self.active_dock_tab = tab;
    }

    /// Set active navigation rail item
    pub fn set_nav_item(&mut self, item: NavItem) {
        self.active_nav_item = item;
    }

    /// Set When Finished PostAction
    pub fn set_when_finished(&mut self, action: PostAction) {
        self.when_finished = action;
        self.queue_state.settings.post_action = action;
    }

    /// Append console log line
    pub fn append_log(&mut self, stream: &str, line: &str, is_error: bool) {
        let entry = ConsoleLogLine {
            timestamp: 1732300000,
            stream: stream.to_string(),
            line: line.to_string(),
            is_error,
        };
        self.console_logs.push(entry);
        if self.console_logs.len() > 100_000 {
            self.console_logs.remove(0);
        }
    }

    /// Handle incoming Core QueueEvent with 5 Hz throttling awareness
    pub fn handle_queue_event(&mut self, event: QueueEvent) {
        match event {
            QueueEvent::StateChanged {
                state,
                active_job_id,
            } => {
                self.queue_status = state;
                self.active_job_id = active_job_id;
            }
            QueueEvent::JobStart {
                job_id,
                total_frames,
                ..
            } => {
                if let Some(job) = self.queue_state.jobs.iter_mut().find(|j| j.id == job_id) {
                    job.status = JobStatus::Active;
                    job.progress = 0.0;
                }
                self.active_job_id = Some(job_id);
                self.current_frame = Some((1, total_frames));
            }
            QueueEvent::JobProgress {
                job_id,
                frame,
                sample_current,
                sample_total,
                progress,
                eta_seconds,
            } => {
                if let Some(job) = self.queue_state.jobs.iter_mut().find(|j| j.id == job_id) {
                    job.progress = progress;
                    if let Some(f) = frame {
                        job.last_frame = Some(f);
                        let total = (job.range.end - job.range.start + 1).max(1) as usize;
                        self.current_frame = Some((f, total));
                    }
                }
                if let (Some(cur), Some(tot)) = (sample_current, sample_total) {
                    self.current_sample = Some((cur, tot));
                }
                self.eta_seconds = eta_seconds;
            }
            QueueEvent::JobDone {
                job_id,
                completed_frames,
                failed_frames,
                ..
            } => {
                if let Some(job) = self.queue_state.jobs.iter_mut().find(|j| j.id == job_id) {
                    job.status = if failed_frames == 0 || completed_frames > 0 {
                        JobStatus::Done
                    } else {
                        JobStatus::Failed
                    };
                    job.progress = 1.0;
                }
                self.current_sample = None;
            }
            QueueEvent::LogLine {
                stream,
                line,
                is_error,
                ..
            } => {
                self.append_log(&stream, &line, is_error);
            }
            QueueEvent::JobHistory(_) => {}
        }
    }

    /// Helper to get effective settings string for a job
    pub fn effective_settings_summary(&self, job: &Job) -> String {
        let inspect_scene = job.inspect.as_ref().and_then(|v| {
            let out: Option<InspectOutput> = serde_json::from_value(v.clone()).ok();
            out.and_then(|o| o.scenes.into_iter().next())
        });

        let scene_name = inspect_scene
            .as_ref()
            .map(|s| s.name.as_str())
            .unwrap_or("Scene");
        let frames_count = (job.range.end - job.range.start + 1).max(1);
        let res_x = inspect_scene
            .as_ref()
            .map(|s| s.resolution_x)
            .unwrap_or(1920);
        let res_y = inspect_scene
            .as_ref()
            .map(|s| s.resolution_y)
            .unwrap_or(1080);
        let pct = job
            .overrides
            .get("scene.render.resolution_percentage")
            .and_then(|v| v.as_f64())
            .unwrap_or(100.0);

        let engine = job.engine.as_deref().unwrap_or("Cycles");
        let device = job.device.as_deref().unwrap_or("GPU");
        let samples = job
            .overrides
            .get("scene.cycles.samples")
            .and_then(|v| v.as_i64())
            .unwrap_or(128);

        let output = job.output_dir.as_deref().unwrap_or("//render/");

        let engine_display = if engine.to_uppercase().contains("CYCLES") {
            "Cycles"
        } else if engine.to_uppercase().contains("EEVEE") {
            "EEVEE"
        } else {
            engine
        };

        format!(
            "Scene: {} | Frames: {}..{} ({} f) | {}x{} ({:.0}%) | {} · {} ({} spl) | Output: {}",
            scene_name,
            job.range.start,
            job.range.end,
            frames_count,
            res_x,
            res_y,
            pct,
            engine_display,
            device,
            samples,
            output
        )
    }

    /// Populate standard 3-job acceptance scenario
    pub fn load_acceptance_scenario(&mut self) {
        self.queue_state.jobs.clear();
        self.selected_job_ids.clear();
        self.console_logs.clear();
        self.frame_times.clear();

        // Ensure temp scene files exist on disk so preflight does not flag false BLEND_NOT_FOUND
        let scenes_dir = std::env::temp_dir().join("rn_acceptance_scenes");
        std::fs::create_dir_all(&scenes_dir).ok();

        let p1 = scenes_dir.join("archviz_living_room_cycles.blend");
        let p2 = scenes_dir.join(
            "production_render_shot_042_sequence_lighting_final_v098_with_compositing_passes.blend",
        );
        let p3 = scenes_dir.join("منظر_رینڈر_رات_01.blend");

        std::fs::write(&p1, b"BLENDER_V402").ok();
        std::fs::write(&p2, b"BLENDER_V402").ok();
        std::fs::write(&p3, b"BLENDER_V402").ok();

        // Job 1: Standard archviz job
        let j1 = self.add_job(
            "archviz_living_room_cycles.blend",
            p1.to_str()
                .unwrap_or("/scenes/archviz_living_room_cycles.blend"),
            1,
            250,
            "GPU · OptiX",
            "CYCLES",
            None,
        );

        // Job 2: Long filename job with preflight warnings (missing texture)
        let _j2 = self.add_job(
            "production_render_shot_042_sequence_lighting_final_v098_with_compositing_passes.blend",
            p2.to_str()
                .unwrap_or("/scenes/production_render_shot_042.blend"),
            100,
            180,
            "GPU · CUDA",
            "CYCLES",
            None,
        );

        // Job 3: Non-Latin filenames (Urdu)
        let _j3 = self.add_job(
            "منظر_رینڈر_رات_01.blend",
            p3.to_str().unwrap_or("/scenes/منظر_رینڈر_رات_01.blend"),
            1,
            120,
            "CPU",
            "BLENDER_EEVEE_NEXT",
            None,
        );

        // Seed some frame times for sparkline verification
        self.frame_times = vec![
            FrameTimeSample {
                frame: 1,
                duration_secs: 2.1,
                is_failed: false,
            },
            FrameTimeSample {
                frame: 2,
                duration_secs: 2.3,
                is_failed: false,
            },
            FrameTimeSample {
                frame: 3,
                duration_secs: 2.2,
                is_failed: false,
            },
            FrameTimeSample {
                frame: 4,
                duration_secs: 4.8,
                is_failed: false,
            }, // slower frame
            FrameTimeSample {
                frame: 5,
                duration_secs: 2.4,
                is_failed: false,
            },
            FrameTimeSample {
                frame: 6,
                duration_secs: 2.2,
                is_failed: false,
            },
        ];

        // Seed sample console logs
        self.append_log("stdout", "Fra:1 Mem:142.50M (Peak 180.12M) | Time:00:02.14 | Remaining:08:45.12 | Mem:124.0M, Peak:180.1M | Scene, ViewLayer | Rendered 128/128 Tiles", false);
        self.append_log("stdout", "Fra:2 Mem:144.10M (Peak 182.40M) | Time:00:02.31 | Remaining:08:42.00 | Mem:125.0M, Peak:182.4M | Scene, ViewLayer | Rendered 128/128 Tiles", false);
        self.append_log(
            "stderr",
            "Warning: Texture \"dirt_diffuse.png\" not found on disk, using fallback pink",
            true,
        );

        // Set job 1 as currently rendering
        if let Some(j) = self.queue_state.jobs.first_mut() {
            j.status = JobStatus::Active;
            j.progress = 0.35;
            j.last_frame = Some(88);
        }
        self.active_job_id = Some(j1);
        self.queue_status = QueueStatus::Running;
        self.current_sample = Some((45, 128));
        self.current_frame = Some((88, 250));
        self.eta_seconds = Some(145);

        // Preflight check
        self.run_preflight_check();
    }
}
