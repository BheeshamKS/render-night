// Render Night - File Dialog Service Abstraction & Fallback Chain
// SPDX-License-Identifier: GPL-3.0-or-later

use std::fmt::Debug;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Trait abstracting OS file dialog operations for testability
pub trait FileDialogService: Send + Sync + Debug {
    fn pick_blend_files(&self) -> Option<Vec<PathBuf>>;
    fn pick_blender_executable(&self) -> Option<PathBuf>;
}

/// Real native dialog implementation using `rfd` with CLI fallback chain (zenity / kdialog)
#[derive(Debug, Default)]
pub struct NativeFileDialog;

impl FileDialogService for NativeFileDialog {
    fn pick_blend_files(&self) -> Option<Vec<PathBuf>> {
        crate::trace_event!(
            "FILE_PICKER",
            "trying tier 1: rfd::FileDialog (native/portal)"
        );
        // Try 1: rfd
        if let Some(files) = rfd::FileDialog::new()
            .add_filter("Blender File (*.blend)", &["blend"])
            .pick_files()
        {
            crate::trace_event!(
                "FILE_PICKER",
                "tier 1 (rfd) succeeded with {} files",
                files.len()
            );
            return Some(files);
        }

        // Try 2: zenity (Linux / Unix)
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            crate::trace_event!("FILE_PICKER", "trying tier 2a: zenity CLI picker");
            if let Some(files) = pick_files_with_zenity("Blender files (*.blend) | *.blend") {
                crate::trace_event!(
                    "FILE_PICKER",
                    "tier 2a (zenity) succeeded with {} files",
                    files.len()
                );
                return Some(files);
            }

            crate::trace_event!("FILE_PICKER", "trying tier 2b: kdialog CLI picker");
            if let Some(files) = pick_files_with_kdialog("*.blend|Blender files (*.blend)") {
                crate::trace_event!(
                    "FILE_PICKER",
                    "tier 2b (kdialog) succeeded with {} files",
                    files.len()
                );
                return Some(files);
            }
        }

        crate::trace_event!(
            "FILE_PICKER",
            "all native/CLI file pickers returned None or unavailable"
        );
        None
    }

    fn pick_blender_executable(&self) -> Option<PathBuf> {
        crate::trace_event!(
            "FILE_PICKER",
            "trying tier 1: rfd::FileDialog to locate blender executable"
        );
        #[cfg(target_os = "windows")]
        let dialog = rfd::FileDialog::new().add_filter("Blender Executable (*.exe)", &["exe"]);
        #[cfg(not(target_os = "windows"))]
        let dialog = rfd::FileDialog::new();

        if let Some(exe) = dialog.pick_file() {
            crate::trace_event!(
                "FILE_PICKER",
                "tier 1 (rfd) succeeded with executable: {:?}",
                exe
            );
            return Some(exe);
        }

        #[cfg(all(unix, not(target_os = "macos")))]
        {
            crate::trace_event!(
                "FILE_PICKER",
                "trying tier 2a: zenity CLI to locate blender"
            );
            if let Some(exe) = pick_single_file_with_zenity("Locate Blender Executable") {
                crate::trace_event!(
                    "FILE_PICKER",
                    "tier 2a (zenity) succeeded with executable: {:?}",
                    exe
                );
                return Some(exe);
            }

            crate::trace_event!(
                "FILE_PICKER",
                "trying tier 2b: kdialog CLI to locate blender"
            );
            if let Some(exe) = pick_single_file_with_kdialog("Locate Blender Executable") {
                crate::trace_event!(
                    "FILE_PICKER",
                    "tier 2b (kdialog) succeeded with executable: {:?}",
                    exe
                );
                return Some(exe);
            }
        }

        crate::trace_event!(
            "FILE_PICKER",
            "all native/CLI pickers for blender executable returned None"
        );
        None
    }
}

/// Helper function to sanitize environment before spawning desktop CLI file dialogs
#[allow(dead_code)]
fn sanitize_child_env(cmd: &mut std::process::Command) {
    cmd.env_remove("APPDIR");
    cmd.env_remove("APPIMAGE");
    cmd.env_remove("PYTHONHOME");
    cmd.env_remove("PYTHONPATH");
    cmd.env_remove("GIO_MODULE_DIR");
    if std::env::var("APPIMAGE").is_ok() {
        cmd.env_remove("LD_LIBRARY_PATH");
    }
}

/// Fallback file picker using `zenity`
#[allow(dead_code)]
pub fn pick_files_with_zenity(filter_pattern: &str) -> Option<Vec<PathBuf>> {
    let mut cmd = std::process::Command::new("zenity");
    sanitize_child_env(&mut cmd);
    cmd.arg("--file-selection")
        .arg("--multiple")
        .arg("--separator=|")
        .arg(format!("--file-filter={}", filter_pattern));

    let output = cmd.output().ok()?;
    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        let paths: Vec<PathBuf> = text
            .trim()
            .split('|')
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .collect();
        if !paths.is_empty() {
            return Some(paths);
        }
    }
    None
}

/// Fallback single file picker using `zenity`
#[allow(dead_code)]
pub fn pick_single_file_with_zenity(title: &str) -> Option<PathBuf> {
    let mut cmd = std::process::Command::new("zenity");
    sanitize_child_env(&mut cmd);
    cmd.arg("--file-selection")
        .arg(format!("--title={}", title));

    let output = cmd.output().ok()?;
    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }
    None
}

/// Fallback file picker using `kdialog`
#[allow(dead_code)]
pub fn pick_files_with_kdialog(filter_pattern: &str) -> Option<Vec<PathBuf>> {
    let mut cmd = std::process::Command::new("kdialog");
    sanitize_child_env(&mut cmd);
    cmd.arg("--getopenfilename")
        .arg(".")
        .arg(filter_pattern)
        .arg("--multiple")
        .arg("--separate-output");

    let output = cmd.output().ok()?;
    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        let paths: Vec<PathBuf> = text
            .lines()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .collect();
        if !paths.is_empty() {
            return Some(paths);
        }
    }
    None
}

/// Fallback single file picker using `kdialog`
#[allow(dead_code)]
pub fn pick_single_file_with_kdialog(title: &str) -> Option<PathBuf> {
    let mut cmd = std::process::Command::new("kdialog");
    sanitize_child_env(&mut cmd);
    cmd.arg("--getopenfilename")
        .arg(".")
        .arg(format!("--title={}", title));

    let output = cmd.output().ok()?;
    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }
    None
}

/// Mock dialog implementation for headless and automated unit/integration tests
#[derive(Debug, Default)]
pub struct MockFileDialog {
    pub blend_files_queue: Mutex<Vec<Vec<PathBuf>>>,
    pub blender_executable: Mutex<Option<PathBuf>>,
    pub pick_blend_called: Mutex<usize>,
    pub pick_blender_called: Mutex<usize>,
}

impl MockFileDialog {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_blend_files(paths: Vec<PathBuf>) -> Self {
        let mock = Self::default();
        mock.blend_files_queue.lock().unwrap().push(paths);
        mock
    }

    pub fn with_blender_exe(exe: PathBuf) -> Self {
        let mock = Self::default();
        *mock.blender_executable.lock().unwrap() = Some(exe);
        mock
    }

    pub fn push_blend_files(&self, paths: Vec<PathBuf>) {
        self.blend_files_queue.lock().unwrap().push(paths);
    }

    pub fn pick_blend_calls(&self) -> usize {
        *self.pick_blend_called.lock().unwrap()
    }

    pub fn pick_blender_calls(&self) -> usize {
        *self.pick_blender_called.lock().unwrap()
    }
}

impl FileDialogService for MockFileDialog {
    fn pick_blend_files(&self) -> Option<Vec<PathBuf>> {
        let mut count = self.pick_blend_called.lock().unwrap();
        *count += 1;
        let mut queue = self.blend_files_queue.lock().unwrap();
        if !queue.is_empty() {
            Some(queue.remove(0))
        } else {
            None
        }
    }

    fn pick_blender_executable(&self) -> Option<PathBuf> {
        let mut count = self.pick_blender_called.lock().unwrap();
        *count += 1;
        self.blender_executable.lock().unwrap().clone()
    }
}

pub fn default_dialog_service() -> Arc<dyn FileDialogService> {
    Arc::new(NativeFileDialog)
}
