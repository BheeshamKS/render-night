// Render Night - CLI Schemas
// SPDX-License-Identifier: GPL-3.0-or-later

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::override_schema::CrashPolicy;
use super::queue_state::PostAction;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(untagged)]
pub enum CliRange {
    String(String),
    Simple {
        start: i32,
        end: i32,
        #[serde(default = "default_step")]
        step: i32,
    },
}

fn default_step() -> i32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CliJobItem {
    pub id: Option<String>,
    #[serde(alias = "blend_path")]
    pub blend_path: String,
    pub scene: Option<String>,
    pub camera: Option<String>,
    pub range: Option<CliRange>,
    #[serde(default)]
    pub overrides: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub presets: Vec<String>,
    #[serde(alias = "output_pattern")]
    pub output_pattern: Option<String>,
    pub priority: Option<i32>,
    pub threads: Option<u32>,
    #[serde(default, alias = "render_missing_only")]
    pub render_missing_only: bool,
    #[serde(alias = "pre_render_hook")]
    pub pre_render_hook: Option<String>,
    #[serde(alias = "crash_policy")]
    pub crash_policy: Option<CrashPolicy>,
    #[serde(default, alias = "stitch_to_mp4")]
    pub stitch_to_mp4: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CliQueueFile {
    pub blender: Option<String>,
    #[serde(alias = "post_action")]
    pub post_action: Option<PostAction>,
    pub jobs: Vec<CliJobItem>,
}
