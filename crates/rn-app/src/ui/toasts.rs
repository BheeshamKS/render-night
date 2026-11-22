// Render Night - Floating Toast Notifications with Undo
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::{ParentElement, Styled};

use super::theme;
use crate::state::AppState;

pub fn render_toasts(state: &AppState) -> blenderui::element::Div {
    if state.toasts.is_empty() {
        return div();
    }

    div()
        .styled()
        .absolute()
        .bottom(px(45.0))
        .right(px(20.0))
        .flex()
        .flex_col()
        .gap(px(8.0))
        .children(state.toasts.iter().map(|toast| {
            let has_undo = toast.undo_jobs.is_some();

            div()
                .p(px(12.0))
                .min_w(px(280.0))
                .max_w(px(400.0))
                .bg(theme::BG_PANEL)
                .rounded_md()
                .border_1()
                .border_color(theme::ACCENT_BLUE)
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .gap(px(12.0))
                .child(
                    div()
                        .text_xs()
                        .text_color(theme::TEXT_PRIMARY)
                        .child(toast.message.clone()),
                )
                .child(if has_undo {
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(6.0))
                        .child(Button().child("Undo"))
                } else {
                    div()
                })
        }))
}
