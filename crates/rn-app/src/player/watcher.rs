// Render Night - Live Sequence Folder Watcher
// SPDX-License-Identifier: GPL-3.0-or-later

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::sync::{Arc, Mutex};

struct WatcherState {
    _watcher: RecommendedWatcher,
    rx: Receiver<notify::Result<Event>>,
}

#[derive(Clone, Default)]
pub struct SequenceWatcher {
    pub watched_dir: Option<PathBuf>,
    state: Arc<Mutex<Option<WatcherState>>>,
}

impl std::fmt::Debug for SequenceWatcher {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SequenceWatcher")
            .field("watched_dir", &self.watched_dir)
            .finish()
    }
}

impl SequenceWatcher {
    pub fn new() -> Self {
        Self {
            watched_dir: None,
            state: Arc::new(Mutex::new(None)),
        }
    }

    pub fn start_watching(&mut self, dir: &Path) -> Result<(), String> {
        let (tx, rx) = channel();

        let mut watcher = RecommendedWatcher::new(tx, Config::default())
            .map_err(|e| format!("Watcher error: {}", e))?;

        if dir.exists() {
            watcher
                .watch(dir, RecursiveMode::NonRecursive)
                .map_err(|e| format!("Watch path error: {}", e))?;
        }

        self.watched_dir = Some(dir.to_path_buf());
        if let Ok(mut lock) = self.state.lock() {
            *lock = Some(WatcherState {
                _watcher: watcher,
                rx,
            });
        }
        Ok(())
    }

    /// Check if new file creation events were received
    pub fn poll_new_files(&mut self) -> Vec<PathBuf> {
        let mut new_files = Vec::new();
        if let Ok(mut lock) = self.state.lock() {
            if let Some(ref mut st) = *lock {
                while let Ok(res) = st.rx.try_recv() {
                    if let Ok(event) = res {
                        if event.kind.is_create() || event.kind.is_modify() {
                            for path in event.paths {
                                new_files.push(path);
                            }
                        }
                    }
                }
            }
        }
        new_files
    }
}
