use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const RN_EVENT_PREFIX: &str = "RN_EVENT";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub device_type: String,
    pub use_: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct OverrideAppliedEntry {
    pub rna_path: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct OverrideSkippedEntry {
    pub rna_path: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RunnerEvent {
    #[serde(rename_all = "camelCase")]
    JobStart {
        total_frames: usize,
        frames: Vec<i32>,
        scene: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        camera: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        engine: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    DeviceReport {
        compute_device_type: String,
        engine: String,
        mode: String,
        devices: Vec<DeviceInfo>,
        requested_gpu: bool,
        fallback_to_cpu: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        threads: Option<u32>,
    },
    #[serde(rename_all = "camelCase")]
    OverridesReport {
        applied: Vec<OverrideAppliedEntry>,
        skipped: Vec<OverrideSkippedEntry>,
    },
    #[serde(rename_all = "camelCase")]
    PreRenderHookStart {},
    #[serde(rename_all = "camelCase")]
    PreRenderHookSuccess { hook: String },
    #[serde(rename_all = "camelCase")]
    PreRenderHookError {
        hook: String,
        error: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        traceback: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    FrameStart {
        frame: i32,
        scene: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        frame_index: Option<usize>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        total_frames: Option<usize>,
    },
    #[serde(rename_all = "camelCase")]
    FrameDone {
        frame: i32,
        scene: String,
        saved: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        time_seconds: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        peak_memory: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    FrameError { frame: i32, message: String },
    #[serde(rename_all = "camelCase")]
    JobDone {
        completed_frames: usize,
        failed_frames: usize,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        duration_seconds: Option<f64>,
    },
    #[serde(rename_all = "camelCase")]
    FrameEnd {
        frame: i32,
        scene: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        saved: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        time: Option<f64>,
    },
    #[serde(rename_all = "camelCase")]
    OverrideApplied {
        rna_path: String,
        value: serde_json::Value,
    },
    #[serde(rename_all = "camelCase")]
    OverrideSkipped { rna_path: String, reason: String },
    #[serde(rename_all = "camelCase")]
    Error {
        message: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        frame: Option<i32>,
        #[serde(default)]
        fatal: bool,
    },
}
