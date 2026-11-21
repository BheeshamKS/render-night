// Render Night - System Sleep Blocker
// SPDX-License-Identifier: GPL-3.0-or-later

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tracing::{debug, info};

pub struct SleepBlockerManager {
    ref_count: Arc<AtomicUsize>,
    awake_handle: Arc<Mutex<Option<keepawake::AwakeHandle>>>,
}

impl Default for SleepBlockerManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SleepBlockerManager {
    pub fn new() -> Self {
        Self {
            ref_count: Arc::new(AtomicUsize::new(0)),
            awake_handle: Arc::new(Mutex::new(None)),
        }
    }

    pub fn is_blocking(&self) -> bool {
        self.ref_count.load(Ordering::SeqCst) > 0
    }

    /// Acquire sleep prevention hold. Returns a ReleaseGuard that releases on drop.
    pub fn acquire(&self) -> ReleaseGuard {
        let prev = self.ref_count.fetch_add(1, Ordering::SeqCst);
        if prev == 0 {
            debug!("Acquiring OS system sleep inhibition");
            match keepawake::Builder::default()
                .app_name("Render Night")
                .reason("Batch rendering in progress")
                .app_reverse_domain("com.rendernight.app")
                .create()
            {
                Ok(handle) => {
                    *self.awake_handle.lock().unwrap() = Some(handle);
                    info!("OS sleep inhibition successfully enabled");
                }
                Err(e) => {
                    info!("Note: keepawake sleep inhibitor unavailable: {}", e);
                }
            }
        }

        ReleaseGuard {
            ref_count: self.ref_count.clone(),
            awake_handle: self.awake_handle.clone(),
        }
    }
}

pub struct ReleaseGuard {
    ref_count: Arc<AtomicUsize>,
    awake_handle: Arc<Mutex<Option<keepawake::AwakeHandle>>>,
}

impl Drop for ReleaseGuard {
    fn drop(&mut self) {
        let prev = self.ref_count.fetch_sub(1, Ordering::SeqCst);
        if prev == 1 {
            debug!("Releasing OS system sleep inhibition");
            let mut handle_guard = self.awake_handle.lock().unwrap();
            *handle_guard = None;
            info!("OS sleep inhibition released");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sleep_blocker_ref_counting() {
        let mgr = SleepBlockerManager::new();
        assert!(!mgr.is_blocking());

        let guard1 = mgr.acquire();
        assert!(mgr.is_blocking());

        let guard2 = mgr.acquire();
        assert!(mgr.is_blocking());

        drop(guard1);
        assert!(mgr.is_blocking());

        drop(guard2);
        assert!(!mgr.is_blocking());
    }
}
