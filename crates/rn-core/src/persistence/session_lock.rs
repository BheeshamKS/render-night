// Render Night - Unclean Shutdown & Session Lock Management
// SPDX-License-Identifier: GPL-3.0-or-later

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{info, warn};

use super::atomic_file::{read_json_file, write_atomic_json};
use crate::process::is_pid_alive;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionLockData {
    pub pid: u32,
    pub timestamp: u64,
    #[serde(default)]
    pub worker_pids: Vec<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_job_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state_path: Option<String>,
}

pub struct SessionLockManager {
    lock_file_path: PathBuf,
}

impl SessionLockManager {
    pub fn new(app_data_dir: &Path) -> Self {
        Self {
            lock_file_path: app_data_dir.join("unclean-shutdown.lock"),
        }
    }

    pub fn lock_path(&self) -> &Path {
        &self.lock_file_path
    }

    /// Acquire or update the session lock with the current main process PID.
    pub fn acquire_lock(
        &self,
        worker_pids: Vec<u32>,
        active_job_id: Option<String>,
        state_path: Option<String>,
    ) -> std::io::Result<()> {
        let data = SessionLockData {
            pid: std::process::id(),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            worker_pids,
            active_job_id,
            state_path,
        };
        write_atomic_json(&self.lock_file_path, &data)
    }

    /// Update worker PIDs in the lock file
    pub fn update_worker_pids(
        &self,
        worker_pids: Vec<u32>,
        active_job_id: Option<String>,
    ) -> std::io::Result<()> {
        let existing: Option<SessionLockData> = read_json_file(&self.lock_file_path).ok();
        let data = SessionLockData {
            pid: existing
                .as_ref()
                .map(|e| e.pid)
                .unwrap_or_else(std::process::id),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            worker_pids,
            active_job_id: active_job_id
                .or_else(|| existing.as_ref().and_then(|e| e.active_job_id.clone())),
            state_path: existing.and_then(|e| e.state_path),
        };
        write_atomic_json(&self.lock_file_path, &data)
    }

    /// Release the session lock on clean exit.
    pub fn release_lock(&self) {
        if self.lock_file_path.exists() {
            let _ = fs::remove_file(&self.lock_file_path);
        }
    }

    /// Check if a previous session terminated uncleanly.
    pub fn check_unclean_shutdown(&self) -> (bool, Option<SessionLockData>) {
        if !self.lock_file_path.exists() {
            return (false, None);
        }

        let lock_data: SessionLockData = match read_json_file(&self.lock_file_path) {
            Ok(d) => d,
            Err(_) => {
                // Corrupt lock file left behind
                return (true, None);
            }
        };

        let my_pid = std::process::id();
        if lock_data.pid == my_pid {
            // Belonged to current process in same session
            return (false, Some(lock_data));
        }

        // Check if main process recorded in lock is still alive
        if !is_pid_alive(lock_data.pid) {
            warn!(
                "Detected unclean shutdown from previous process PID {}",
                lock_data.pid
            );
            // Terminate any leftover worker PIDs from the crashed session
            for &worker_pid in &lock_data.worker_pids {
                if is_pid_alive(worker_pid) {
                    info!(
                        "Killing orphaned worker PID {} from crashed session",
                        worker_pid
                    );
                    crate::process::kill_process_tree_sync(worker_pid);
                }
            }
            return (true, Some(lock_data));
        }

        (false, Some(lock_data))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_session_lock_acquire_and_release() {
        let temp = tempdir().unwrap();
        let mgr = SessionLockManager::new(temp.path());

        assert!(!mgr.lock_path().exists());
        mgr.acquire_lock(vec![1234, 5678], Some("job-1".to_string()), None)
            .unwrap();
        assert!(mgr.lock_path().exists());

        let (is_unclean, lock_data) = mgr.check_unclean_shutdown();
        assert!(!is_unclean); // Same process
        assert!(lock_data.is_some());
        assert_eq!(lock_data.unwrap().worker_pids, vec![1234, 5678]);

        mgr.release_lock();
        assert!(!mgr.lock_path().exists());
    }

    #[test]
    fn test_session_lock_dead_pid_detection() {
        let temp = tempdir().unwrap();
        let mgr = SessionLockManager::new(temp.path());

        // Simulate a dead PID (e.g. 99999999)
        let dead_lock = SessionLockData {
            pid: 99_999_999,
            timestamp: 1000,
            worker_pids: vec![],
            active_job_id: Some("job-crash".to_string()),
            state_path: None,
        };
        write_atomic_json(mgr.lock_path(), &dead_lock).unwrap();

        let (is_unclean, data) = mgr.check_unclean_shutdown();
        assert!(is_unclean);
        assert_eq!(data.unwrap().active_job_id.as_deref(), Some("job-crash"));
    }
}
