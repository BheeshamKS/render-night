// Render Night - Safe Post-Queue OS Actions
// SPDX-License-Identifier: GPL-3.0-or-later

use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{info, warn};

pub use crate::schemas::queue_state::PostAction;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PostActionState {
    Idle,
    Armed,
    Countdown,
    Executed,
    Cancelled,
}

pub struct PostActionManager {
    selected_action: PostAction,
    is_armed: bool,
    state: PostActionState,
    countdown_seconds: u32,
    cancel_flag: Arc<AtomicBool>,
}

impl Default for PostActionManager {
    fn default() -> Self {
        Self::new(PostAction::None, 60)
    }
}

impl PostActionManager {
    pub fn new(action: PostAction, countdown_seconds: u32) -> Self {
        let is_armed = action != PostAction::None;
        Self {
            selected_action: action,
            is_armed,
            state: if is_armed {
                PostActionState::Armed
            } else {
                PostActionState::Idle
            },
            countdown_seconds,
            cancel_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn selected_action(&self) -> PostAction {
        self.selected_action
    }

    pub fn is_armed(&self) -> bool {
        self.is_armed
    }

    pub fn state(&self) -> PostActionState {
        self.state
    }

    /// Set action.
    /// HARD SAFETY RULE: If this is a restored session after a crash or force-close,
    /// the action is strictly disarmed (is_armed = false).
    pub fn set_action(&mut self, action: PostAction, is_restored_session: bool) {
        self.selected_action = action;
        if is_restored_session || action == PostAction::None {
            self.is_armed = false;
            self.state = PostActionState::Idle;
        } else {
            self.is_armed = true;
            self.state = PostActionState::Armed;
        }
    }

    /// Disarm the action (e.g. after a crash, cancellation, or manual disarm).
    pub fn disarm(&mut self) {
        self.is_armed = false;
        self.state = PostActionState::Cancelled;
        self.cancel_flag.store(true, Ordering::SeqCst);
    }

    /// Cancel the countdown.
    pub fn cancel(&mut self) {
        self.disarm();
    }

    /// Execute the action after graceful queue completion with countdown.
    /// Returns true if executed, false if cancelled or disarmed.
    pub async fn run_countdown_and_execute<F>(&mut self, mut on_tick: F) -> bool
    where
        F: FnMut(u32),
    {
        if !self.is_armed || self.selected_action == PostAction::None {
            return false;
        }

        self.cancel_flag.store(false, Ordering::SeqCst);
        self.state = PostActionState::Countdown;

        for sec in (1..=self.countdown_seconds).rev() {
            if self.cancel_flag.load(Ordering::SeqCst) {
                self.state = PostActionState::Cancelled;
                return false;
            }

            on_tick(sec);
            sleep(Duration::from_secs(1)).await;
        }

        if self.cancel_flag.load(Ordering::SeqCst) {
            self.state = PostActionState::Cancelled;
            return false;
        }

        self.state = PostActionState::Executed;
        Self::execute_os_action(self.selected_action);
        true
    }

    pub fn execute_os_action(action: PostAction) {
        info!("Executing post-queue OS action: {:?}", action);
        let cmd = match action {
            PostAction::None => return,
            PostAction::CloseApp => {
                std::process::exit(0);
            }
            PostAction::Shutdown => get_shutdown_command(),
            PostAction::Restart => get_restart_command(),
            PostAction::Sleep => get_sleep_command(),
            PostAction::Hibernate => get_hibernate_command(),
        };

        if let Some((bin, args)) = cmd {
            let res = Command::new(bin).args(&args).spawn();
            if let Err(e) = res {
                warn!("Failed to execute post-action {} {:?}: {}", bin, args, e);
            }
        }
    }
}

fn get_shutdown_command() -> Option<(&'static str, Vec<&'static str>)> {
    if cfg!(target_os = "windows") {
        Some(("shutdown", vec!["/s", "/t", "0"]))
    } else if cfg!(target_os = "macos") {
        Some((
            "osascript",
            vec!["-e", "tell application \"System Events\" to shut down"],
        ))
    } else {
        Some(("systemctl", vec!["poweroff"]))
    }
}

fn get_restart_command() -> Option<(&'static str, Vec<&'static str>)> {
    if cfg!(target_os = "windows") {
        Some(("shutdown", vec!["/r", "/t", "0"]))
    } else if cfg!(target_os = "macos") {
        Some((
            "osascript",
            vec!["-e", "tell application \"System Events\" to restart"],
        ))
    } else {
        Some(("systemctl", vec!["reboot"]))
    }
}

fn get_sleep_command() -> Option<(&'static str, Vec<&'static str>)> {
    if cfg!(target_os = "windows") {
        Some((
            "rundll32.exe",
            vec!["powrprof.dll,SetSuspendState", "0,1,0"],
        ))
    } else if cfg!(target_os = "macos") {
        Some(("pmset", vec!["sleepnow"]))
    } else {
        Some(("systemctl", vec!["suspend"]))
    }
}

fn get_hibernate_command() -> Option<(&'static str, Vec<&'static str>)> {
    if cfg!(target_os = "windows") {
        Some(("shutdown", vec!["/h"]))
    } else if cfg!(target_os = "macos") {
        Some(("pmset", vec!["sleepnow"]))
    } else {
        Some(("systemctl", vec!["hibernate"]))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hard_safety_rule_restored_session_strictly_disarmed() {
        let mut mgr = PostActionManager::new(PostAction::Shutdown, 60);
        assert!(mgr.is_armed());

        // Restored session after crash/restart
        mgr.set_action(PostAction::Shutdown, true);
        assert!(!mgr.is_armed());
        assert_eq!(mgr.state(), PostActionState::Idle);
    }

    #[tokio::test]
    async fn test_countdown_cancel() {
        let mut mgr = PostActionManager::new(PostAction::Sleep, 5);
        assert!(mgr.is_armed());

        let cancel_mgr = mgr.cancel_flag.clone();
        tokio::spawn(async move {
            sleep(Duration::from_millis(50)).await;
            cancel_mgr.store(true, Ordering::SeqCst);
        });

        let executed = mgr.run_countdown_and_execute(|_| {}).await;
        assert!(!executed);
        assert_eq!(mgr.state(), PostActionState::Cancelled);
    }
}
