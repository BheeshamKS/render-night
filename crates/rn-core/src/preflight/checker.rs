// Render Night - Preflight Validator
// SPDX-License-Identifier: GPL-3.0-or-later

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use crate::blender::version_compare::compare_versions;
use crate::ranges::{
    is_format_video, resolve_frame_range, validate_range_for_format, FrameRangeConfig,
};
use crate::schemas::inspect::{InspectOutput, InspectScene};
use crate::schemas::override_schema::OverrideMap;
use crate::schemas::preflight::{
    PreflightIssue, PreflightJobReport, PreflightQuickFix, PreflightReport, PreflightSeverity,
    QuickFixAction,
};

#[derive(Debug, Clone)]
pub struct SelectedBlender {
    pub version: String,
    pub executable: String,
}

#[derive(Debug, Clone, Default)]
pub struct PreflightJobInput {
    pub id: String,
    pub file_name: String,
    pub file_path: String,
    pub selected_scene: Option<String>,
    pub selected_camera: Option<String>,
    pub scenes: Vec<InspectScene>,
    pub available_cameras: Vec<String>,
    pub output_path_pattern: Option<String>,
    pub output_preview: Option<String>,
    pub range_config: Option<FrameRangeConfig>,
    pub overrides: OverrideMap,
    pub saved_with_version: Option<String>,
    pub inspect_data: Option<InspectOutput>,
    pub inspect_error: Option<String>,
    pub requested_gpu: bool,
    pub ignored_warning_codes: Vec<String>,
    pub ignored_warning_ids: Vec<String>,
    pub ignore_all_warnings: bool,
}

#[derive(Debug, Clone, Default)]
pub struct PreflightOptions {
    pub selected_blender: Option<SelectedBlender>,
    pub min_free_disk_space_mb: Option<u64>,
    pub check_disk_access: bool,
    pub check_disk_space: bool,
}

pub struct PreflightChecker;

impl PreflightChecker {
    /// Validates a single job according to docs/behavior/preflight.md.
    pub fn check_job(job: &PreflightJobInput, options: &PreflightOptions) -> PreflightJobReport {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        let current_scene = job
            .scenes
            .iter()
            .find(|s| job.selected_scene.as_deref() == Some(&s.name))
            .or_else(|| job.scenes.first());

        // =========================================================================
        // BLOCKING CHECKS (Only 3 conditions can block a job: Principle 1)
        // =========================================================================

        // 1. Missing or inexecutable Blender binary
        if let Some(ref b) = options.selected_blender {
            if !is_executable_available(&b.executable) {
                errors.push(PreflightIssue {
                    id: format!("pf-{}-blender-missing", job.id),
                    job_id: job.id.clone(),
                    job_name: job.file_name.clone(),
                    code: "BLENDER_NOT_FOUND".to_string(),
                    severity: PreflightSeverity::Error,
                    is_blocking: true,
                    relevance: None,
                    message: format!(
                        "The selected Blender executable \"{}\" does not exist or was not found on disk.",
                        b.executable
                    ),
                    details: None,
                    quick_fix: None,
                });
            }
        }

        // 2. Missing or unreadable .blend file
        if !job.file_path.is_empty() {
            let p = Path::new(&job.file_path);
            if !p.exists() {
                errors.push(PreflightIssue {
                    id: format!("pf-{}-blend-not-found", job.id),
                    job_id: job.id.clone(),
                    job_name: job.file_name.clone(),
                    code: "BLEND_NOT_FOUND".to_string(),
                    severity: PreflightSeverity::Error,
                    is_blocking: true,
                    relevance: None,
                    message: format!(
                        "The .blend file \"{}\" does not exist on disk.",
                        job.file_path
                    ),
                    details: None,
                    quick_fix: None,
                });
            } else if options.check_disk_access {
                if let Err(e) = fs::File::open(p) {
                    errors.push(PreflightIssue {
                        id: format!("pf-{}-blend-not-readable", job.id),
                        job_id: job.id.clone(),
                        job_name: job.file_name.clone(),
                        code: "BLEND_NOT_READABLE".to_string(),
                        severity: PreflightSeverity::Error,
                        is_blocking: true,
                        relevance: None,
                        message: format!(
                            "The .blend file \"{}\" cannot be read (access denied).",
                            job.file_path
                        ),
                        details: Some(e.to_string()),
                        quick_fix: None,
                    });
                }
            }
        }

        // 3. Zero frames to render
        let default_start = current_scene.map(|s| s.frame_start).unwrap_or(1);
        let default_end = current_scene.map(|s| s.frame_end).unwrap_or(250);
        let default_step = current_scene.map(|s| s.frame_step).unwrap_or(1);

        let range_cfg = job.range_config.clone().unwrap_or_default();
        let resolved = resolve_frame_range(&range_cfg, default_start, default_end, default_step);

        if match &resolved {
            Ok(r) => r.frames.is_empty(),
            Err(_) => true,
        } {
            errors.push(PreflightIssue {
                id: format!("pf-{}-invalid-range", job.id),
                job_id: job.id.clone(),
                job_name: job.file_name.clone(),
                code: "ZERO_FRAMES_TO_RENDER".to_string(),
                severity: PreflightSeverity::Error,
                is_blocking: true,
                relevance: None,
                message: "The resolved frame range contains zero frames to render.".to_string(),
                details: None,
                quick_fix: None,
            });
        }

        // =========================================================================
        // WARNING CHECKS (Everything else is a warning, never a block)
        // =========================================================================

        // 1. Missing external files classified by relevance
        let mut unused_count = 0;
        if let Some(ref inspect) = job.inspect_data {
            let mut used_or_unknown = Vec::new();
            for m in &inspect.missing_files {
                let rel = m.relevance.as_deref().unwrap_or("unknown");
                if rel == "unused" {
                    unused_count += 1;
                } else {
                    used_or_unknown.push(m);
                }
            }

            if !used_or_unknown.is_empty() {
                let sample_path = &used_or_unknown[0].path;
                let details_str = used_or_unknown
                    .iter()
                    .map(|m| {
                        format!(
                            "[{}] {} ({})",
                            m.file_type,
                            m.path,
                            m.datablock.as_deref().unwrap_or("")
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n");

                warnings.push(PreflightIssue {
                    id: format!("pf-{}-missing-assets", job.id),
                    job_id: job.id.clone(),
                    job_name: job.file_name.clone(),
                    code: "MISSING_ASSETS".to_string(),
                    severity: PreflightSeverity::Warning,
                    is_blocking: false,
                    relevance: Some("used".to_string()),
                    message: format!(
                        "Found {} missing external asset(s) in use (e.g. {}).",
                        used_or_unknown.len(),
                        sample_path
                    ),
                    details: Some(details_str),
                    quick_fix: None,
                });
            }
        }

        // 2. Output path writeability check
        let preview = job
            .output_preview
            .as_deref()
            .or(job.output_path_pattern.as_deref())
            .unwrap_or("");

        if !preview.is_empty() && options.check_disk_access {
            let out_dir = if let Some(stripped) = preview.strip_prefix("//") {
                let parent_blend = Path::new(&job.file_path)
                    .parent()
                    .unwrap_or_else(|| Path::new("."));
                parent_blend.join(stripped)
            } else {
                Path::new(preview).to_path_buf()
            };

            let target_dir = if out_dir.is_file() || out_dir.extension().is_some() {
                out_dir.parent().unwrap_or_else(|| Path::new("."))
            } else {
                &out_dir
            };

            if let Err(e) = fs::create_dir_all(target_dir) {
                warnings.push(PreflightIssue {
                    id: format!("pf-{}-dir-unwritable", job.id),
                    job_id: job.id.clone(),
                    job_name: job.file_name.clone(),
                    code: "OUTPUT_DIR_NOT_WRITABLE".to_string(),
                    severity: PreflightSeverity::Warning,
                    is_blocking: false,
                    relevance: None,
                    message: format!(
                        "Output directory \"{}\" is not writable or access is denied.",
                        target_dir.display()
                    ),
                    details: Some(e.to_string()),
                    quick_fix: Some(PreflightQuickFix {
                        label: "Create Output Directory".to_string(),
                        action: QuickFixAction::CreateOutputDir,
                        data: None,
                    }),
                });
            }
        }

        // 3. Inspection failure check (Enters Basic Mode, warning)
        if let Some(ref err) = job.inspect_error {
            warnings.push(PreflightIssue {
                id: format!("pf-{}-inspection-failed", job.id),
                job_id: job.id.clone(),
                job_name: job.file_name.clone(),
                code: "INSPECTION_FAILED".to_string(),
                severity: PreflightSeverity::Warning,
                is_blocking: false,
                relevance: None,
                message: format!(
                    "File inspection failed for \"{}\": {}. Job will render in Basic Mode with internal settings.",
                    job.file_name, err
                ),
                details: None,
                quick_fix: None,
            });
        }

        // 4. Newer Blender version check
        let saved_ver = job.saved_with_version.as_deref().or_else(|| {
            job.inspect_data
                .as_ref()
                .map(|d| d.blender_version.as_str())
        });

        if let (Some(s_ver), Some(ref b)) = (saved_ver, &options.selected_blender) {
            if compare_versions(s_ver, &b.version) == std::cmp::Ordering::Greater {
                warnings.push(PreflightIssue {
                    id: format!("pf-{}-newer-version", job.id),
                    job_id: job.id.clone(),
                    job_name: job.file_name.clone(),
                    code: "NEWER_BLENDER_VERSION".to_string(),
                    severity: PreflightSeverity::Warning,
                    is_blocking: false,
                    relevance: None,
                    message: format!(
                        "File was saved with a newer version of Blender (v{}) than the selected executable (v{}). Forward compatibility is not supported and may fail.",
                        s_ver, b.version
                    ),
                    details: None,
                    quick_fix: None,
                });
            }
        }

        // 5. Camera check
        if job.inspect_error.is_none()
            && (job.selected_camera.is_none()
                || (!job.available_cameras.is_empty()
                    && job.selected_camera.as_deref() == Some("")))
        {
            let first_cam = job.available_cameras.first().cloned();
            warnings.push(PreflightIssue {
                id: format!("pf-{}-no-camera", job.id),
                job_id: job.id.clone(),
                job_name: job.file_name.clone(),
                code: "NO_ACTIVE_CAMERA".to_string(),
                severity: PreflightSeverity::Warning,
                is_blocking: false,
                relevance: None,
                message: format!(
                    "No active camera selected for rendering in scene \"{}\".",
                    job.selected_scene.as_deref().unwrap_or("Scene")
                ),
                details: None,
                quick_fix: first_cam.map(|c| PreflightQuickFix {
                    label: format!("Select Camera ({})", c),
                    action: QuickFixAction::SelectCamera,
                    data: Some(serde_json::json!({ "camera": c })),
                }),
            });
        }

        // 6. Video format continuous range check
        let format_override = job
            .overrides
            .get("scene.render.image_settings.file_format")
            .and_then(|v| v.as_str());

        let format_str = format_override.or_else(|| {
            current_scene
                .and_then(|s| s.image_settings.get("file_format"))
                .and_then(|meta| meta.value.as_str())
        });

        let is_video = format_str.map(is_format_video).unwrap_or(false);
        if let Ok(ref res) = resolved {
            let validation = validate_range_for_format(res, range_cfg.mode, format_str);
            if !validation.valid {
                warnings.push(PreflightIssue {
                    id: format!("pf-{}-video-range-rule", job.id),
                    job_id: job.id.clone(),
                    job_name: job.file_name.clone(),
                    code: "VIDEO_RANGE_RULE_VIOLATION".to_string(),
                    severity: PreflightSeverity::Warning,
                    is_blocking: false,
                    relevance: None,
                    message: validation.reason.unwrap_or_else(|| {
                        "Video containers require continuous frame ranges.".to_string()
                    }),
                    details: None,
                    quick_fix: Some(PreflightQuickFix {
                        label: "Switch to Continuous Range".to_string(),
                        action: QuickFixAction::SwitchRangeToContinuous,
                        data: None,
                    }),
                });
            }
        }

        // 7. GPU device check
        if job.requested_gpu && !is_video {
            if let Some(ref inspect) = job.inspect_data {
                if !inspect.cycles_devices.is_empty() {
                    let has_gpu = inspect.cycles_devices.iter().any(|d| {
                        let t = d.device_type.to_uppercase();
                        t != "CPU" && d.name != "CPU"
                    });

                    if !has_gpu {
                        warnings.push(PreflightIssue {
                            id: format!("pf-{}-no-compatible-gpu", job.id),
                            job_id: job.id.clone(),
                            job_name: job.file_name.clone(),
                            code: "NO_COMPATIBLE_GPU".to_string(),
                            severity: PreflightSeverity::Warning,
                            is_blocking: false,
                            relevance: None,
                            message: "GPU rendering was requested, but no compatible Cycles GPU devices were detected. Render will fall back to CPU.".to_string(),
                            details: None,
                            quick_fix: Some(PreflightQuickFix {
                                label: "Switch to CPU".to_string(),
                                action: QuickFixAction::SwitchToCpu,
                                data: None,
                            }),
                        });
                    }
                }
            }
        }

        // =========================================================================
        // WARNING SUPPRESSION
        // =========================================================================
        let mut active_warnings = warnings;
        if job.ignore_all_warnings {
            active_warnings.clear();
        } else {
            if !job.ignored_warning_codes.is_empty() {
                let code_set: HashSet<&str> = job
                    .ignored_warning_codes
                    .iter()
                    .map(|s| s.as_str())
                    .collect();
                active_warnings.retain(|w| !code_set.contains(w.code.as_str()));
            }
            if !job.ignored_warning_ids.is_empty() {
                let id_set: HashSet<&str> =
                    job.ignored_warning_ids.iter().map(|s| s.as_str()).collect();
                active_warnings.retain(|w| !id_set.contains(w.id.as_str()));
            }
        }

        let is_blocked = errors.iter().any(|e| e.is_blocking);
        let block_reasons = errors
            .iter()
            .filter(|e| e.is_blocking)
            .map(|e| e.message.clone())
            .collect();

        PreflightJobReport {
            job_id: job.id.clone(),
            job_name: job.file_name.clone(),
            is_blocked,
            block_reasons,
            errors,
            warnings: active_warnings,
            unused_missing_count: unused_count,
        }
    }

    /// Aggregates preflight check across all jobs.
    pub fn check_all_jobs(
        jobs: &[PreflightJobInput],
        options: &PreflightOptions,
    ) -> PreflightReport {
        let mut all_errors = Vec::new();
        let mut all_warnings = Vec::new();
        let mut job_reports = Vec::new();

        for job in jobs {
            let report = Self::check_job(job, options);
            all_errors.extend(report.errors.clone());
            all_warnings.extend(report.warnings.clone());
            job_reports.push(report);
        }

        let is_blocked = job_reports.iter().any(|j| j.is_blocked);
        let block_reasons: Vec<String> = all_errors
            .iter()
            .filter(|e| e.is_blocking)
            .map(|e| e.message.clone())
            .collect();

        PreflightReport {
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            has_errors: !all_errors.is_empty(),
            has_warnings: !all_warnings.is_empty(),
            is_blocked,
            block_reasons,
            errors: all_errors,
            warnings: all_warnings,
            job_reports,
        }
    }
}

fn is_executable_available(exe: &str) -> bool {
    let cmd = exe.split_whitespace().next().unwrap_or("");
    if cmd.is_empty() {
        return false;
    }

    // Direct path
    if cmd.contains('/') || cmd.contains('\\') {
        let p = Path::new(cmd);
        return p.is_file();
    }

    // In PATH
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let full = dir.join(cmd);
            if full.is_file() {
                return true;
            }
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_preflight_only_three_blocking_conditions() {
        let job = PreflightJobInput {
            id: "j1".to_string(),
            file_name: "test.blend".to_string(),
            file_path: "/nonexistent/test.blend".to_string(),
            ..Default::default()
        };

        let report = PreflightChecker::check_job(&job, &PreflightOptions::default());
        assert!(report.is_blocked);
        assert_eq!(report.errors[0].code, "BLEND_NOT_FOUND");
    }

    #[test]
    fn test_preflight_missing_assets_relevance_classification() {
        let inspect_val = serde_json::json!({
            "schemaVersion": 1,
            "blenderVersion": "4.2.0",
            "savedWithVersion": "4.2.0",
            "blendPath": "assets.blend",
            "activeScene": "Scene",
            "scenes": [],
            "missingFiles": [
                {
                    "path": "/textures/wood_used.png",
                    "type": "image",
                    "datablock": "Material",
                    "relevance": "used"
                },
                {
                    "path": "/textures/unused_old.png",
                    "type": "image",
                    "relevance": "unused"
                }
            ]
        });
        let inspect_data: InspectOutput = serde_json::from_value(inspect_val).unwrap();

        let job = PreflightJobInput {
            id: "j2".to_string(),
            file_name: "assets.blend".to_string(),
            file_path: "Cargo.toml".to_string(), // exists
            selected_camera: Some("Camera".to_string()),
            inspect_data: Some(inspect_data),
            ..Default::default()
        };

        let report = PreflightChecker::check_job(&job, &PreflightOptions::default());
        assert!(!report.is_blocked);
        // Only 1 warning for used asset!
        assert_eq!(report.warnings.len(), 1);
        assert_eq!(report.warnings[0].code, "MISSING_ASSETS");
        assert_eq!(report.unused_missing_count, 1);
    }
}
