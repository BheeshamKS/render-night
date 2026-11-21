use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum HistoryResult {
    Completed,
    CompletedWithWarnings,
    CompletedWithErrors,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub job_id: String,
    pub file_path: String,
    pub file_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
    pub scene: String,
    pub camera: String,
    pub frame_count: u32,
    pub total_time_seconds: f64,
    pub average_frame_time_seconds: f64,
    pub engine: String,
    pub device: String,
    pub result: HistoryResult,
    #[serde(default)]
    pub failed_frames: Vec<i32>,
    pub output_path: String,
    pub timestamp: u64,
}
