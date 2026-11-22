// Render Night - Left Icon + Label Navigation Rail
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::{ParentElement, Styled};

use super::theme;
use crate::state::{AppState, NavItem};

#[derive(Debug, Clone, Copy)]
enum NavIcon {
    Queue,
    History,
    Tools,
    Settings,
}

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
            NavIcon::Queue,
            "Queue",
            Some(job_count),
            state.active_nav_item == NavItem::Queue,
        ))
        .child(render_nav_item(
            NavIcon::History,
            "History",
            None,
            state.active_nav_item == NavItem::History,
        ))
        .child(render_nav_item(
            NavIcon::Tools,
            "Tools",
            None,
            state.active_nav_item == NavItem::Tools,
        ))
        .child(render_nav_item(
            NavIcon::Settings,
            "Settings",
            None,
            state.active_nav_item == NavItem::Settings,
        ))
}

fn render_nav_item(
    icon: NavIcon,
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
    let icon_col = if is_active {
        theme::ACCENT_BLUE
    } else {
        theme::TEXT_SECONDARY
    };

    let icon_element = match icon {
        NavIcon::Queue => div()
            .w(px(18.0))
            .h(px(14.0))
            .flex()
            .flex_col()
            .justify_between()
            .child(div().w_full().h(px(2.5)).bg(icon_col).rounded_sm())
            .child(div().w_full().h(px(2.5)).bg(icon_col).rounded_sm())
            .child(div().w(px(12.0)).h(px(2.5)).bg(icon_col).rounded_sm()),
        NavIcon::History => div()
            .size(px(15.0))
            .rounded_full()
            .border_2()
            .border_color(icon_col)
            .flex()
            .items_center()
            .justify_center()
            .child(div().w(px(2.0)).h(px(5.0)).bg(icon_col)),
        NavIcon::Tools => div()
            .size(px(15.0))
            .flex()
            .flex_col()
            .justify_center()
            .gap(px(3.0))
            .child(div().w_full().h(px(2.5)).bg(icon_col).rounded_sm())
            .child(
                div()
                    .flex()
                    .flex_row()
                    .gap(px(3.0))
                    .child(div().size(px(4.0)).rounded_full().bg(icon_col))
                    .child(div().size(px(4.0)).rounded_full().bg(icon_col)),
            ),
        NavIcon::Settings => div()
            .size(px(15.0))
            .flex()
            .flex_col()
            .justify_between()
            .py(px(1.0))
            .child(div().w_full().h(px(2.0)).bg(icon_col).rounded_sm())
            .child(div().w_full().h(px(2.0)).bg(icon_col).rounded_sm())
            .child(div().w_full().h(px(2.0)).bg(icon_col).rounded_sm()),
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
        .gap(px(4.0))
        .child(icon_element)
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
