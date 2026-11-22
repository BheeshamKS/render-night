// Render Night - Multi-Selection Bulk Action Bar
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::{ParentElement, Styled};

use super::theme;
use crate::state::AppState;

pub fn render_bulk_bar(state: &AppState) -> blenderui::element::Div {
    let count = state.selected_job_ids.len();
    if count == 0 {
        return div();
    }

    div()
        .styled()
        .w_full()
        .bg(theme::BG_PANEL_ALT)
        .border_1()
        .border_color(theme::ACCENT_BLUE)
        .rounded_md()
        .px(px(12.0))
        .py(px(6.0))
        .mb(px(8.0))
        .flex()
        .flex_row()
        .items_center()
        .justify_between()
        .child(
            div().flex().flex_row().items_center().gap(px(8.0)).child(
                span()
                    .text_sm()
                    .font_semibold()
                    .text_color(theme::TEXT_PRIMARY)
                    .child(format!("✓ {} job(s) selected", count)),
            ),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(6.0))
                .child(Button().child("Set Cycles"))
                .child(Button().child("Set EEVEE"))
                .child(Button().child("Samples: 256"))
                .child(Button().child("Res: 100%"))
                .child(Button().child("Reset Overrides"))
                .child(Button().child("Remove Selected"))
                .child(Button().child("Deselect")),
        )
}
