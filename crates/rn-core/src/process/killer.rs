// Render Night - Process Tree Killer
// SPDX-License-Identifier: GPL-3.0-or-later

#[cfg(windows)]
use std::process::Command;
use tracing::{debug, warn};

/// Terminates an entire process tree given a root PID.
/// On Windows: uses `taskkill /pid <pid> /T /F`.
/// On Unix: sends SIGKILL (or specified signal) to the process group `-pid`, falling back to `pid`.
pub async fn kill_process_tree(pid: u32) {
    if pid == 0 {
        return;
    }

    #[cfg(windows)]
    {
        let pid_str = pid.to_string();
        debug!("Terminating Windows process tree for PID {}", pid);
        let res = tokio::process::Command::new("taskkill")
            .args(["/pid", &pid_str, "/T", "/F"])
            .output()
            .await;

        if let Err(e) = res {
            warn!("taskkill error for PID {}: {}", pid, e);
        }
    }

    #[cfg(unix)]
    {
        debug!("Terminating Unix process group for PID {}", pid);
        let pid_i32 = pid as i32;
        // First try killing the process group (-pid)
        let pg_res = unsafe { libc::kill(-pid_i32, libc::SIGKILL) };
        if pg_res != 0 {
            let err = std::io::Error::last_os_error();
            if err.raw_os_error() != Some(libc::ESRCH) {
                // If killing process group failed with anything other than "no such process",
                // fallback to killing the direct PID
                let direct_res = unsafe { libc::kill(pid_i32, libc::SIGKILL) };
                if direct_res != 0 {
                    let err2 = std::io::Error::last_os_error();
                    if err2.raw_os_error() != Some(libc::ESRCH) {
                        warn!("Failed to kill process PID {}: {}", pid, err2);
                    }
                }
            }
        }
    }
}

/// Synchronous version for drop handlers or signal handlers
pub fn kill_process_tree_sync(pid: u32) {
    if pid == 0 {
        return;
    }

    #[cfg(windows)]
    {
        let pid_str = pid.to_string();
        let _ = Command::new("taskkill")
            .args(["/pid", &pid_str, "/T", "/F"])
            .output();
    }

    #[cfg(unix)]
    {
        let pid_i32 = pid as i32;
        let pg_res = unsafe { libc::kill(-pid_i32, libc::SIGKILL) };
        if pg_res != 0 {
            let err = std::io::Error::last_os_error();
            if err.raw_os_error() != Some(libc::ESRCH) {
                let _ = unsafe { libc::kill(pid_i32, libc::SIGKILL) };
            }
        }
    }
}

/// Check if a PID is alive in the OS.
pub fn is_pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }

    #[cfg(unix)]
    {
        let res = unsafe { libc::kill(pid as i32, 0) };
        if res == 0 {
            true
        } else {
            let err = std::io::Error::last_os_error();
            // EPERM means process exists but we lack permission to signal it
            err.raw_os_error() == Some(libc::EPERM)
        }
    }

    #[cfg(windows)]
    {
        extern "system" {
            fn OpenProcess(
                dwDesiredAccess: u32,
                bInheritHandle: i32,
                dwProcessId: u32,
            ) -> *mut std::ffi::c_void;
            fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
            fn GetExitCodeProcess(hProcess: *mut std::ffi::c_void, lpExitCode: *mut u32) -> i32;
        }
        const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
        const STILL_ACTIVE: u32 = 259;

        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return false;
            }
            let mut exit_code = 0u32;
            let res = GetExitCodeProcess(handle, &mut exit_code);
            CloseHandle(handle);
            res != 0 && exit_code == STILL_ACTIVE
        }
    }
}
