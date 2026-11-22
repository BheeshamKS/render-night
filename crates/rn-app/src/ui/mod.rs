// Render Night - UI Root View & Subsystem Modules
// SPDX-License-Identifier: GPL-3.0-or-later

pub mod bulk_bar;
pub mod job_editor;
pub mod job_row;
pub mod monitor_dock;
pub mod nav_rail;
pub mod preflight_banner;
pub mod queue_view;
pub mod sparkline;
pub mod theme;
pub mod toolbar;

use blenderui::html::*;
use blenderui::window::{Context, Render, Window};
use blenderui::{ParentElement, Styled};

use crate::state::AppState;
use monitor_dock::render_monitor_dock;
use nav_rail::render_nav_rail;
use queue_view::render_queue_view;
use toolbar::render_toolbar;

/// Root desktop application view
pub struct AppView {
    pub state: AppState,
}

impl AppView {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }
}

impl Render for AppView {
    fn render(
        &mut self,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> impl blenderui::element::IntoElement {
        div()
            .styled()
            .w_full()
            .h_full()
            .bg(theme::BG_WINDOW)
            .flex()
            .flex_col()
            .overflow_hidden()
            // Top Toolbar
            .child(render_toolbar(&self.state))
            // Center Work Area (Nav Rail + Queue / Editor Workspace)
            .child(
                div()
                    .flex_1()
                    .w_full()
                    .flex()
                    .flex_row()
                    .overflow_hidden()
                    .child(render_nav_rail(&self.state))
                    .child(render_queue_view(&self.state)),
            )
            // Bottom Slim Monitor Bar or Full Dock
            .child(render_monitor_dock(&self.state))
    }
}
