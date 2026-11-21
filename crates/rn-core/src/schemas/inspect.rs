use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RnaEnumItem {
    pub identifier: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct RnaPropertyMeta {
    pub value: serde_json::Value,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub property_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(rename = "enumItems", default, skip_serializing_if = "Option::is_none")]
    pub enum_items: Option<Vec<RnaEnumItem>>,
}

pub type RnaStruct = HashMap<String, RnaPropertyMeta>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InspectScene {
    pub name: String,
    #[serde(default)]
    pub active_camera: Option<String>,
    #[serde(default)]
    pub cameras: Vec<String>,
    #[serde(default)]
    pub view_layers: Vec<String>,
    pub frame_start: i32,
    pub frame_end: i32,
    #[serde(default = "default_frame_step")]
    pub frame_step: i32,
    #[serde(default = "default_fps")]
    pub fps: f64,
    #[serde(default = "default_fps_base")]
    pub fps_base: f64,
    pub resolution_x: u32,
    pub resolution_y: u32,
    #[serde(default = "default_resolution_percentage")]
    pub resolution_percentage: f64,
    #[serde(default)]
    pub render: RnaStruct,
    #[serde(default)]
    pub image_settings: RnaStruct,
    #[serde(default)]
    pub ffmpeg: RnaStruct,
    #[serde(default)]
    pub cycles: RnaStruct,
    #[serde(default)]
    pub eevee: RnaStruct,
    #[serde(default)]
    pub view_settings: RnaStruct,
    #[serde(default)]
    pub display_settings: RnaStruct,
}

fn default_frame_step() -> i32 {
    1
}
fn default_fps() -> f64 {
    24.0
}
fn default_fps_base() -> f64 {
    1.0
}
fn default_resolution_percentage() -> f64 {
    100.0
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MissingFile {
    pub path: String,
    #[serde(rename = "type")]
    pub file_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub datablock: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relevance: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CyclesDevice {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    #[serde(rename = "type")]
    pub device_type: String,
    #[serde(default = "default_true")]
    pub use_: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InspectOutput {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub blender_version: String,
    pub saved_with_version: String,
    pub blend_path: String,
    pub active_scene: String,
    pub scenes: Vec<InspectScene>,
    #[serde(default)]
    pub missing_files: Vec<MissingFile>,
    #[serde(default)]
    pub cycles_devices: Vec<CyclesDevice>,
    #[serde(default)]
    pub engine_items: Vec<RnaEnumItem>,
    #[serde(default)]
    pub format_items: Vec<RnaEnumItem>,
    #[serde(default)]
    pub codec_items: Vec<RnaEnumItem>,
    #[serde(default)]
    pub view_transform_items: Vec<RnaEnumItem>,
    #[serde(default)]
    pub look_items: Vec<RnaEnumItem>,
    #[serde(default)]
    pub device_items: Vec<RnaEnumItem>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub errors: Option<Vec<String>>,
}

fn default_schema_version() -> u32 {
    1
}
