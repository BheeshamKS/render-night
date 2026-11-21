// Render Night - Process Lifetime & Isolation Management
// SPDX-License-Identifier: GPL-3.0-or-later

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Sender};
use std::sync::OnceLock;
use std::thread;
use tracing::{debug, info};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProcessPriority {
    Low,
    BelowNormal,
    Normal,
}

impl ProcessPriority {
    pub fn to_nice_value(&self) -> i32 {
        match self {
            ProcessPriority::Low => 19,
            ProcessPriority::BelowNormal => 10,
            ProcessPriority::Normal => 0,
        }
    }
}

/// Information recorded about an active worker process to enable orphan detection and sweeping.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessRecord {
    pub pid: u32,
    pub start_time: u64,
    pub command: String,
}

pub struct OrphanSweeper {
    registry_path: PathBuf,
}

impl OrphanSweeper {
    pub fn new(app_data_dir: &Path) -> Self {
        Self {
            registry_path: app_data_dir.join("orphans_registry.json"),
        }
    }

    /// Record a spawned worker PID
    pub fn record_spawn(&self, pid: u32, command: &str) {
        let mut list = self.load_records();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        list.push(ProcessRecord {
            pid,
            start_time: now,
            command: command.to_string(),
        });
        self.save_records(&list);
    }

    /// Remove a PID when cleanly terminated
    pub fn record_exit(&self, pid: u32) {
        let mut list = self.load_records();
        list.retain(|r| r.pid != pid);
        self.save_records(&list);
    }

    /// Sweep orphaned processes at startup
    pub fn sweep_orphans(&self) -> Vec<u32> {
        let list = self.load_records();
        let mut swept = Vec::new();

        for record in list {
            if super::killer::is_pid_alive(record.pid) {
                info!(
                    "Found orphaned worker PID {} (cmd: {}). Terminating...",
                    record.pid, record.command
                );
                super::killer::kill_process_tree_sync(record.pid);
                swept.push(record.pid);
            }
        }

        // Clear registry after sweep
        let _ = fs::remove_file(&self.registry_path);
        swept
    }

    fn load_records(&self) -> Vec<ProcessRecord> {
        if !self.registry_path.exists() {
            return Vec::new();
        }
        fs::read_to_string(&self.registry_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn save_records(&self, records: &[ProcessRecord]) {
        if let Some(parent) = self.registry_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(records) {
            let _ = fs::write(&self.registry_path, json);
        }
    }
}

// Spawner message protocol
enum SpawnMsg {
    Spawn {
        builder: Box<dyn FnOnce() -> std::io::Result<std::process::Child> + Send>,
        responder: tokio::sync::oneshot::Sender<std::io::Result<std::process::Child>>,
    },
}

static DEDICATED_SPAWNER: OnceLock<Sender<SpawnMsg>> = OnceLock::new();

/// Returns a sender to the dedicated long-lived thread spawner.
/// In Linux, PR_SET_PDEATHSIG delivers SIGKILL when the thread that called clone()/fork() exits.
/// By running all process spawns on a single dedicated OS thread that lives for the lifetime of
/// the application, Blender will NEVER receive premature death signals while Render Night is alive,
/// but will immediately receive SIGKILL if Render Night crashes or is terminated.
fn get_spawner() -> &'static Sender<SpawnMsg> {
    DEDICATED_SPAWNER.get_or_init(|| {
        let (tx, rx) = channel::<SpawnMsg>();
        thread::Builder::new()
            .name("rn-dedicated-spawner".to_string())
            .spawn(move || {
                debug!("Dedicated OS spawner thread started");
                while let Ok(msg) = rx.recv() {
                    match msg {
                        SpawnMsg::Spawn { builder, responder } => {
                            let result = builder();
                            let _ = responder.send(result);
                        }
                    }
                }
                debug!("Dedicated OS spawner thread exiting");
            })
            .expect("Failed to start dedicated process spawner thread");
        tx
    })
}

/// Spawns a child process with death signal and process group isolation configured.
pub async fn spawn_isolated_child(
    mut cmd: std::process::Command,
    priority: Option<ProcessPriority>,
) -> std::io::Result<std::process::Child> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let nice_val = priority.map(|p| p.to_nice_value()).unwrap_or(0);

        unsafe {
            cmd.pre_exec(move || {
                // 1. Create a new process group so killing -pgid cleans up any child processes Blender spawns
                if libc::setpgid(0, 0) != 0 {
                    return Err(std::io::Error::last_os_error());
                }

                // 2. On Linux: request SIGKILL when parent thread dies
                #[cfg(target_os = "linux")]
                {
                    if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL) != 0 {
                        return Err(std::io::Error::last_os_error());
                    }
                }

                // 3. Set process priority / nice value
                if nice_val != 0 {
                    libc::setpriority(libc::PRIO_PROCESS, 0, nice_val);
                }

                Ok(())
            });
        }
    }

    let (responder_tx, responder_rx) = tokio::sync::oneshot::channel();
    let spawner = get_spawner();

    spawner
        .send(SpawnMsg::Spawn {
            builder: Box::new(move || cmd.spawn()),
            responder: responder_tx,
        })
        .map_err(|e| std::io::Error::other(e.to_string()))?;

    responder_rx.await.map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "Spawner thread disconnected",
        )
    })?
}
