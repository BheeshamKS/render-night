// Render Night - Runtime UI Interaction & Full Window Fill Automated Test
// SPDX-License-Identifier: GPL-3.0-or-later

use std::path::PathBuf;
use std::sync::Arc;

use blenderui::geometry::{px, Bounds, Point, Size};
use blenderui::window::{Application, WindowBounds, WindowOptions};

use rn_app::file_dialog::MockFileDialog;
use rn_app::init_fonts;
use rn_app::state::{AppState, DockTab, NavItem};
use rn_app::ui::AppView;
use rn_core::queue::QueueStatus;

#[test]
fn test_window_full_height_and_no_white_background() {
    init_fonts();

    let resolutions = [(1280, 800), (1920, 1080), (1100, 700)];

    for (width, height) in resolutions {
        let state = AppState::new();
        let app = Application::headless();

        let mut bottom_right_px = 0u32;
        let mut total_pixels = 0usize;
        let mut white_pixel_count = 0usize;

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

            let win = cx
                .open_window(options, |_window, cx| cx.new(|_ctx| AppView::new(state)))
                .expect("Failed to open window");

            let (w, h, pixels) = cx.draw(win.id);
            assert_eq!(w, width, "Drawn width should match window width");
            assert_eq!(h, height, "Drawn height should match window height");

            total_pixels = pixels.len();
            bottom_right_px = pixels[h * w - 1] & 0x00FFFFFF;

            for &p in &pixels {
                let rgb = p & 0x00FFFFFF;
                // Pure white 0xFFFFFF indicates unpainted default surface
                if rgb == 0xFFFFFF {
                    white_pixel_count += 1;
                }
            }

            cx.close_window(win.id);
        });

        assert_eq!(
            white_pixel_count, 0,
            "Window at {}x{} must have 0 unpainted white pixels",
            width, height
        );
        assert_ne!(
            bottom_right_px, 0xFFFFFF,
            "Bottom-right pixel at {}x{} must not be white unpainted area",
            width, height
        );
        // Theme background is #181818 (0x181818) or monitor dock background #1e1e1e (0x1e1e1e)
        assert!(
            bottom_right_px == 0x181818
                || bottom_right_px == 0x1E1E1E
                || bottom_right_px == 0x222222,
            "Bottom-right pixel {:#08x} should match dark theme surface at {}x{}",
            bottom_right_px,
            width,
            height
        );
        assert_eq!(total_pixels, width * height);
    }
}

#[test]
fn test_all_interactive_buttons_wire_and_dispatch() {
    init_fonts();

    let mock_dialog = Arc::new(MockFileDialog::new());
    mock_dialog.push_blend_files(vec![
        PathBuf::from("/mock/render_scene_1.blend"),
        PathBuf::from("/mock/render_scene_2.blend"),
    ]);
    mock_dialog.push_blend_files(vec![PathBuf::from("/mock/render_scene_3.blend")]);

    let state = AppState::new().with_file_dialog(mock_dialog.clone());

    let app = Application::headless();

    app.run(|cx| {
        let bounds = Bounds {
            origin: Point {
                x: px(0.0),
                y: px(0.0),
            },
            size: Size {
                width: px(1280.0),
                height: px(800.0),
            },
        };
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(bounds)),
            ..Default::default()
        };

        let view_handle = cx
            .open_window(options, |_window, cx| cx.new(|_ctx| AppView::new(state)))
            .expect("Failed to open window");

        let win_id = view_handle.id;
        cx.draw(win_id);

        // 1. Verify navigation rail buttons: History, Tools, Settings, Queue
        let nav_history = cx
            .element_bounds(win_id, "nav-history")
            .expect("nav-history must exist");
        cx.simulate_click(
            win_id,
            nav_history.origin.x + 5.0,
            nav_history.origin.y + 5.0,
        );
        cx.draw(win_id);
        view_handle.update(cx, |this, _window, _cx| {
            assert_eq!(this.state.active_nav_item, NavItem::History);
        });

        let nav_tools = cx
            .element_bounds(win_id, "nav-tools")
            .expect("nav-tools must exist");
        cx.simulate_click(win_id, nav_tools.origin.x + 5.0, nav_tools.origin.y + 5.0);
        cx.draw(win_id);
        view_handle.update(cx, |this, _window, _cx| {
            assert_eq!(this.state.active_nav_item, NavItem::Tools);
        });

        let nav_settings = cx
            .element_bounds(win_id, "nav-settings")
            .expect("nav-settings must exist");
        cx.simulate_click(
            win_id,
            nav_settings.origin.x + 5.0,
            nav_settings.origin.y + 5.0,
        );
        cx.draw(win_id);
        view_handle.update(cx, |this, _window, _cx| {
            assert_eq!(this.state.active_nav_item, NavItem::Settings);
        });

        let nav_queue = cx
            .element_bounds(win_id, "nav-queue")
            .expect("nav-queue must exist");
        cx.simulate_click(win_id, nav_queue.origin.x + 5.0, nav_queue.origin.y + 5.0);
        cx.draw(win_id);
        view_handle.update(cx, |this, _window, _cx| {
            assert_eq!(this.state.active_nav_item, NavItem::Queue);
        });

        // 2. Empty state Browse button
        let btn_browse = cx
            .element_bounds(win_id, "btn-browse-blend")
            .expect("btn-browse-blend must exist when queue empty");
        assert_eq!(mock_dialog.pick_blend_calls(), 0);
        cx.simulate_click(win_id, btn_browse.origin.x + 5.0, btn_browse.origin.y + 5.0);
        cx.draw(win_id);
        assert_eq!(mock_dialog.pick_blend_calls(), 1);

        // 3. Toolbar "+ Add .blend" button
        let btn_add = cx
            .element_bounds(win_id, "btn-add-blend")
            .expect("btn-add-blend must exist");
        cx.simulate_click(win_id, btn_add.origin.x + 5.0, btn_add.origin.y + 5.0);
        cx.draw(win_id);
        assert_eq!(mock_dialog.pick_blend_calls(), 2);

        // 4. Expand / Collapse Monitor Dock and Tabs
        let btn_toggle_dock = cx
            .element_bounds(win_id, "btn-toggle-dock")
            .expect("btn-toggle-dock must exist");
        view_handle.update(cx, |this, _window, _cx| {
            assert!(!this.state.monitor_expanded);
        });
        cx.simulate_click(
            win_id,
            btn_toggle_dock.origin.x + 5.0,
            btn_toggle_dock.origin.y + 5.0,
        );
        cx.draw(win_id);
        view_handle.update(cx, |this, _window, _cx| {
            assert!(this.state.monitor_expanded, "Dock should now be expanded");
        });

        // Test tabs in expanded dock
        let tab_frametimes = cx
            .element_bounds(win_id, "btn-dock-tab-frametimes")
            .expect("btn-dock-tab-frametimes must exist in expanded dock");
        cx.simulate_click(
            win_id,
            tab_frametimes.origin.x + 5.0,
            tab_frametimes.origin.y + 5.0,
        );
        cx.draw(win_id);
        view_handle.update(cx, |this, _window, _cx| {
            assert_eq!(this.state.active_dock_tab, DockTab::FrameTimes);
        });

        let tab_console = cx
            .element_bounds(win_id, "btn-dock-tab-console")
            .expect("btn-dock-tab-console must exist in expanded dock");
        cx.simulate_click(
            win_id,
            tab_console.origin.x + 5.0,
            tab_console.origin.y + 5.0,
        );
        cx.draw(win_id);
        view_handle.update(cx, |this, _window, _cx| {
            assert_eq!(this.state.active_dock_tab, DockTab::Console);
        });

        let tab_preview = cx
            .element_bounds(win_id, "btn-dock-tab-preview")
            .expect("btn-dock-tab-preview must exist in expanded dock");
        cx.simulate_click(
            win_id,
            tab_preview.origin.x + 5.0,
            tab_preview.origin.y + 5.0,
        );
        cx.draw(win_id);
        view_handle.update(cx, |this, _window, _cx| {
            assert_eq!(this.state.active_dock_tab, DockTab::Preview);
        });

        // Collapse dock
        let btn_collapse_dock = cx
            .element_bounds(win_id, "btn-toggle-dock")
            .expect("btn-toggle-dock collapse must exist");
        cx.simulate_click(
            win_id,
            btn_collapse_dock.origin.x + 5.0,
            btn_collapse_dock.origin.y + 5.0,
        );
        cx.draw(win_id);
        view_handle.update(cx, |this, _window, _cx| {
            assert!(!this.state.monitor_expanded, "Dock should now be collapsed");
        });

        // 5. Add a test job to verify Start/Pause/Resume/Stop controls
        view_handle.update(cx, |this, _window, _cx| {
            this.state.add_job(
                "test_shot.blend",
                "/path/test_shot.blend",
                1,
                10,
                "GPU",
                "CYCLES",
                None,
            );
        });
        cx.draw(win_id);

        let btn_start = cx
            .element_bounds(win_id, "btn-start-queue")
            .expect("btn-start-queue must exist");
        cx.simulate_click(win_id, btn_start.origin.x + 5.0, btn_start.origin.y + 5.0);
        cx.draw(win_id);
        view_handle.update(cx, |this, _window, _cx| {
            assert_eq!(this.state.queue_status, QueueStatus::Running);
        });

        let btn_pause = cx
            .element_bounds(win_id, "btn-pause-queue")
            .expect("btn-pause-queue must exist when running");
        cx.simulate_click(win_id, btn_pause.origin.x + 5.0, btn_pause.origin.y + 5.0);
        cx.draw(win_id);
        view_handle.update(cx, |this, _window, _cx| {
            assert_eq!(this.state.queue_status, QueueStatus::Paused);
        });

        let btn_resume = cx
            .element_bounds(win_id, "btn-resume-queue")
            .expect("btn-resume-queue must exist when paused");
        cx.simulate_click(win_id, btn_resume.origin.x + 5.0, btn_resume.origin.y + 5.0);
        cx.draw(win_id);
        view_handle.update(cx, |this, _window, _cx| {
            assert_eq!(this.state.queue_status, QueueStatus::Running);
        });

        let btn_stop = cx
            .element_bounds(win_id, "btn-stop-queue")
            .expect("btn-stop-queue must exist when running");
        cx.simulate_click(win_id, btn_stop.origin.x + 5.0, btn_stop.origin.y + 5.0);
        cx.draw(win_id);
        view_handle.update(cx, |this, _window, _cx| {
            assert_eq!(this.state.queue_status, QueueStatus::Idle);
        });

        cx.close_window(win_id);
    });
}
