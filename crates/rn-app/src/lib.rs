// Render Night - Desktop Application Library
// SPDX-License-Identifier: GPL-3.0-or-later

pub mod file_dialog;
pub mod panic_hook;
pub mod player;
pub mod screenshots;
pub mod state;
pub mod tracer;
pub mod ui;
pub mod watchdog;

pub use file_dialog::{
    default_dialog_service, FileDialogService, MockFileDialog, NativeFileDialog,
};
pub use panic_hook::install_panic_hook;
pub use player::SequencePlayer;
pub use screenshots::{capture_view, run_full_audit_suite};
pub use state::AppState;
pub use tracer::EventTracer;
pub use ui::AppView;
pub use watchdog::{is_stalled, last_ui_tick, record_ui_tick, start_watchdog, stop_watchdog};

/// Initialize system fallback fonts if available
pub fn init_fonts() {
    let dejavu = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
    if let Ok(bytes) = std::fs::read(dejavu) {
        unsafe {
            let fam = std::ffi::CString::new("dejavu").unwrap();
            blenderui_sys::BUI_text_add_font(
                fam.as_ptr(),
                0,
                bytes.as_ptr() as *const _,
                bytes.len() as i32,
            );
        }
    }

    let noto_arabic = "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf";
    if let Ok(bytes) = std::fs::read(noto_arabic) {
        unsafe {
            let fam = std::ffi::CString::new("arabic").unwrap();
            blenderui_sys::BUI_text_add_font(
                fam.as_ptr(),
                0,
                bytes.as_ptr() as *const _,
                bytes.len() as i32,
            );
        }
    }
}
