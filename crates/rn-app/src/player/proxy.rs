// Render Night - Automated Video Proxy Fallback (Intra-frame H.264 GOP 1)
// SPDX-License-Identifier: GPL-3.0-or-later

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProxyStatus {
    Inactive,
    Generating,
    Ready(PathBuf),
    Failed(String),
}

#[derive(Debug, Clone)]
pub struct ProxyManager {
    pub status: ProxyStatus,
    high_drop_start: Option<Instant>,
}

impl Default for ProxyManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ProxyManager {
    pub fn new() -> Self {
        Self {
            status: ProxyStatus::Inactive,
            high_drop_start: None,
        }
    }

    /// Evaluates whether proxy generation should trigger:
    /// - Heavy EXR/HDR/16-bit footage, OR
    /// - Frame drop rate exceeds 5% continuously for >2.0 seconds
    pub fn should_trigger_proxy(
        &mut self,
        now: Instant,
        drop_rate_pct: f64,
        is_heavy_exr_or_hdr: bool,
    ) -> bool {
        if matches!(self.status, ProxyStatus::Ready(_) | ProxyStatus::Generating) {
            return false;
        }

        if is_heavy_exr_or_hdr {
            return true;
        }

        if drop_rate_pct > 5.0 {
            let start = *self.high_drop_start.get_or_insert(now);
            if (now - start).as_secs_f64() >= 2.0 {
                return true;
            }
        } else {
            self.high_drop_start = None;
        }

        false
    }

    /// Deterministic proxy cache key based on sequence directory, range, and modification time
    pub fn compute_cache_key(
        sequence_dir: &Path,
        start_frame: i32,
        end_frame: i32,
        mtime_epoch_secs: u64,
    ) -> String {
        let mut hasher = DefaultHasher::new();
        sequence_dir.to_string_lossy().hash(&mut hasher);
        start_frame.hash(&mut hasher);
        end_frame.hash(&mut hasher);
        mtime_epoch_secs.hash(&mut hasher);
        format!("proxy_{:016x}.mp4", hasher.finish())
    }

    /// Build ffmpeg CLI arguments for intra-frame H.264 (GOP 1) with sRGB tone mapping
    pub fn build_ffmpeg_args(
        input_pattern: &str,
        start_frame: i32,
        fps: f64,
        output_file: &Path,
    ) -> Vec<String> {
        vec![
            "-y".to_string(),
            "-framerate".to_string(),
            format!("{:.2}", fps),
            "-start_number".to_string(),
            start_frame.to_string(),
            "-i".to_string(),
            input_pattern.to_string(),
            "-c:v".to_string(),
            "libx264".to_string(),
            "-g".to_string(),
            "1".to_string(), // Intra-frame only (GOP 1) for instant seek & scrub
            "-crf".to_string(),
            "17".to_string(), // Visually lossless quality
            "-pix_fmt".to_string(),
            "yuv420p".to_string(),
            "-vf".to_string(),
            "tonemap=tonemap=hable,format=yuv420p".to_string(), // sRGB tone-mapping for HDR/EXR
            output_file.to_string_lossy().to_string(),
        ]
    }

    /// Spawns background ffmpeg proxy generation if ffmpeg is available
    pub fn spawn_proxy_generation(
        &mut self,
        input_pattern: &str,
        start_frame: i32,
        fps: f64,
        output_file: &Path,
    ) -> Result<(), String> {
        self.status = ProxyStatus::Generating;

        let args = Self::build_ffmpeg_args(input_pattern, start_frame, fps, output_file);
        let out_path = output_file.to_path_buf();

        std::thread::Builder::new()
            .name("rn-proxy-encoder".to_string())
            .spawn(move || {
                let status = Command::new("ffmpeg").args(&args).status();
                match status {
                    Ok(s) if s.success() => {
                        tracing::info!("Proxy generation succeeded: {}", out_path.display());
                    }
                    Ok(s) => {
                        tracing::warn!("ffmpeg proxy returned non-zero exit: {:?}", s.code());
                    }
                    Err(e) => {
                        tracing::warn!("Failed to execute ffmpeg for proxy: {}", e);
                    }
                }
            })
            .map_err(|e| format!("Failed to spawn proxy thread: {}", e))?;

        Ok(())
    }
}
