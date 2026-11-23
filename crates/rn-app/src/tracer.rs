// Render Night - UI Event Tracer & Diagnostics Logger
// SPDX-License-Identifier: GPL-3.0-or-later

use chrono::Utc;
use directories::ProjectDirs;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const MAX_LOG_SIZE_BYTES: u64 = 5 * 1024 * 1024; // 5 MB
const MAX_BACKUPS: usize = 3;

pub struct EventTracer {
    log_path: PathBuf,
}

static TRACER_INSTANCE: OnceLock<Mutex<EventTracer>> = OnceLock::new();

impl EventTracer {
    pub fn init() {
        let _ = Self::global();
    }

    pub fn global() -> &'static Mutex<EventTracer> {
        TRACER_INSTANCE.get_or_init(|| {
            let log_dir = Self::resolve_log_dir();
            let _ = fs::create_dir_all(&log_dir);
            let log_path = log_dir.join("event-trace.log");
            Mutex::new(EventTracer { log_path })
        })
    }

    fn resolve_log_dir() -> PathBuf {
        if let Ok(override_dir) = std::env::var("RN_APP_DATA_DIR") {
            return PathBuf::from(override_dir).join("logs");
        }
        if let Some(proj_dirs) = ProjectDirs::from("com", "rendernight", "render-night") {
            proj_dirs.data_local_dir().join("logs")
        } else {
            PathBuf::from("app-data").join("logs")
        }
    }

    pub fn get_log_path() -> PathBuf {
        let lock = Self::global().lock().unwrap();
        lock.log_path.clone()
    }

    pub fn trace(category: &str, message: &str) {
        if let Ok(mut lock) = Self::global().lock() {
            lock.write_entry(category, message);
        }
    }

    fn rotate_if_needed(&self) {
        if let Ok(metadata) = fs::metadata(&self.log_path) {
            if metadata.len() >= MAX_LOG_SIZE_BYTES {
                for i in (1..MAX_BACKUPS).rev() {
                    let src = self.log_path.with_extension(format!("log.{}", i));
                    let dst = self.log_path.with_extension(format!("log.{}", i + 1));
                    if src.exists() {
                        let _ = fs::rename(&src, &dst);
                    }
                }
                let backup_1 = self.log_path.with_extension("log.1");
                let _ = fs::rename(&self.log_path, backup_1);
            }
        }
    }

    fn write_entry(&mut self, category: &str, message: &str) {
        self.rotate_if_needed();
        let timestamp = Utc::now().to_rfc3339();
        let formatted = format!("[{}] [{}] {}\n", timestamp, category, message);

        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)
        {
            let _ = file.write_all(formatted.as_bytes());
        }
    }

    pub fn tail_lines(count: usize) -> Vec<String> {
        let lock = Self::global().lock().unwrap();
        if let Ok(contents) = fs::read_to_string(&lock.log_path) {
            let lines: Vec<&str> = contents.lines().collect();
            let start = if lines.len() > count {
                lines.len() - count
            } else {
                0
            };
            lines[start..].iter().map(|s| s.to_string()).collect()
        } else {
            Vec::new()
        }
    }
}

/// Convenience macro for tracing events
#[macro_export]
macro_rules! trace_event {
    ($category:expr, $($arg:tt)*) => {
        $crate::tracer::EventTracer::trace($category, &format!($($arg)*));
    };
}
