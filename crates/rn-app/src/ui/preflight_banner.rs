// Render Night - Non-Modal Preflight Warnings Panel
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::{ParentElement, Styled};

use super::theme;
use crate::state::AppState;

pub fn render_preflight_banner(state: &AppState) -> blenderui::element::Div {
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
                        .child(Button().child("Render Anyway"))
                        .child(Button().child("Dismiss")),
                ),
        )
        // Collapsible issue items
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(4.0))
                .children(report.warnings.iter().take(3).map(|issue| {
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
                                .child(if let Some(fix) = &issue.quick_fix {
                                    Button().child(format!("Fix: {}", fix.label))
                                } else {
                                    div()
                                })
                                .child(Button().child("Ignore")),
                        )
                })),
        )
}
