use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::override_schema::OverrideMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub overrides: OverrideMap,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_pattern: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}
