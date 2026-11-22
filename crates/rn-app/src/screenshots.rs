// Render Night - Headless Screenshot Generator for UI Audits
// SPDX-License-Identifier: GPL-3.0-or-later

use std::path::Path;

use blenderui::geometry::{px, Bounds, Point, Size};
use blenderui::window::{Application, WindowBounds, WindowOptions};

use crate::state::{AppState, DockTab};
use crate::ui::AppView;

/// Capture a headless screenshot of AppView at a specific viewport resolution
pub fn capture_view(
    state: &AppState,
    width: u32,
    height: u32,
    output_path: &Path,
) -> (u32, u32, usize) {
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

    results
}
