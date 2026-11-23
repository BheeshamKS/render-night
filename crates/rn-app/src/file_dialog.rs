// Render Night - File Dialog Service Abstraction
// SPDX-License-Identifier: GPL-3.0-or-later

use std::fmt::Debug;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Trait abstracting OS file dialog operations for testability
pub trait FileDialogService: Send + Sync + Debug {
    fn pick_blend_files(&self) -> Option<Vec<PathBuf>>;
    fn pick_blender_executable(&self) -> Option<PathBuf>;
}

/// Real native dialog implementation using `rfd`
#[derive(Debug, Default)]
pub struct NativeFileDialog;

impl FileDialogService for NativeFileDialog {
    fn pick_blend_files(&self) -> Option<Vec<PathBuf>> {
        rfd::FileDialog::new()
            .add_filter("Blender File (*.blend)", &["blend"])
            .pick_files()
    }

    fn pick_blender_executable(&self) -> Option<PathBuf> {
        #[cfg(target_os = "windows")]
        let dialog = rfd::FileDialog::new().add_filter("Blender Executable (*.exe)", &["exe"]);
        #[cfg(not(target_os = "windows"))]
        let dialog = rfd::FileDialog::new();

        dialog.pick_file()
    }
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
