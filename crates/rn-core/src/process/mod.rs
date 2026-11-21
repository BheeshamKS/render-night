// Render Night - Process Isolation Module
// SPDX-License-Identifier: GPL-3.0-or-later

pub mod killer;
pub mod lifetime;

pub use killer::{is_pid_alive, kill_process_tree, kill_process_tree_sync};
pub use lifetime::{spawn_isolated_child, OrphanSweeper, ProcessPriority, ProcessRecord};
