use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type OverrideMap = HashMap<String, serde_json::Value>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DevicePreferences {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_type: Option<String>,
    #[serde(default = "default_true")]
    pub enable_gpu: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_devices: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CrashPolicy {
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
    #[serde(default = "default_true")]
    pub fallback_to_cpu: bool,
    #[serde(default = "default_true")]
    pub skip_on_failure: bool,
    #[serde(default = "default_max_consecutive_crashes")]
    pub max_consecutive_crashes: u32,
}

impl Default for CrashPolicy {
    fn default() -> Self {
        Self {
            max_retries: 2,
            fallback_to_cpu: true,
            skip_on_failure: true,
            max_consecutive_crashes: 3,
        }
    }
}

fn default_max_retries() -> u32 {
    2
}
fn default_max_consecutive_crashes() -> u32 {
    3
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CrashConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frame: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frames: Option<Vec<i32>>,
    #[serde(default = "default_true")]
    pub crash_gpu: bool,
    #[serde(default = "default_true")]
    pub crash_cpu: bool,
}

impl Default for CrashConfig {
    fn default() -> Self {
        Self {
            frame: None,
            frames: None,
            crash_gpu: true,
            crash_cpu: true,
        }
    }
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RunnerPayload {
    pub blend_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scene: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub camera: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view_layers: Option<Vec<String>>,
    #[serde(default)]
    pub overrides: OverrideMap,
    pub frames: Vec<i32>,
    pub output_pattern: String,
    pub output_dir: String,
    pub control_file: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_preferences: Option<DevicePreferences>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub threads: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crash_policy: Option<CrashPolicy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crash_config: Option<CrashConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub render_missing_only: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pre_render_hook: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path_remaps: Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub make_paths_absolute: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ControlCommand {
    pub command: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<u64>,
}
