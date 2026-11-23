// Render Night - Minimal Header Toolbar
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::window::Context;
use blenderui::{ParentElement, Styled};

use super::theme;
use super::AppView;
use crate::state::{AppState, ModalState};
use rn_core::queue::QueueStatus;
use rn_core::schemas::queue_state::PostAction;

pub fn render_toolbar(state: &AppState, cx: &Context<AppView>) -> blenderui::element::Div {
    let warning_count = state
        .preflight_report
        .as_ref()
        .map(|r| r.warnings.len())
        .unwrap_or(0);

    let is_running = state.queue_status == QueueStatus::Running;
    let is_paused = state.queue_status == QueueStatus::Paused;
    let has_jobs = !state.queue_state.jobs.is_empty();

    let version_str = format!("v{}", env!("CARGO_PKG_VERSION"));

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
                                .child(version_str),
                        ),
                )
                .child(
                    div()
                        .h(px(18.0))
                        .w(px(1.0))
                        .bg(theme::BORDER_LIGHT)
                        .mx(px(4.0)),
                )
                .child(
                    Button()
                        .id("btn-add-blend")
                        .child("+ Add .blend")
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state.prompt_add_blend_files();
                            cx.notify();
                        })),
                )
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(4.0))
                        .child(if is_running {
                            Button()
                                .id("btn-pause-queue")
                                .child("|| Pause")
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.state.pause_queue();
                                    cx.notify();
                                }))
                        } else if is_paused {
                            Button()
                                .id("btn-resume-queue")
                                .child("▶ Resume")
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.state.start_queue();
                                    cx.notify();
                                }))
                        } else {
                            let mut btn = Button().id("btn-start-queue").child("▶ Start Queue");
                            if has_jobs {
                                btn = btn.on_click(cx.listener(|this, _, _, cx| {
                                    this.state.start_queue();
                                    cx.notify();
                                }));
                            }
                            btn
                        })
                        .child(if is_running || is_paused {
                            Button()
                                .id("btn-stop-queue")
                                .child("Stop")
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.state.stop_queue();
                                    cx.notify();
                                }))
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
                                .id("dropdown-when-finished")
                                .on_change(cx.listener(
                                    |this, e: &blenderui::events::ChangeEvent, _, cx| {
                                        let action = match e.value.as_str() {
                                            "sleep" => PostAction::Sleep,
                                            "hibernate" => PostAction::Hibernate,
                                            "shutdown" => PostAction::Shutdown,
                                            "restart" => PostAction::Restart,
                                            "close_app" => PostAction::CloseApp,
                                            _ => PostAction::None,
                                        };
                                        this.state.set_when_finished(action);
                                        cx.notify();
                                    },
                                ))
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
                .child(
                    div()
                        .id("btn-overflow-menu")
                        .styled()
                        .w(px(28.0))
                        .h(px(28.0))
                        .rounded_sm()
                        .bg(theme::BG_PANEL_ALT)
                        .border_1()
                        .border_color(theme::BORDER)
                        .flex()
                        .flex_col()
                        .items_center()
                        .justify_center()
                        .gap(px(3.0))
                        .cursor_pointer()
                        .child(div().size(px(3.0)).rounded_full().bg(theme::TEXT_PRIMARY))
                        .child(div().size(px(3.0)).rounded_full().bg(theme::TEXT_PRIMARY))
                        .child(div().size(px(3.0)).rounded_full().bg(theme::TEXT_PRIMARY))
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state.active_modal = Some(ModalState::ShortcutsCheatSheet);
                            cx.notify();
                        })),
                ),
        )
}
