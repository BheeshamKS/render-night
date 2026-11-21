// Render Night - GPU Telemetry Monitor
// SPDX-License-Identifier: GPL-3.0-or-later

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
pub struct GpuStatus {
    pub verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub utilization_percent: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_used_mb: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_total_mb: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
}

/// Best-effort GPU query via nvidia-smi or rocm-smi.
/// Returns verified: true if available, or verified: false if absent.
pub async fn sample_gpu_utilization() -> GpuStatus {
    // 1. Try nvidia-smi
    let nvidia_task = async {
        let output = Command::new("nvidia-smi")
            .args([
                "--query-gpu=name,utilization.gpu,memory.used,memory.total",
                "--format=csv,noheader,nounits",
            ])
            .output()
            .await?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = stdout.lines().next() {
                let parts: Vec<&str> = first_line.split(',').map(|s| s.trim()).collect();
                if parts.len() >= 4 {
                    let name = parts[0].to_string();
                    let utilization_percent = parts[1].parse::<u32>().ok();
                    let memory_used_mb = parts[2].parse::<u64>().ok();
                    let memory_total_mb = parts[3].parse::<u64>().ok();

                    return Ok(GpuStatus {
                        verified: true,
                        name: Some(name),
                        utilization_percent,
                        memory_used_mb,
                        memory_total_mb,
                        tool: Some("nvidia-smi".to_string()),
                    });
                }
            }
        }
        Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "nvidia-smi failed",
        ))
    };

    if let Ok(Ok(status)) = timeout(Duration::from_millis(1500), nvidia_task).await {
        return status;
    }

    // 2. Try rocm-smi
    let rocm_task = async {
        let output = Command::new("rocm-smi")
            .args(["--showuse", "--showmeminfo", "vram", "--json"])
            .output()
            .await?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&stdout) {
                if let Some(obj) = val.as_object() {
                    for (k, v) in obj {
                        if k.starts_with("card") {
                            let series = v.get("Card Series").and_then(|s| s.as_str());
                            let use_val = v
                                .get("GPU use (%)")
                                .or_else(|| v.get("GPU use"))
                                .and_then(|u| {
                                    u.as_u64()
                                        .or_else(|| u.as_str().and_then(|s| s.parse::<u64>().ok()))
                                });

                            return Ok(GpuStatus {
                                verified: true,
                                name: Some(series.unwrap_or("AMD Radeon GPU").to_string()),
                                utilization_percent: use_val.map(|u| u as u32),
                                memory_used_mb: None,
                                memory_total_mb: None,
                                tool: Some("rocm-smi".to_string()),
                            });
                        }
                    }
                }
            }
        }
        Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "rocm-smi failed",
        ))
    };

    if let Ok(Ok(status)) = timeout(Duration::from_millis(1500), rocm_task).await {
        return status;
    }

    GpuStatus {
        verified: false,
        ..Default::default()
    }
}
