// Render Night - Desktop Application Executable
// SPDX-License-Identifier: GPL-3.0-or-later

use std::path::Path;

use blenderui::geometry::{px, Bounds, Point, Size};
use blenderui::window::{Application, WindowBounds, WindowOptions};

use rn_app::screenshots::run_full_audit_suite;
use rn_app::state::AppState;
use rn_app::ui::AppView;

fn main() {
    let args: Vec<String> = std::env::args().collect();

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
            ..Default::default()
        };

        let _ = cx.open_window(options, |_window, cx| cx.new(|_ctx| AppView::new(state)));
    });
}
