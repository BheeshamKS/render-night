// Render Night - System Diagnostics & Doctor Engine
// SPDX-License-Identifier: GPL-3.0-or-later

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BlenderDiagnostic {
    pub display_name: String,
    pub executable: String,
    pub version: String,
    pub is_default: bool,
    pub source: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScriptsDiagnostic {
    pub scripts_dir: PathBuf,
    pub inspect_extracted: bool,
    pub inspect_matches_embedded: bool,
    pub runner_extracted: bool,
    pub runner_matches_embedded: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FilePickerDiagnostic {
    pub native_portal_available: bool,
    pub zenity_available: bool,
    pub kdialog_available: bool,
    pub in_app_browser_available: bool,
    pub active_tier: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioDiagnostic {
    pub device_available: bool,
    pub device_status: String,
    pub todung_synth_ready: bool,
    pub samples_count: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GpuDiagnostic {
    pub gpu_detected: bool,
    pub name: Option<String>,
    pub vram_total_mb: Option<u64>,
    pub vram_used_mb: Option<u64>,
    pub tool: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StorageDiagnostic {
    pub path: PathBuf,
    pub free_mb: Option<u64>,
    pub total_mb: Option<u64>,
    pub is_writable: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DiagnosticReport {
    pub timestamp: String,
    pub version: String,
    pub blenders: Vec<BlenderDiagnostic>,
    pub scripts: ScriptsDiagnostic,
    pub file_picker: FilePickerDiagnostic,
    pub audio: AudioDiagnostic,
    pub gpu: GpuDiagnostic,
    pub storage: StorageDiagnostic,
}

impl DiagnosticReport {
    pub fn to_markdown(&self) -> String {
        let mut md = String::new();
        md.push_str(&format!(
            "# Render Night Diagnostic Report (v{})\n\n",
            self.version
        ));
        md.push_str(&format!("*Generated: {}*\n\n", self.timestamp));

        // 1. Blender Section
        md.push_str("## 1. Blender Installations\n");
        if self.blenders.is_empty() {
            md.push_str("- [!] No Blender installations auto-discovered. Set `RN_BLENDER_BIN` or specify executable in settings.\n\n");
        } else {
            for b in &self.blenders {
                let badge = if b.is_default { " (Default)" } else { "" };
                md.push_str(&format!(
                    "- **{}**{}: `{}` [Version: {}, Source: {}]\n",
                    b.display_name, badge, b.executable, b.version, b.source
                ));
            }
            md.push('\n');
        }

        // 2. Python Scripts Section
        md.push_str("## 2. Bundled Python Scripts\n");
        md.push_str(&format!(
            "- Extracted Scripts Directory: `{}`\n",
            self.scripts.scripts_dir.display()
        ));
        md.push_str(&format!(
            "- `inspect_blend.py`: Extracted = {}, Hash Match = {}\n",
            if self.scripts.inspect_extracted {
                "✓ Yes"
            } else {
                "✗ No"
            },
            if self.scripts.inspect_matches_embedded {
                "✓ Yes"
            } else {
                "✗ No"
            }
        ));
        md.push_str(&format!(
            "- `render_runner.py`: Extracted = {}, Hash Match = {}\n\n",
            if self.scripts.runner_extracted {
                "✓ Yes"
            } else {
                "✗ No"
            },
            if self.scripts.runner_matches_embedded {
                "✓ Yes"
            } else {
                "✗ No"
            }
        ));

        // 3. File Picker Section
        md.push_str("## 3. File Picker Subsystem\n");
        md.push_str(&format!(
            "- Active Primary Tier: **{}**\n",
            self.file_picker.active_tier
        ));
        md.push_str(&format!(
            "- Native Portal (rfd / xdg-desktop-portal): {}\n",
            if self.file_picker.native_portal_available {
                "✓ Available"
            } else {
                "✗ Unavailable"
            }
        ));
        md.push_str(&format!(
            "- Zenity CLI Picker: {}\n",
            if self.file_picker.zenity_available {
                "✓ Available"
            } else {
                "✗ Not found"
            }
        ));
        md.push_str(&format!(
            "- Kdialog CLI Picker: {}\n",
            if self.file_picker.kdialog_available {
                "✓ Available"
            } else {
                "✗ Not found"
            }
        ));
        md.push_str("- Built-in In-App BUI Browser: ✓ Ready (Built-in)\n\n");

        // 4. Audio Subsystem
        md.push_str("## 4. Audio Subsystem\n");
        md.push_str(&format!(
            "- Audio Device Output: {}\n",
            self.audio.device_status
        ));
        md.push_str(&format!(
            "- Todung Chime Synthesizer: {} ({} PCM samples ready)\n\n",
            if self.audio.todung_synth_ready {
                "✓ Ready"
            } else {
                "✗ Error"
            },
            self.audio.samples_count
        ));

        // 5. GPU & Hardware Telemetry
        md.push_str("## 5. GPU & Compute Device\n");
        if self.gpu.gpu_detected {
            let name = self.gpu.name.as_deref().unwrap_or("Generic GPU");
            let vram_total = self
                .gpu
                .vram_total_mb
                .map(|m| format!("{} MB", m))
                .unwrap_or_else(|| "Unknown".to_string());
            let vram_used = self
                .gpu
                .vram_used_mb
                .map(|m| format!("{} MB", m))
                .unwrap_or_else(|| "Unknown".to_string());
            let tool = self.gpu.tool.as_deref().unwrap_or("smi");
            md.push_str(&format!("- GPU: **{}** via {}\n", name, tool));
            md.push_str(&format!(
                "- VRAM: Used: {} / Total: {}\n\n",
                vram_used, vram_total
            ));
        } else {
            md.push_str("- GPU: None detected or queries unavailable (CPU compute active)\n\n");
        }

        // 6. Storage & Permissions
        md.push_str("## 6. Output Storage & Filesystem\n");
        md.push_str(&format!("- Path: `{}`\n", self.storage.path.display()));
        if let (Some(free), Some(total)) = (self.storage.free_mb, self.storage.total_mb) {
            md.push_str(&format!(
                "- Space: {:.1} GB free / {:.1} GB total\n",
                free as f64 / 1024.0,
                total as f64 / 1024.0
            ));
        } else {
            md.push_str("- Space: Available\n");
        }
        md.push_str(&format!(
            "- Write Permissions: {}\n",
            if self.storage.is_writable {
                "✓ Writable"
            } else {
                "✗ Permission Denied"
            }
        ));

        md
    }
}

/// Runs full diagnostic self-checks
pub fn run_diagnostics(target_out_dir: Option<&Path>) -> DiagnosticReport {
    // 1. Blender discovery
    let blenders_raw = crate::blender::discover_all_blenders(&[]);
    let blenders = blenders_raw
        .into_iter()
        .enumerate()
        .map(|(idx, b)| BlenderDiagnostic {
            display_name: format!("Blender {}", b.version),
            executable: b.executable.join(" "),
            version: b.version,
            is_default: idx == 0,
            source: format!("{:?}", b.source),
        })
        .collect();

    // 2. Python scripts
    let scripts_dir = crate::blender::get_scripts_dir();
    let inspect_file = scripts_dir.join("inspect_blend.py");
    let runner_file = scripts_dir.join("render_runner.py");

    let inspect_extracted = inspect_file.exists();
    let inspect_matches_embedded = if let Ok(bytes) = std::fs::read(&inspect_file) {
        bytes == crate::blender::INSPECT_BLEND_PY
    } else {
        false
    };

    let runner_extracted = runner_file.exists();
    let runner_matches_embedded = if let Ok(bytes) = std::fs::read(&runner_file) {
        bytes == crate::blender::RENDER_RUNNER_PY
    } else {
        false
    };

    let scripts = ScriptsDiagnostic {
        scripts_dir,
        inspect_extracted,
        inspect_matches_embedded,
        runner_extracted,
        runner_matches_embedded,
    };

    // 3. File Pickers
    let zenity_available = which_check("zenity");
    let kdialog_available = which_check("kdialog");
    let native_portal_available = std::env::var("DISPLAY").is_ok()
        || std::env::var("WAYLAND_DISPLAY").is_ok()
        || cfg!(windows)
        || cfg!(target_os = "macos");

    let active_tier = if native_portal_available {
        "Native File Dialog (rfd / xdg-desktop-portal)".to_string()
    } else if zenity_available {
        "Zenity CLI Picker".to_string()
    } else if kdialog_available {
        "Kdialog CLI Picker".to_string()
    } else {
        "Built-in In-App BUI Browser".to_string()
    };

    let file_picker = FilePickerDiagnostic {
        native_portal_available,
        zenity_available,
        kdialog_available,
        in_app_browser_available: true,
        active_tier,
    };

    // 4. Audio
    // Probe by enumerating output devices rather than constructing an
    // OutputStream. Opening and immediately dropping a WASAPI stream here made
    // the process crash with STATUS_ACCESS_VIOLATION at exit on Windows, and the
    // enumeration answers the same question without touching playback.
    let (device_available, device_status) = {
        use rodio::cpal::traits::{DeviceTrait, HostTrait};
        let host = rodio::cpal::default_host();
        match host.default_output_device() {
            Some(device) => {
                let name = device
                    .name()
                    .unwrap_or_else(|_| "unnamed device".to_string());
                (true, format!("✓ Available ({})", name))
            }
            None => (
                false,
                "Silent Fallback (No audio output device)".to_string(),
            ),
        }
    };
    let samples = crate::sound::synthesize_todung_samples();
    let todung_synth_ready = !samples.is_empty();
    let samples_count = samples.len();

    let audio = AudioDiagnostic {
        device_available,
        device_status,
        todung_synth_ready,
        samples_count,
    };

    // 5. GPU
    let gpu_status = if let Ok(_handle) = tokio::runtime::Handle::try_current() {
        std::thread::spawn(|| {
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map(|rt| rt.block_on(crate::render::gpu_monitor::sample_gpu_utilization()))
                .unwrap_or_default()
        })
        .join()
        .unwrap_or_default()
    } else {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map(|rt| rt.block_on(crate::render::gpu_monitor::sample_gpu_utilization()))
            .unwrap_or_default()
    };
    let gpu = GpuDiagnostic {
        gpu_detected: gpu_status.verified,
        name: gpu_status.name,
        vram_total_mb: gpu_status.memory_total_mb,
        vram_used_mb: gpu_status.memory_used_mb,
        tool: gpu_status.tool,
    };

    // 6. Storage
    let out_dir = target_out_dir
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let (free_mb, total_mb) = get_disk_space_mb(&out_dir).unwrap_or((None, None));
    let is_writable = check_dir_writable(&out_dir);

    let storage = StorageDiagnostic {
        path: out_dir,
        free_mb,
        total_mb,
        is_writable,
    };

    DiagnosticReport {
        timestamp: chrono::Utc::now().to_rfc3339(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        blenders,
        scripts,
        file_picker,
        audio,
        gpu,
        storage,
    }
}

fn which_check(cmd: &str) -> bool {
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            let full = dir.join(cmd);
            if full.is_file() {
                return true;
            }
        }
    }
    false
}

fn check_dir_writable(path: &Path) -> bool {
    let test_file = path.join(format!(".rn_probe_{}", std::process::id()));
    if std::fs::write(&test_file, b"probe").is_ok() {
        let _ = std::fs::remove_file(test_file);
        true
    } else {
        false
    }
}

#[cfg(unix)]
fn get_disk_space_mb(path: &Path) -> Option<(Option<u64>, Option<u64>)> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let probe_path = if path.exists() {
        path.to_path_buf()
    } else {
        path.parent()?.to_path_buf()
    };

    let c_path = CString::new(probe_path.as_os_str().as_bytes()).ok()?;
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c_path.as_ptr(), &mut stat) } == 0 {
        let block_size = if stat.f_frsize > 0 {
            stat.f_frsize
        } else {
            stat.f_bsize
        } as u64;
        let free_bytes = stat.f_bavail as u64 * block_size;
        let total_bytes = stat.f_blocks as u64 * block_size;
        Some((
            Some(free_bytes / (1024 * 1024)),
            Some(total_bytes / (1024 * 1024)),
        ))
    } else {
        None
    }
}

#[cfg(not(unix))]
fn get_disk_space_mb(_path: &Path) -> Option<(Option<u64>, Option<u64>)> {
    None
}
