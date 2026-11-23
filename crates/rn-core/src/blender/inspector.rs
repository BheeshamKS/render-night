// Render Night - Blender Inspector Runner
// SPDX-License-Identifier: GPL-3.0-or-later

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tempfile::NamedTempFile;
use tokio::process::Command;
use tokio::time::timeout;

use super::header_reader::read_blend_header;
use crate::schemas::inspect::InspectOutput;

#[derive(Debug, Clone, Default)]
pub struct InspectOptions {
    pub isolated_mode: bool,
    pub auto_exec: bool,
    pub timeout_ms: Option<u64>,
    pub script_path: Option<PathBuf>,
}

pub fn resolve_inspect_script_path(resources_path: Option<&Path>) -> PathBuf {
    if let Some(res) = resources_path {
        let p = res.join("python").join("inspect_blend.py");
        if p.exists() {
            return p;
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidates = [
                parent.join("resources/python/inspect_blend.py"),
                parent.join("../share/render-night/python/inspect_blend.py"),
                parent.join("../resources/python/inspect_blend.py"),
            ];
            for c in &candidates {
                if c.exists() {
                    return c.clone();
                }
            }
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        let p = PathBuf::from(home).join(".local/share/render-night/python/inspect_blend.py");
        if p.exists() {
            return p;
        }
    }

    let sys_candidates = [
        PathBuf::from("/usr/share/render-night/python/inspect_blend.py"),
        PathBuf::from("/usr/local/share/render-night/python/inspect_blend.py"),
    ];
    for c in &sys_candidates {
        if c.exists() {
            return c.clone();
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        manifest_dir.join("../../resources/python/inspect_blend.py"),
        manifest_dir.join("../resources/python/inspect_blend.py"),
        PathBuf::from("resources/python/inspect_blend.py"),
    ];

    for c in &candidates {
        if c.exists() {
            return c.clone();
        }
    }

    PathBuf::from("resources/python/inspect_blend.py")
}

pub async fn inspect_blend(
    blend_path: &Path,
    blender_executable: &[String],
    options: &InspectOptions,
) -> Result<InspectOutput, String> {
    if !blend_path.exists() {
        return Err(format!("Blend file not found: {}", blend_path.display()));
    }

    if blender_executable.is_empty() {
        return Err("No Blender executable provided for inspect".to_string());
    }

    let header_version = read_blend_header(blend_path)
        .map(|h| h.version)
        .unwrap_or_else(|_| "4.2.0".to_string());

    let script = options
        .script_path
        .clone()
        .unwrap_or_else(|| resolve_inspect_script_path(None));

    let abs_blend_path = blend_path
        .canonicalize()
        .unwrap_or_else(|_| blend_path.to_path_buf());
    let abs_script = script.canonicalize().unwrap_or_else(|_| script.clone());

    let tmp_parent = directories::ProjectDirs::from("com", "rendernight", "RenderNight")
        .map(|dirs| dirs.cache_dir().to_path_buf())
        .or_else(|| directories::BaseDirs::new().map(|d| d.cache_dir().join("render-night")))
        .unwrap_or_else(std::env::temp_dir)
        .join("tmp");
    let _ = std::fs::create_dir_all(&tmp_parent);

    let temp_file = tempfile::Builder::new()
        .prefix("rn_inspect_")
        .suffix(".json")
        .tempfile_in(&tmp_parent)
        .or_else(|_| NamedTempFile::new())
        .map_err(|e| format!("Failed to create temp file: {e}"))?;
    let temp_output_path = temp_file.path().to_path_buf();

    let exe_cmd = &blender_executable[0];
    let mut cmd = Command::new(exe_cmd);

    for arg in &blender_executable[1..] {
        cmd.arg(arg);
    }

    cmd.arg("-b").arg(&abs_blend_path);

    if options.isolated_mode {
        cmd.arg("--factory-startup");
    }

    if options.auto_exec {
        cmd.arg("--enable-autoexec");
    } else {
        cmd.arg("--disable-autoexec");
    }

    cmd.arg("-P")
        .arg(&abs_script)
        .arg("--")
        .arg(&temp_output_path);

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let timeout_duration = Duration::from_millis(options.timeout_ms.unwrap_or(60_000));

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Blender {exe_cmd}: {e}"))?;

    let output = match timeout(timeout_duration, child.wait_with_output()).await {
        Ok(res) => res.map_err(|e| format!("Blender inspect execution failed: {e}"))?,
        Err(_) => {
            return Err(format!(
                "Blender inspect timed out after {}s",
                timeout_duration.as_secs()
            ));
        }
    };

    if temp_output_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&temp_output_path) {
            if !content.trim().is_empty() {
                if let Ok(mut parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                    if parsed.get("savedWithVersion").is_none() {
                        if let Some(obj) = parsed.as_object_mut() {
                            obj.insert(
                                "savedWithVersion".to_string(),
                                serde_json::Value::String(header_version),
                            );
                        }
                    }
                    if let Ok(validated) = serde_json::from_value::<InspectOutput>(parsed) {
                        return Ok(validated);
                    }
                }
            }
        }
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let tail = if !stderr.trim().is_empty() {
        stderr
            .lines()
            .rev()
            .take(15)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        stdout
            .lines()
            .rev()
            .take(15)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n")
    };

    Err(format!(
        "Failed to inspect {}: process exited with status {}\n--- Output ---\n{}",
        blend_path.display(),
        output.status,
        tail
    ))
}
