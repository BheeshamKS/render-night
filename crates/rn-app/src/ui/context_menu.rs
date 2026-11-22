// Render Night - Job Card Context Menu
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::{ParentElement, Styled};

use super::theme;
use crate::state::AppState;

pub fn render_context_menu(state: &AppState) -> blenderui::element::Div {
    let Some(ref menu) = state.context_menu else {
        return div();
    };

    div()
        .styled()
        .absolute()
        .top(px(menu.y))
        .left(px(menu.x))
        .w(px(190.0))
        .bg(theme::BG_PANEL)
        .rounded_md()
        .border_1()
        .border_color(theme::BORDER)
        .p(px(4.0))
        .flex()
        .flex_col()
        .gap(px(2.0))
        .child(render_menu_item("Edit Job Settings"))
        .child(render_menu_item("Duplicate Job"))
        .child(render_menu_item("Copy Overrides"))
        .child(render_menu_item("Paste Overrides"))
        .child(render_menu_item("Reveal in Folder"))
        .child(div().h(px(1.0)).w_full().bg(theme::BORDER).my(px(2.0)))
        .child(render_menu_item("Remove Job"))
}

fn render_menu_item(label: &'static str) -> blenderui::element::Div {
    div().w_full().child(Button().w_full().child(label))
}
