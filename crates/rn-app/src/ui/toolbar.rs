// Render Night - Minimal Header Toolbar
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::{ParentElement, Styled};

use super::theme;
use crate::state::AppState;
use rn_core::queue::QueueStatus;
use rn_core::schemas::queue_state::PostAction;

pub fn render_toolbar(state: &AppState) -> blenderui::element::Div {
    let warning_count = state
        .preflight_report
        .as_ref()
        .map(|r| r.warnings.len())
        .unwrap_or(0);

    let is_running = state.queue_status == QueueStatus::Running;
    let is_paused = state.queue_status == QueueStatus::Paused;

    div()
        .styled()
        .w_full()
        .h(px(44.0))
        .bg(theme::BG_HEADER)
        .border_b_1()
        .border_color(theme::BORDER)
        .flex()
        .flex_row()
        .items_center()
        .justify_between()
        .px(px(14.0))
        .py(px(6.0))
        // Left section: App Brand + Primary Controls
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(10.0))
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(6.0))
                        .child(
                            span()
                                .text_sm()
                                .font_bold()
                                .text_color(theme::TEXT_PRIMARY)
                                .child("RENDER NIGHT"),
                        )
                        .child(
                            span()
                                .text_xs()
                                .px(px(4.0))
                                .py(px(1.0))
                                .rounded_sm()
                                .bg(theme::BG_PANEL_ALT)
                                .text_color(theme::TEXT_MUTED)
                                .child("v0.1.0"),
                        ),
                )
                .child(
                    div()
                        .h(px(18.0))
                        .w(px(1.0))
                        .bg(theme::BORDER_LIGHT)
                        .mx(px(4.0)),
                )
                .child(Button().child("+ Add .blend"))
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(4.0))
                        .child(if is_running {
                            Button().child("|| Pause")
                        } else if is_paused {
                            Button().child("▶ Resume")
                        } else {
                            Button().child("▶ Start Queue")
                        })
                        .child(if is_running || is_paused {
                            Button().child("Stop")
                        } else {
                            div()
                        }),
                ),
        )
        // Right section: When finished + Warning indicators + Overflow
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(12.0))
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(6.0))
                        .child(
                            span()
                                .text_xs()
                                .text_color(theme::TEXT_MUTED)
                                .child("When finished:"),
                        )
                        .child(
                            Dropdown()
                                .child(
                                    option()
                                        .value("none")
                                        .selected(state.when_finished == PostAction::None)
                                        .child("Do nothing"),
                                )
                                .child(
                                    option()
                                        .value("sleep")
                                        .selected(state.when_finished == PostAction::Sleep)
                                        .child("Sleep"),
                                )
                                .child(
                                    option()
                                        .value("hibernate")
                                        .selected(state.when_finished == PostAction::Hibernate)
                                        .child("Hibernate"),
                                )
                                .child(
                                    option()
                                        .value("shutdown")
                                        .selected(state.when_finished == PostAction::Shutdown)
                                        .child("Shutdown"),
                                )
                                .child(
                                    option()
                                        .value("restart")
                                        .selected(state.when_finished == PostAction::Restart)
                                        .child("Restart"),
                                )
                                .child(
                                    option()
                                        .value("close_app")
                                        .selected(state.when_finished == PostAction::CloseApp)
                                        .child("Close App"),
                                ),
                        ),
                )
                .child(if warning_count > 0 {
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(4.0))
                        .px(px(6.0))
                        .py(px(2.0))
                        .rounded_sm()
                        .bg(theme::WARNING_BG)
                        .border_1()
                        .border_color(theme::WARNING_BORDER)
                        .child(
                            span()
                                .text_xs()
                                .font_medium()
                                .text_color(theme::WARNING_TEXT)
                                .child(format!("! {} warnings", warning_count)),
                        )
                } else {
                    div()
                })
                .child(Button().child("...")),
        )
}
