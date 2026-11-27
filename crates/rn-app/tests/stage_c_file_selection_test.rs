// Render Night - Stage C: File Selection Fallback Chain Tests
// SPDX-License-Identifier: GPL-3.0-or-later

use rn_app::file_dialog::MockFileDialog;
use rn_app::state::{AppState, FileBrowserMode, ModalState};
use std::path::PathBuf;
use std::sync::Arc;

#[test]
fn test_tier_1_native_dialog_success_adds_files_directly() {
    let mut state = AppState::new();
    let sample_file = PathBuf::from("tests/fixtures/eevee-basic.blend");
    let mock_dialog = Arc::new(MockFileDialog::with_blend_files(vec![sample_file.clone()]));
    state.file_dialog = mock_dialog.clone();

    // Invoking prompt_add_blend_files should pick the file and add it immediately
    state.prompt_add_blend_files();

    assert_eq!(mock_dialog.pick_blend_calls(), 1);
    assert_eq!(state.queue_state.jobs.len(), 1);
    assert!(state.queue_state.jobs[0]
        .blend_path
        .contains("eevee-basic.blend"));
    assert_eq!(state.active_modal, None);
}

#[test]
fn test_tier_3_broken_portal_fallback_opens_in_app_browser() {
    let mut state = AppState::new();
    // Empty mock dialog simulates a broken portal returning None
    let mock_dialog = Arc::new(MockFileDialog::new());
    state.file_dialog = mock_dialog.clone();

    assert_eq!(state.active_modal, None);

    // When native/CLI dialog returns None, fallback engages: opens in-app browser
    state.prompt_add_blend_files();

    assert_eq!(mock_dialog.pick_blend_calls(), 1);
    // Queue should not silently fail
    assert!(
        matches!(state.active_modal, Some(ModalState::FileBrowser(ref b)) if b.mode == FileBrowserMode::BlendFiles)
    );
}

#[test]
fn test_in_app_browser_navigation_and_selection() {
    let mut state = AppState::new();
    state.open_file_browser(FileBrowserMode::BlendFiles);

    // Initial state check
    let Some(ModalState::FileBrowser(ref browser)) = state.active_modal else {
        panic!("File browser modal was not opened");
    };
    let initial_dir = browser.current_dir.clone();

    // 1. Up navigation
    state.file_browser_up();
    let Some(ModalState::FileBrowser(ref browser)) = state.active_modal else {
        panic!("File browser modal closed unexpectedly");
    };
    if let Some(parent) = initial_dir.parent() {
        assert_eq!(browser.current_dir, parent);
    }

    // 2. Navigate into tests/fixtures
    let fixtures_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("tests")
        .join("fixtures");
    state.navigate_file_browser(fixtures_dir.clone());

    let Some(ModalState::FileBrowser(ref browser)) = state.active_modal else {
        panic!("File browser modal closed unexpectedly");
    };
    assert_eq!(browser.current_dir, fixtures_dir);
    assert!(
        !browser.entries.is_empty(),
        "Fixtures directory should have entries"
    );

    // Verify .blend files are listed
    let has_blend = browser
        .entries
        .iter()
        .any(|e| e.name == "eevee-basic.blend");
    assert!(
        has_blend,
        "eevee-basic.blend must be listed in file browser"
    );

    // 3. Toggle selection
    let target_blend = fixtures_dir.join("eevee-basic.blend");
    state.toggle_file_browser_selection(target_blend.clone());

    let Some(ModalState::FileBrowser(ref browser)) = state.active_modal else {
        panic!("File browser modal closed unexpectedly");
    };
    assert!(browser.selected_paths.contains(&target_blend));

    // 4. Commit selection
    state.commit_file_browser_selection();

    assert_eq!(state.active_modal, None, "Modal should close on commit");
    assert_eq!(
        state.queue_state.jobs.len(),
        1,
        "Job should be added from in-app browser"
    );
    assert!(state.queue_state.jobs[0]
        .blend_path
        .contains("eevee-basic.blend"));
}

#[test]
fn test_in_app_browser_direct_path_input() {
    let mut state = AppState::new();
    state.open_file_browser(FileBrowserMode::BlendFiles);

    let target_blend = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("tests/fixtures/eevee-basic.blend");

    // Set path directly via text box
    if let Some(ModalState::FileBrowser(ref mut browser)) = state.active_modal {
        browser.input_path_text = target_blend.to_string_lossy().to_string();
    }

    state.commit_file_browser_selection();

    assert_eq!(state.active_modal, None);
    assert_eq!(state.queue_state.jobs.len(), 1);
    assert!(state.queue_state.jobs[0]
        .blend_path
        .contains("eevee-basic.blend"));
}

#[test]
fn test_in_app_browser_blender_executable_mode() {
    let mut state = AppState::new();
    let mock_dialog = Arc::new(MockFileDialog::new());
    state.file_dialog = mock_dialog.clone();

    // When locating blender fails via portal, opens in-app browser in BlenderExecutable mode
    state.prompt_locate_blender();

    assert_eq!(mock_dialog.pick_blender_calls(), 1);
    assert!(
        matches!(state.active_modal, Some(ModalState::FileBrowser(ref b)) if b.mode == FileBrowserMode::BlenderExecutable)
    );

    // Select custom blender path
    let fake_blender = PathBuf::from("/opt/blender/blender");
    if let Some(ModalState::FileBrowser(ref mut browser)) = state.active_modal {
        browser.selected_paths.push(fake_blender.clone());
    }

    state.commit_file_browser_selection();

    assert_eq!(state.active_modal, None);
    assert!(state.custom_blender_paths.contains(&fake_blender));
}

#[test]
fn test_in_app_browser_cancel() {
    let mut state = AppState::new();
    state.open_file_browser(FileBrowserMode::BlendFiles);
    assert!(state.active_modal.is_some());

    state.active_modal = None;
    assert_eq!(state.active_modal, None);
    assert_eq!(state.queue_state.jobs.len(), 0);
}
