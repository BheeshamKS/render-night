// Render Night - Queue State Persistence & Migrations
// SPDX-License-Identifier: GPL-3.0-or-later

use std::fs;
use std::path::{Path, PathBuf};
use tracing::info;

use super::atomic_file::write_atomic_json;
use crate::ranges::{FrameRangeConfig, SimpleRange};
use crate::schemas::queue_state::{Job, JobStatus, QueueSettings, QueueState};

pub const CURRENT_SCHEMA_VERSION: u32 = 1;

pub struct QueuePersistence {
    state_file_path: PathBuf,
}

impl QueuePersistence {
    pub fn new(app_data_dir: &Path) -> Self {
        Self {
            state_file_path: app_data_dir.join("queue-state.json"),
        }
    }

    pub fn state_file_path(&self) -> &Path {
        &self.state_file_path
    }

    /// Load the current queue state, applying migrations if necessary.
    pub fn load_state(&self) -> std::io::Result<QueueState> {
        if !self.state_file_path.exists() {
            let default_state = QueueState::default();
            self.save_state(&default_state)?;
            return Ok(default_state);
        }

        let content = fs::read_to_string(&self.state_file_path)?;
        Self::import_or_migrate_state(&content)
    }

    /// Save the queue state atomically to disk.
    pub fn save_state(&self, state: &QueueState) -> std::io::Result<()> {
        write_atomic_json(&self.state_file_path, state)
    }

    /// Parses and migrates arbitrary JSON representing queue state (including legacy v0 / v1 formats).
    pub fn import_or_migrate_state(json_str: &str) -> std::io::Result<QueueState> {
        // Try deserializing directly as current QueueState
        if let Ok(state) = serde_json::from_str::<QueueState>(json_str) {
            return Ok(state);
        }

        // Check if wrapped in an envelope like {"queue_state_v1": ...} or {"legacy_v0_unmigrated": ...}
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
            if let Some(obj) = val.as_object() {
                // If there's a key like "queue_state_v1" or similar
                for inner_val in obj.values() {
                    if inner_val.is_object() && inner_val.get("jobs").is_some() {
                        if let Ok(migrated) = Self::migrate_from_value(inner_val) {
                            return Ok(migrated);
                        }
                    }
                }
            }

            // Otherwise migrate the root value
            return Self::migrate_from_value(&val);
        }

        Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Failed to parse queue state JSON",
        ))
    }

    fn migrate_from_value(val: &serde_json::Value) -> std::io::Result<QueueState> {
        let version = val.get("version").and_then(|v| v.as_u64()).unwrap_or(0) as u32;

        info!("Migrating queue state from version {}", version);

        let jobs_raw = val.get("jobs").and_then(|j| j.as_array());
        let mut jobs = Vec::new();

        if let Some(arr) = jobs_raw {
            for j in arr {
                if let Ok(job) = Self::parse_legacy_job(j) {
                    jobs.push(job);
                }
            }
        }

        let settings = if let Some(s) = val.get("settings") {
            serde_json::from_value::<QueueSettings>(s.clone()).unwrap_or_default()
        } else {
            QueueSettings::default()
        };

        Ok(QueueState {
            version: CURRENT_SCHEMA_VERSION,
            jobs,
            settings,
        })
    }

    fn parse_legacy_job(j: &serde_json::Value) -> Result<Job, String> {
        let id = j
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("job")
            .to_string();
        let blend_path = j
            .get("blendPath")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let name = j
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let status_str = j
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("pending");
        let status = match status_str.to_lowercase().as_str() {
            "active" => JobStatus::Active,
            "paused" => JobStatus::Paused,
            "done" => JobStatus::Done,
            "failed" => JobStatus::Failed,
            "canceled" => JobStatus::Canceled,
            "inspecting" => JobStatus::Inspecting,
            _ => JobStatus::Pending,
        };

        // Range parsing
        let range = if let Some(r) = j.get("range") {
            if let Ok(sr) = serde_json::from_value::<SimpleRange>(r.clone()) {
                sr
            } else if let Some(s) = r.as_str() {
                // If it was a string range "1-50"
                crate::ranges::parse_custom_range(s)
                    .ok()
                    .and_then(|frames| frames.first().copied())
                    .map(|f| SimpleRange {
                        start: f,
                        end: f,
                        step: 1,
                    })
                    .unwrap_or_default()
            } else {
                SimpleRange::default()
            }
        } else {
            SimpleRange::default()
        };

        let range_config = j
            .get("rangeConfig")
            .and_then(|rc| serde_json::from_value::<FrameRangeConfig>(rc.clone()).ok());

        let crash_policy = j
            .get("crashPolicy")
            .and_then(|cp| serde_json::from_value(cp.clone()).ok());

        let render_missing_only = j
            .get("renderMissingOnly")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let overrides = j
            .get("overrides")
            .and_then(|ov| serde_json::from_value(ov.clone()).ok())
            .unwrap_or_default();

        let presets = j
            .get("presets")
            .and_then(|p| serde_json::from_value(p.clone()).ok())
            .unwrap_or_default();

        let output_dir = j
            .get("outputDir")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let output_pattern = j
            .get("outputPattern")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let device = j
            .get("device")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let engine = j
            .get("engine")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let created_at = j.get("createdAt").and_then(|v| v.as_u64()).unwrap_or(0);
        let progress = j.get("progress").and_then(|v| v.as_f64()).unwrap_or(0.0);

        Ok(Job {
            id,
            blend_path,
            name,
            status,
            range,
            range_config,
            crash_policy,
            render_missing_only,
            failed_frames: Vec::new(),
            overrides,
            presets,
            output_dir,
            output_pattern,
            device,
            engine,
            created_at,
            started_at: None,
            completed_at: None,
            error: None,
            progress,
            last_frame: None,
            inspect: None,
            pre_render_hook: None,
            is_basic_mode: None,
            basic_mode_reason: None,
            ignore_all_warnings: None,
            ignored_warning_codes: None,
            ignored_warning_ids: None,
            missing_path_remaps: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_legacy_queue_state_import() {
        let json_str = include_str!("../../../../tests/golden/legacy_queue_state.json");
        let parsed: serde_json::Value = serde_json::from_str(json_str).unwrap();

        // 1. Migrate queue_state_v1
        let v1_val = &parsed["queue_state_v1"];
        let state1 = QueuePersistence::migrate_from_value(v1_val).unwrap();
        assert_eq!(state1.version, 1);
        assert_eq!(state1.jobs.len(), 2);
        assert_eq!(state1.jobs[0].id, "job-101");
        assert_eq!(
            state1.jobs[0]
                .range_config
                .as_ref()
                .unwrap()
                .custom_expression
                .as_deref(),
            Some("1-20, 30-50")
        );
        assert_eq!(state1.jobs[1].id, "job-102");
        assert_eq!(state1.jobs[1].status, JobStatus::Done);

        // 2. Migrate legacy_v0_unmigrated
        let v0_val = &parsed["legacy_v0_unmigrated"];
        let state0 = QueuePersistence::migrate_from_value(v0_val).unwrap();
        assert_eq!(state0.version, 1);
        assert_eq!(state0.jobs.len(), 1);
        assert_eq!(state0.jobs[0].id, "v0-job");
    }

    #[test]
    fn test_queue_persistence_save_load() {
        let temp = tempdir().unwrap();
        let pers = QueuePersistence::new(temp.path());

        let mut state = QueueState::default();
        state.settings.concurrent_jobs = 4;
        pers.save_state(&state).unwrap();

        let loaded = pers.load_state().unwrap();
        assert_eq!(loaded.settings.concurrent_jobs, 4);
    }
}
