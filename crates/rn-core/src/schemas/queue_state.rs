use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::override_schema::{CrashPolicy, OverrideMap};
use crate::ranges::{FrameRangeConfig, SimpleRange};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Pending,
    Active,
    Paused,
    Done,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FailedFrame {
    pub frame: i32,
    pub error: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stderr_tail: Option<String>,
    pub timestamp: u64,
    #[serde(default = "default_attempt_count")]
    pub attempt_count: u32,
}

fn default_attempt_count() -> u32 {
    1
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub blend_path: String,
    pub name: String,
    pub status: JobStatus,
    pub range: SimpleRange,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range_config: Option<FrameRangeConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crash_policy: Option<CrashPolicy>,
    #[serde(default)]
    pub render_missing_only: bool,
    #[serde(default)]
    pub failed_frames: Vec<FailedFrame>,
    #[serde(default)]
    pub overrides: OverrideMap,
    #[serde(default)]
    pub presets: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_pattern: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine: Option<String>,
    pub created_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default)]
    pub progress: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_frame: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inspect: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pre_render_hook: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_basic_mode: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub basic_mode_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ignore_all_warnings: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ignored_warning_codes: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ignored_warning_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub missing_path_remaps: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "snake_case")]
pub enum PostAction {
    #[default]
    None,
    Sleep,
    Hibernate,
    Shutdown,
    Restart,
    CloseApp,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SoundSettings {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_volume")]
    pub volume: u32,
    #[serde(default)]
    pub play_on_failure: bool,
}

impl Default for SoundSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            volume: 100,
            play_on_failure: false,
        }
    }
}

fn default_true() -> bool {
    true
}
fn default_volume() -> u32 {
    100
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_time: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_timestamp: Option<u64>,
    #[serde(default = "default_true")]
    pub block_sleep_while_waiting: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_immediately: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_time: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_action: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct QueueSettings {
    #[serde(default = "default_one")]
    pub concurrent_jobs: u32,
    #[serde(default)]
    pub stop_on_failure: bool,
    #[serde(default)]
    pub close_app_on_completion: bool,
    #[serde(default = "default_last")]
    pub close_app_on_completion_mode: String,
    #[serde(default = "default_true")]
    pub sound_on_completion: bool,
    #[serde(default = "default_true")]
    pub sound_on_failure: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sound_path: Option<String>,
    #[serde(default = "default_none_str")]
    pub power_mode: String,
    #[serde(default)]
    pub pause_on_battery: bool,
    #[serde(default)]
    pub resume_on_ac: bool,
    #[serde(default = "default_one")]
    pub max_concurrent_frames: u32,
    #[serde(default)]
    pub post_action: PostAction,
    #[serde(default)]
    pub sound: SoundSettings,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule: Option<ScheduleConfig>,
    #[serde(default = "default_never_block")]
    pub preflight_mode: Option<String>,
    #[serde(default = "default_countdown")]
    pub preflight_countdown_seconds: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_blender_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub isolated_mode: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_exec: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_priority: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_threads: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub block_sleep_during_render: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub block_sleep_while_scheduled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_free_disk_space_mb: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_crash_policy: Option<CrashPolicy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_blender_paths: Option<Vec<String>>,
}

fn default_one() -> u32 {
    1
}
fn default_last() -> String {
    "last".to_string()
}
fn default_none_str() -> String {
    "none".to_string()
}
fn default_never_block() -> Option<String> {
    Some("never_block".to_string())
}
fn default_countdown() -> Option<u32> {
    Some(30)
}

impl Default for QueueSettings {
    fn default() -> Self {
        Self {
            concurrent_jobs: 1,
            stop_on_failure: false,
            close_app_on_completion: false,
            close_app_on_completion_mode: "last".to_string(),
            sound_on_completion: true,
            sound_on_failure: true,
            sound_path: None,
            power_mode: "none".to_string(),
            pause_on_battery: false,
            resume_on_ac: false,
            max_concurrent_frames: 1,
            post_action: PostAction::None,
            sound: SoundSettings::default(),
            schedule: None,
            preflight_mode: Some("never_block".to_string()),
            preflight_countdown_seconds: Some(30),
            default_blender_id: None,
            isolated_mode: None,
            auto_exec: None,
            default_priority: None,
            default_threads: None,
            block_sleep_during_render: None,
            block_sleep_while_scheduled: None,
            min_free_disk_space_mb: None,
            default_crash_policy: None,
            custom_blender_paths: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct QueueState {
    pub version: u32,
    pub jobs: Vec<Job>,
    pub settings: QueueSettings,
}
