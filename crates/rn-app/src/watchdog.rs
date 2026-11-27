// Render Night - UI Heartbeat Watchdog
// SPDX-License-Identifier: GPL-3.0-or-later

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

static LAST_TICK_MILLIS: AtomicU64 = AtomicU64::new(0);
static WATCHDOG_RUNNING: AtomicBool = AtomicBool::new(false);
static WATCHDOG_SHUTDOWN: AtomicBool = AtomicBool::new(false);

fn current_epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Record that the main UI thread has ticked
pub fn record_ui_tick() {
    LAST_TICK_MILLIS.store(current_epoch_ms(), Ordering::Relaxed);
}

/// Returns timestamp in milliseconds of the last UI tick
pub fn last_ui_tick() -> u64 {
    LAST_TICK_MILLIS.load(Ordering::Relaxed)
}

/// Returns true if the UI has stalled (>2000ms without tick)
pub fn is_stalled() -> bool {
    let last = last_ui_tick();
    if last == 0 {
        return false;
    }
    let now = current_epoch_ms();
    now.saturating_sub(last) > 2000
}

/// Starts the UI heartbeat watchdog background thread
pub fn start_watchdog(
    sender: Option<blenderui::window::UiSender>,
) -> Option<std::thread::JoinHandle<()>> {
    if WATCHDOG_RUNNING.swap(true, Ordering::SeqCst) {
        return None;
    }
    WATCHDOG_SHUTDOWN.store(false, Ordering::SeqCst);
    record_ui_tick();

    let handle = std::thread::Builder::new()
        .name("rn-ui-watchdog".to_string())
        .spawn(move || {
            crate::trace_event!("WATCHDOG", "UI heartbeat watchdog monitor started");
            let mut stall_reported = false;

            while !WATCHDOG_SHUTDOWN.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(500));

                let last = last_ui_tick();
                let now = current_epoch_ms();
                let elapsed = now.saturating_sub(last);

                if elapsed > 2000 {
                    if !stall_reported {
                        crate::trace_event!(
                            "WATCHDOG_STALL",
                            "WARNING: Main UI thread has not responded for {}ms (>2000ms threshold)!",
                            elapsed
                        );
                        eprintln!(
                            "[WATCHDOG WARNING] UI thread stall detected: {}ms elapsed since last tick",
                            elapsed
                        );
                        stall_reported = true;
                    }
                } else if stall_reported {
                    crate::trace_event!(
                        "WATCHDOG_RECOVERED",
                        "Main UI thread recovered after stall (active again)"
                    );
                    stall_reported = false;
                }

                if let Some(ref s) = sender {
                    let _ = s.send(|_cx| {
                        record_ui_tick();
                    });
                }
            }

            WATCHDOG_RUNNING.store(false, Ordering::SeqCst);
            crate::trace_event!("WATCHDOG", "UI heartbeat watchdog monitor stopped");
        })
        .ok();

    handle
}

/// Signals the watchdog monitor thread to exit
pub fn stop_watchdog() {
    WATCHDOG_SHUTDOWN.store(true, Ordering::SeqCst);
}
