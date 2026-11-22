// Render Night - UI Root View & Subsystem Modules
// SPDX-License-Identifier: GPL-3.0-or-later

pub mod bulk_bar;
pub mod context_menu;
pub mod history_view;
pub mod job_editor;
pub mod job_row;
pub mod modals;
pub mod monitor_dock;
pub mod nav_rail;
pub mod preflight_banner;
pub mod queue_view;
pub mod sequence_player;
pub mod settings_view;
pub mod sparkline;
pub mod theme;
pub mod toasts;
pub mod toolbar;
pub mod tools_view;

use blenderui::html::*;
use blenderui::window::{Context, Render, Window};
use blenderui::{ParentElement, Styled};

use crate::state::{AppState, NavItem};
use context_menu::render_context_menu;
use history_view::render_history_view;
use modals::render_modal_overlay;
use monitor_dock::render_monitor_dock;
use nav_rail::render_nav_rail;
use queue_view::render_queue_view;
use sequence_player::render_sequence_player_view;
use settings_view::render_settings_view;
use toasts::render_toasts;
use toolbar::render_toolbar;
use tools_view::render_tools_view;

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
            .relative()
            // Top Toolbar
            .child(render_toolbar(&self.state))
            // Center Work Area (Nav Rail + Queue / History / Tools / Settings OR Sequence Player)
            .child(if self.state.is_sequence_player_open {
                if let Some(ref player) = self.state.sequence_player {
                    div()
                        .flex_1()
                        .w_full()
                        .h_full()
                        .child(render_sequence_player_view(player))
                } else {
                    div()
                }
            } else {
                div()
                    .flex_1()
                    .w_full()
                    .flex()
                    .flex_row()
                    .overflow_hidden()
                    .child(render_nav_rail(&self.state))
                    .child(match self.state.active_nav_item {
                        NavItem::Queue => render_queue_view(&self.state),
                        NavItem::History => render_history_view(&self.state),
                        NavItem::Tools => render_tools_view(&self.state),
                        NavItem::Settings => render_settings_view(&self.state),
                    })
            })
            // Bottom Slim Monitor Bar or Full Dock
            .child(render_monitor_dock(&self.state))
            // Floating Context Menu (if any)
            .child(render_context_menu(&self.state))
            // Floating Toasts with Undo (if any)
            .child(render_toasts(&self.state))
            // Top-Level Modal Dialogs (if any)
            .child(render_modal_overlay(&self.state))
    }
}
