// Render Night - Process Environment Sanitization
// SPDX-License-Identifier: GPL-3.0-or-later

/// Sanitize std child process environment before launching Blender or external tools.
/// Removes AppImage environment variables (APPDIR, APPIMAGE, ARGV0, OWD, PYTHONHOME, PYTHONPATH, GIO_MODULE_DIR)
/// and cleans LD_LIBRARY_PATH so child processes do not load bundled AppImage libraries.
pub fn sanitize_child_env(cmd: &mut std::process::Command) {
    cmd.env_remove("APPDIR");
    cmd.env_remove("APPIMAGE");
    cmd.env_remove("ARGV0");
    cmd.env_remove("OWD");
    cmd.env_remove("PYTHONHOME");
    cmd.env_remove("PYTHONPATH");
    cmd.env_remove("GIO_MODULE_DIR");

    if let Ok(ld) = std::env::var("LD_LIBRARY_PATH") {
        let cleaned: Vec<&str> = ld
            .split(':')
            .filter(|p| !p.contains(".mount_") && !p.contains("appdir") && !p.contains("AppRun"))
            .collect();
        if cleaned.is_empty() {
            cmd.env_remove("LD_LIBRARY_PATH");
        } else {
            cmd.env("LD_LIBRARY_PATH", cleaned.join(":"));
        }
    }
}

/// Sanitize tokio child process environment before launching Blender or external tools.
pub fn sanitize_tokio_env(cmd: &mut tokio::process::Command) {
    cmd.env_remove("APPDIR");
    cmd.env_remove("APPIMAGE");
    cmd.env_remove("ARGV0");
    cmd.env_remove("OWD");
    cmd.env_remove("PYTHONHOME");
    cmd.env_remove("PYTHONPATH");
    cmd.env_remove("GIO_MODULE_DIR");

    if let Ok(ld) = std::env::var("LD_LIBRARY_PATH") {
        let cleaned: Vec<&str> = ld
            .split(':')
            .filter(|p| !p.contains(".mount_") && !p.contains("appdir") && !p.contains("AppRun"))
            .collect();
        if cleaned.is_empty() {
            cmd.env_remove("LD_LIBRARY_PATH");
        } else {
            cmd.env("LD_LIBRARY_PATH", cleaned.join(":"));
        }
    }
}
