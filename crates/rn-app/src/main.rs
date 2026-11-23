// Render Night - Desktop Application Executable
// SPDX-License-Identifier: GPL-3.0-or-later

use std::path::Path;

use blenderui::geometry::{px, Bounds, Point, Size};
use blenderui::window::{Application, TitlebarOptions, WindowBounds, WindowOptions};

use rn_app::screenshots::run_full_audit_suite;
use rn_app::state::AppState;
use rn_app::ui::AppView;

fn main() {
    rn_app::init_fonts();
    let args: Vec<String> = std::env::args().collect();

    // Check for quick smoke test mode (draws 1 frame, verifies pixels, exits 0)
    if args.iter().any(|a| a == "--smoke-test") {
        println!("============================================================");
        println!("RENDER NIGHT: RUNNING SMOKE TEST (1 FRAME DRAW)");
        println!("============================================================");
        let state = AppState::new();
        let app = Application::headless();
        let mut drawn_pixels = 0;
        let mut width = 0;
        let mut height = 0;
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
                titlebar: Some(TitlebarOptions {
                    title: Some("Render Night".into()),
                }),
                ..Default::default()
            };

            let win = cx
                .open_window(options, |_window, cx| cx.new(|_ctx| AppView::new(state)))
                .expect("Failed to open window for smoke test");

            let (w, h, pixels) = cx.draw(win.id);
            width = w;
            height = h;
            drawn_pixels = pixels.iter().filter(|&&p| (p & 0x00FFFFFF) != 0).count();
            cx.close_window(win.id);
        });
        println!(
            "Smoke test passed: rendered {}x{} viewport with {} non-zero pixels",
            width, height, drawn_pixels
        );
        assert!(width > 0 && height > 0, "Window dimension must be positive");
        assert!(drawn_pixels > 0, "Frame must have rendered non-zero pixels");
        std::process::exit(0);
    }

    // Check for headless audit / screenshot mode
    if args
        .iter()
        .any(|a| a == "--headless-audit" || a == "--screenshot")
    {
        println!("============================================================");
        println!("RENDER NIGHT: RUNNING HEADLESS UI SCREENSHOT AUDIT");
        println!("============================================================");

        let output_dir = Path::new("docs/screenshots");
        let results = run_full_audit_suite(output_dir);

        for (name, w, h, pixels) in &results {
            println!(
                "  ✓ Generated: {} ({}x{}) with {} rendered non-zero pixels",
                name, w, h, pixels
            );
        }

        println!("============================================================");
        println!(
            "SUCCESS: All {} UI screenshots captured in {}",
            results.len(),
            output_dir.display()
        );
        println!("============================================================");
        return;
    }

    // Interactive GUI mode
    let mut state = AppState::new();
    if args.iter().any(|a| a == "--demo") {
        state.load_acceptance_scenario();
    }

    let has_display = std::env::var("DISPLAY").is_ok()
        || std::env::var("WAYLAND_DISPLAY").is_ok()
        || cfg!(target_os = "windows")
        || cfg!(target_os = "macos");

    if !has_display {
        println!("Notice: No DISPLAY/Wayland session detected on host.");
        println!("Running headless screenshot suite instead (--headless-audit)...");
        let output_dir = Path::new("docs/screenshots");
        let results = run_full_audit_suite(output_dir);
        println!("Rendered {} audit screenshots successfully.", results.len());
        return;
    }

    blenderui::set_theme("dark");

    let app = Application::new();
    app.run(move |cx| {
        let bounds = Bounds {
            origin: Point {
                x: px(100.0),
                y: px(100.0),
            },
            size: Size {
                width: px(1280.0),
                height: px(800.0),
            },
        };
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(bounds)),
            titlebar: Some(TitlebarOptions {
                title: Some("Render Night".into()),
            }),
            ..Default::default()
        };

        let _ = cx.open_window(options, |_window, cx| cx.new(|_ctx| AppView::new(state)));
    });
}
