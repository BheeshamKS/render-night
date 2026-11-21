// Render Night - Preflight Schemas
// SPDX-License-Identifier: GPL-3.0-or-later

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "snake_case")]
pub enum PreflightMode {
    #[default]
    NeverBlock,
    Ask,
    Strict,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum PreflightSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QuickFixAction {
    SwitchRangeToContinuous,
    CreateOutputDir,
    SelectCamera,
    SwitchToCpu,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PreflightQuickFix {
    pub label: String,
    pub action: QuickFixAction,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PreflightIssue {
    pub id: String,
    pub job_id: String,
    pub job_name: String,
    pub code: String,
    pub severity: PreflightSeverity,
    #[serde(default)]
    pub is_blocking: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relevance: Option<String>,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quick_fix: Option<PreflightQuickFix>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PreflightJobReport {
    pub job_id: String,
    pub job_name: String,
    #[serde(default)]
    pub is_blocked: bool,
    #[serde(default)]
    pub block_reasons: Vec<String>,
    pub errors: Vec<PreflightIssue>,
    pub warnings: Vec<PreflightIssue>,
    #[serde(default)]
    pub unused_missing_count: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PreflightReport {
    pub timestamp: u64,
    pub has_errors: bool,
    pub has_warnings: bool,
    pub is_blocked: bool,
    pub block_reasons: Vec<String>,
    pub errors: Vec<PreflightIssue>,
    pub warnings: Vec<PreflightIssue>,
    pub job_reports: Vec<PreflightJobReport>,
}
