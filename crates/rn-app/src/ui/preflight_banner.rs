// Render Night - Non-Modal Preflight Warnings Panel
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::window::Context;
use blenderui::{ParentElement, Styled};

use super::theme;
use super::AppView;
use crate::state::AppState;

pub fn render_preflight_banner(state: &AppState, cx: &Context<AppView>) -> blenderui::element::Div {
    let report = match &state.preflight_report {
        Some(r) if (r.has_warnings || r.has_errors) && state.show_preflight_banner => r,
        _ => return div(),
    };

    let warning_count = report.warnings.len();
    let error_count = report.errors.len();
    let countdown_text = match state.preflight_countdown {
        Some(sec) => format!(" · Auto-continuing in {}s...", sec),
        None => String::new(),
    };

    let summary_msg = if error_count > 0 {
        format!(
            "[!] {} blocking issue(s) and {} warning(s) detected.{}",
            error_count, warning_count, countdown_text
        )
    } else {
        format!(
            "! {} pre-flight warning(s) detected. Queue will proceed automatically.{}",
            warning_count, countdown_text
        )
    };

    div()
        .styled()
        .w_full()
        .bg(theme::WARNING_BG)
        .border_1()
        .border_color(theme::WARNING_BORDER)
        .rounded_md()
        .p(px(10.0))
        .mb(px(10.0))
        .flex()
        .flex_col()
        .gap(px(8.0))
        // Header line
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(8.0))
                        .child(
                            div()
                                .size(px(16.0))
                                .rounded_sm()
                                .bg(theme::WARNING_BORDER)
                                .flex()
                                .items_center()
                                .justify_center()
                                .child(
                                    span()
                                        .text_xs()
                                        .font_bold()
                                        .text_color(theme::WARNING_TEXT)
                                        .child("!"),
                                ),
                        )
                        .child(
                            span()
                                .text_sm()
                                .font_semibold()
                                .text_color(theme::WARNING_TEXT)
                                .child(summary_msg),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(6.0))
                        .child(
                            Button()
                                .id("btn-preflight-render-anyway")
                                .child("Render Anyway")
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.state.render_anyway();
                                    cx.notify();
                                })),
                        )
                        .child(
                            Button()
                                .id("btn-preflight-dismiss")
                                .child("Dismiss")
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.state.dismiss_preflight_banner();
                                    cx.notify();
                                })),
                        ),
                ),
        )
        // Collapsible issue items
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(4.0))
                .children(report.warnings.iter().take(3).map(|issue| {
                    let jid = issue.job_id.clone();
                    let iid = issue.id.clone();
                    let quick_fix = issue.quick_fix.clone();

                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .px(px(6.0))
                        .py(px(3.0))
                        .bg(theme::BG_PANEL)
                        .rounded_sm()
                        .child(
                            div()
                                .flex()
                                .flex_row()
                                .items_center()
                                .gap(px(6.0))
                                .child(
                                    span()
                                        .text_xs()
                                        .font_bold()
                                        .text_color(theme::WARNING_TEXT)
                                        .child(format!("[{}]", issue.code)),
                                )
                                .child(
                                    span()
                                        .text_xs()
                                        .text_color(theme::TEXT_PRIMARY)
                                        .child(format!("{}: {}", issue.job_name, issue.message)),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .flex_row()
                                .items_center()
                                .gap(px(4.0))
                                .child(if let Some(fix) = quick_fix {
                                    let jid_c = jid.clone();
                                    Button()
                                        .id(format!("btn-preflight-fix-{}", iid))
                                        .child(format!("Fix: {}", fix.label))
                                        .on_click(cx.listener(move |this, _, _, cx| {
                                            this.state.apply_preflight_quick_fix(
                                                &jid_c,
                                                &fix.action,
                                                fix.data.as_ref(),
                                            );
                                            cx.notify();
                                        }))
                                } else {
                                    Button().hidden()
                                })
                                .child({
                                    let jid_c = jid.clone();
                                    let iid_c = iid.clone();
                                    Button()
                                        .id(format!("btn-preflight-ignore-{}", iid_c))
                                        .child("Ignore")
                                        .on_click(cx.listener(move |this, _, _, cx| {
                                            this.state.ignore_preflight_issue(&jid_c, &iid_c);
                                            cx.notify();
                                        }))
                                }),
                        )
                })),
        )
}
