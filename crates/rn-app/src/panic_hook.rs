// Render Night - Panic Hook & Diagnostics
// SPDX-License-Identifier: GPL-3.0-or-later

use std::panic::PanicHookInfo;
use std::path::PathBuf;

/// Installs a non-silent panic hook that logs payload, source location, and full backtrace
/// to stderr, ~/.local/share/render-night/logs/panic.log, and the EventTracer.
pub fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info: &PanicHookInfo| {
        let payload = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic payload".to_string()
        };

        let location = panic_info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());

        let backtrace = std::backtrace::Backtrace::capture();

        let formatted = format!(
            "============================================================\n\
             RENDER NIGHT FATAL PANIC\n\
             Location: {}\n\
             Payload:  {}\n\
             Backtrace:\n{:?}\n\
             ============================================================",
            location, payload, backtrace
        );

        eprintln!("{}", formatted);
        crate::trace_event!("PANIC", "Fatal panic at {}: {}", location, payload);

        let log_path = get_panic_log_path();
        if let Some(parent) = log_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&log_path, &formatted);

        default_hook(panic_info);
    }));
}

/// Returns standard log path for fatal panics
pub fn get_panic_log_path() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".local/share/render-night/logs/panic.log")
    } else if let Some(base_dirs) = directories::BaseDirs::new() {
        base_dirs
            .data_local_dir()
            .join("render-night/logs/panic.log")
    } else {
        std::env::temp_dir().join("render-night/logs/panic.log")
    }
}
