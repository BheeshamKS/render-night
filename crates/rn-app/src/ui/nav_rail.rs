// Render Night - Left Icon + Label Navigation Rail
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::{ParentElement, Styled};

use super::theme;
use crate::state::{AppState, NavItem};

pub fn render_nav_rail(state: &AppState) -> blenderui::element::Div {
    let job_count = state.queue_state.jobs.len();

    div()
        .styled()
        .w(px(78.0))
        .h_full()
        .bg(theme::BG_PANEL)
        .border_r_1()
        .border_color(theme::BORDER)
        .flex()
        .flex_col()
        .items_center()
        .py(px(10.0))
        .gap(px(6.0))
        .child(render_nav_item(
            "📋",
            "Queue",
            Some(job_count),
            state.active_nav_item == NavItem::Queue,
        ))
        .child(render_nav_item(
            "📜",
            "History",
            None,
            state.active_nav_item == NavItem::History,
        ))
        .child(render_nav_item(
            "🔧",
            "Tools",
            None,
            state.active_nav_item == NavItem::Tools,
        ))
        .child(render_nav_item(
            "⚙",
            "Settings",
            None,
            state.active_nav_item == NavItem::Settings,
        ))
}

fn render_nav_item(
    icon: &'static str,
    label: &'static str,
    badge: Option<usize>,
    is_active: bool,
) -> blenderui::element::Div {
    let bg = if is_active {
        theme::BG_SELECTED
    } else {
        theme::BG_PANEL
    };
    let border = if is_active {
        theme::ACCENT_BLUE
    } else {
        theme::BG_PANEL
    };
    let text_col = if is_active {
        theme::TEXT_PRIMARY
    } else {
        theme::TEXT_MUTED
    };

    div()
        .w(px(66.0))
        .h(px(58.0))
        .rounded_md()
        .bg(bg)
        .border_1()
        .border_color(border)
        .flex()
        .flex_col()
        .items_center()
        .justify_center()
        .gap(px(2.0))
        .child(span().text_base().child(icon))
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(3.0))
                .child(
                    span()
                        .text_xs()
                        .font_medium()
                        .text_color(text_col)
                        .child(label),
                )
                .child(if let Some(count) = badge {
                    span()
                        .text_xs()
                        .px(px(3.0))
                        .rounded_sm()
                        .bg(theme::BG_PANEL_ALT)
                        .text_color(theme::TEXT_SECONDARY)
                        .child(format!("{}", count))
                } else {
                    span()
                }),
        )
}
