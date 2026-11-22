// Render Night - Headless Screenshot Generator for UI Audits
// SPDX-License-Identifier: GPL-3.0-or-later

use std::path::Path;

use blenderui::geometry::{px, Bounds, Point, Size};
use blenderui::window::{Application, WindowBounds, WindowOptions};

use crate::init_fonts;
use crate::state::{AppState, DockTab, ModalState, NavItem};
use crate::ui::AppView;
use rn_core::overrides::compatibility::SkippedOverride;
use rn_core::schemas::queue_state::PostAction;

/// Capture a headless screenshot of AppView at a specific viewport resolution
pub fn capture_view(
    state: &AppState,
    width: u32,
    height: u32,
    output_path: &Path,
) -> (u32, u32, usize) {
    init_fonts();
    let mut rendered_w = 0;
    let mut rendered_h = 0;
    let mut non_zero_pixels = 0;
    let state_clone = state.clone();

    let app = Application::headless();
    app.run(|cx| {
        let bounds = Bounds {
            origin: Point {
                x: px(0.0),
                y: px(0.0),
            },
            size: Size {
                width: px(width as f32),
                height: px(height as f32),
            },
        };
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(bounds)),
            ..Default::default()
        };

        let handle = cx
            .open_window(options, |_window, cx| {
                cx.new(|_ctx| AppView::new(state_clone))
            })
            .expect("Failed to open headless window for screenshot");

        let (w, h, pixels) = cx.draw(handle.id);
        rendered_w = w as u32;
        rendered_h = h as u32;

        let mut rgba_bytes = Vec::with_capacity(w * h * 4);
        for &px_val in &pixels {
            let r = ((px_val >> 16) & 0xFF) as u8;
            let g = ((px_val >> 8) & 0xFF) as u8;
            let b = (px_val & 0xFF) as u8;
            let a = 255u8;
            if r > 0 || g > 0 || b > 0 {
                non_zero_pixels += 1;
            }
            rgba_bytes.extend_from_slice(&[r, g, b, a]);
        }

        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        image::save_buffer(
            output_path,
            &rgba_bytes,
            rendered_w,
            rendered_h,
            image::ExtendedColorType::Rgba8,
        )
        .expect("Failed to save headless screenshot PNG");
    });

    (rendered_w, rendered_h, non_zero_pixels)
}

/// Run full audit suite generating headless screenshots across all required resolutions
pub fn run_full_audit_suite(output_dir: &Path) -> Vec<(String, u32, u32, usize)> {
    std::fs::create_dir_all(output_dir).ok();
    let mut results = Vec::new();

    // 1. Acceptance Scenario at 1100x700 (Compact desktop, 3 jobs, 1 active rendering)
    let mut state_1100 = AppState::new();
    state_1100.load_acceptance_scenario();
    let path_1100 = output_dir.join("01_queue_acceptance_1100x700.png");
    let (w, h, p) = capture_view(&state_1100, 1100, 700, &path_1100);
    results.push(("01_queue_acceptance_1100x700".to_string(), w, h, p));

    // 2. Standard Laptop Viewport at 1280x800 with Monitor Dock Expanded (Sparkline + Live Preview)
    let mut state_1280 = AppState::new();
    state_1280.load_acceptance_scenario();
    state_1280.monitor_expanded = true;
    state_1280.active_dock_tab = DockTab::FrameTimes;
    let path_1280 = output_dir.join("02_monitor_dock_expanded_1280x800.png");
    let (w, h, p) = capture_view(&state_1280, 1280, 800, &path_1280);
    results.push(("02_monitor_dock_expanded_1280x800".to_string(), w, h, p));

    // 3. Full HD Workstation Viewport at 1920x1080 with Slide-Over Job Editor Open (RNA Metadata)
    let mut state_1920 = AppState::new();
    state_1920.load_acceptance_scenario();
    if let Some(j) = state_1920.queue_state.jobs.first() {
        state_1920.editing_job_id = Some(j.id.clone());
    }
    state_1920.monitor_expanded = true;
    state_1920.active_dock_tab = DockTab::Preview;
    let path_1920 = output_dir.join("03_job_editor_rna_1920x1080.png");
    let (w, h, p) = capture_view(&state_1920, 1920, 1080, &path_1920);
    results.push(("03_job_editor_rna_1920x1080".to_string(), w, h, p));

    // 4. Empty Queue Drop Zone at 1100x700
    let state_empty = AppState::new();
    let path_empty = output_dir.join("04_empty_queue_dropzone_1100x700.png");
    let (w, h, p) = capture_view(&state_empty, 1100, 700, &path_empty);
    results.push(("04_empty_queue_dropzone_1100x700".to_string(), w, h, p));

    // 5. Multi-Selection with Sticky Bulk Bar at 1280x800
    let mut state_bulk = AppState::new();
    state_bulk.load_acceptance_scenario();
    state_bulk.select_all();
    let path_bulk = output_dir.join("05_multi_select_bulk_bar_1280x800.png");
    let (w, h, p) = capture_view(&state_bulk, 1280, 800, &path_bulk);
    results.push(("05_multi_select_bulk_bar_1280x800".to_string(), w, h, p));

    // 6. History View at 1280x800 (Search, status filters, re-add, reveal)
    let mut state_history = AppState::new();
    state_history.load_acceptance_scenario();
    state_history.active_nav_item = NavItem::History;
    let path_history = output_dir.join("06_history_view_1280x800.png");
    let (w, h, p) = capture_view(&state_history, 1280, 800, &path_history);
    results.push(("06_history_view_1280x800".to_string(), w, h, p));

    // 7. Settings View at 1280x800 (Blender, Rendering, Performance, Sound, Power, Preflight)
    let mut state_settings = AppState::new();
    state_settings.load_acceptance_scenario();
    state_settings.active_nav_item = NavItem::Settings;
    let path_settings = output_dir.join("07_settings_view_1280x800.png");
    let (w, h, p) = capture_view(&state_settings, 1280, 800, &path_settings);
    results.push(("07_settings_view_1280x800".to_string(), w, h, p));

    // 8. Tools Tab Shell at 1100x700 (Sequence Player, Presets Manager, Format Converter)
    let mut state_tools = AppState::new();
    state_tools.load_acceptance_scenario();
    state_tools.active_nav_item = NavItem::Tools;
    let path_tools = output_dir.join("08_tools_tab_shell_1100x700.png");
    let (w, h, p) = capture_view(&state_tools, 1100, 700, &path_tools);
    results.push(("08_tools_tab_shell_1100x700".to_string(), w, h, p));

    // 9. Resume-after-crash Modal Dialog at 1280x800
    let mut state_resume = AppState::new();
    state_resume.load_acceptance_scenario();
    state_resume.active_modal = Some(ModalState::ResumeAfterCrash {
        job_id: "job_1_1".to_string(),
        job_name: "archviz_living_room_cycles.blend".to_string(),
        last_frame: 114,
    });
    let path_resume = output_dir.join("09_resume_after_crash_modal_1280x800.png");
    let (w, h, p) = capture_view(&state_resume, 1280, 800, &path_resume);
    results.push(("09_resume_after_crash_modal_1280x800".to_string(), w, h, p));

    // 10. 60-Second Shutdown Countdown Modal at 1280x800
    let mut state_shutdown = AppState::new();
    state_shutdown.load_acceptance_scenario();
    state_shutdown.active_modal = Some(ModalState::ShutdownCountdown {
        seconds_remaining: 54,
        action: PostAction::Shutdown,
    });
    let path_shutdown = output_dir.join("10_shutdown_countdown_modal_1280x800.png");
    let (w, h, p) = capture_view(&state_shutdown, 1280, 800, &path_shutdown);
    results.push(("10_shutdown_countdown_modal_1280x800".to_string(), w, h, p));

    // 11. Confirm-Quit Modal Dialog at 1100x700
    let mut state_quit = AppState::new();
    state_quit.load_acceptance_scenario();
    state_quit.active_modal = Some(ModalState::ConfirmQuit);
    let path_quit = output_dir.join("11_confirm_quit_modal_1100x700.png");
    let (w, h, p) = capture_view(&state_quit, 1100, 700, &path_quit);
    results.push(("11_confirm_quit_modal_1100x700".to_string(), w, h, p));

    // 12. Keyboard Shortcut Cheat Sheet Modal at 1280x800
    let mut state_shortcuts = AppState::new();
    state_shortcuts.load_acceptance_scenario();
    state_shortcuts.active_modal = Some(ModalState::ShortcutsCheatSheet);
    let path_shortcuts = output_dir.join("12_shortcuts_cheat_sheet_modal_1280x800.png");
    let (w, h, p) = capture_view(&state_shortcuts, 1280, 800, &path_shortcuts);
    results.push((
        "12_shortcuts_cheat_sheet_modal_1280x800".to_string(),
        w,
        h,
        p,
    ));

    // 13. Skip Report Modal at 1280x800
    let mut state_skip = AppState::new();
    state_skip.load_acceptance_scenario();
    state_skip.active_modal = Some(ModalState::SkipReport {
        skipped: vec![
            SkippedOverride {
                rna_path: "scene.cycles.samples".to_string(),
                reason: "Property \"scene.cycles.samples\" is not supported by engine BLENDER_EEVEE_NEXT".to_string(),
            },
            SkippedOverride {
                rna_path: "scene.cycles.use_denoising".to_string(),
                reason: "Property \"scene.cycles.use_denoising\" is not supported by engine BLENDER_EEVEE_NEXT".to_string(),
            },
        ],
    });
    let path_skip = output_dir.join("13_skip_report_modal_1280x800.png");
    let (w, h, p) = capture_view(&state_skip, 1280, 800, &path_skip);
    results.push(("13_skip_report_modal_1280x800".to_string(), w, h, p));

    // 14. Floating Toast Notification with Undo at 1280x800
    let mut state_toast = AppState::new();
    state_toast.load_acceptance_scenario();
    state_toast.remove_job_with_undo("job_1_1");
    let path_toast = output_dir.join("14_toasts_with_undo_overlay_1280x800.png");
    let (w, h, p) = capture_view(&state_toast, 1280, 800, &path_toast);
    results.push(("14_toasts_with_undo_overlay_1280x800".to_string(), w, h, p));

    results
}
