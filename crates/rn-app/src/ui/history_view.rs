// Render Night - Render History View
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::list::uniform_list;
use blenderui::{ParentElement, Styled};

use super::theme;
use crate::state::AppState;
use rn_core::schemas::history::{HistoryEntry, HistoryResult};

pub fn render_history_view(state: &AppState) -> blenderui::element::Div {
    let search_lower = state.history_search.to_lowercase();
    let filtered_entries: Vec<HistoryEntry> = state
        .history_entries
        .iter()
        .filter(|e| {
            if let Some(ref filter) = state.history_filter {
                if &e.result != filter {
                    return false;
                }
            }
            if !search_lower.is_empty() {
                let match_file = e.file_name.to_lowercase().contains(&search_lower);
                let match_scene = e.scene.to_lowercase().contains(&search_lower);
                let match_proj = e
                    .project
                    .as_deref()
                    .map(|p| p.to_lowercase().contains(&search_lower))
                    .unwrap_or(false);
                if !match_file && !match_scene && !match_proj {
                    return false;
                }
            }
            true
        })
        .cloned()
        .collect();

    let entry_count = filtered_entries.len();
    let total_count = state.history_entries.len();

    div()
        .styled()
        .flex_1()
        .h_full()
        .p(px(16.0))
        .flex()
        .flex_col()
        .gap(px(12.0))
        .overflow_hidden()
        // Top Toolbar
        .child(
            div()
                .w_full()
                .h(px(42.0))
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .gap(px(12.0))
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(12.0))
                        .flex_1()
                        .child(
                            TextField()
                                .placeholder("Search history by file, project, or scene...")
                                .value(state.history_search.clone()),
                        )
                        .child(
                            Dropdown()
                                .child(
                                    option()
                                        .value("all")
                                        .selected(state.history_filter.is_none())
                                        .child("All Statuses"),
                                )
                                .child(
                                    option()
                                        .value("completed")
                                        .selected(
                                            state.history_filter == Some(HistoryResult::Completed),
                                        )
                                        .child("Completed"),
                                )
                                .child(
                                    option()
                                        .value("warnings")
                                        .selected(
                                            state.history_filter
                                                == Some(HistoryResult::CompletedWithWarnings),
                                        )
                                        .child("Completed with Warnings"),
                                )
                                .child(
                                    option()
                                        .value("failed")
                                        .selected(
                                            state.history_filter == Some(HistoryResult::Failed),
                                        )
                                        .child("Failed"),
                                )
                                .child(
                                    option()
                                        .value("canceled")
                                        .selected(
                                            state.history_filter == Some(HistoryResult::Canceled),
                                        )
                                        .child("Canceled"),
                                ),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(8.0))
                        .child(
                            div()
                                .px(px(8.0))
                                .py(px(4.0))
                                .bg(theme::BG_PANEL)
                                .rounded_sm()
                                .border_1()
                                .border_color(theme::BORDER)
                                .text_xs()
                                .text_color(theme::TEXT_MUTED)
                                .child(format!("{}/{} runs", entry_count, total_count)),
                        )
                        .child(Button().child("Clear History")),
                ),
        )
        // Main List or Empty State
        .child(if filtered_entries.is_empty() {
            render_empty_history(total_count == 0)
        } else {
            div().w_full().flex_1().overflow_y_scroll().child(
                uniform_list("history_list", entry_count, move |range, _window, _cx| {
                    range
                        .filter_map(|i| filtered_entries.get(i))
                        .map(render_history_row)
                        .collect::<Vec<_>>()
                })
                .item_height(px(72.0))
                .w_full()
                .flex_1(),
            )
        })
}

fn render_empty_history(is_completely_empty: bool) -> blenderui::element::Div {
    let msg = if is_completely_empty {
        "No render history recorded yet. Completed render jobs will appear here automatically."
    } else {
        "No history entries match your current search and filter criteria."
    };

    div()
        .styled()
        .w_full()
        .h(px(260.0))
        .bg(theme::BG_PANEL)
        .border_2()
        .border_dashed()
        .border_color(theme::BORDER_LIGHT)
        .rounded_lg()
        .flex()
        .flex_col()
        .items_center()
        .justify_center()
        .p(px(24.0))
        .gap(px(10.0))
        .child(
            div()
                .size(px(36.0))
                .rounded_full()
                .border_2()
                .border_color(theme::TEXT_MUTED)
                .flex()
                .items_center()
                .justify_center()
                .child(div().w(px(2.0)).h(px(10.0)).bg(theme::TEXT_MUTED)),
        )
        .child(
            div()
                .text_sm()
                .text_color(theme::TEXT_SECONDARY)
                .font_medium()
                .child("Render History"),
        )
        .child(
            div()
                .text_xs()
                .text_color(theme::TEXT_MUTED)
                .max_w(px(380.0))
                .text_center()
                .child(msg),
        )
}

fn render_history_row(entry: &HistoryEntry) -> blenderui::element::Div {
    let (status_bg, status_fg, status_label) = match entry.result {
        HistoryResult::Completed => (theme::STATUS_DONE_BG, theme::STATUS_DONE_TEXT, "COMPLETED"),
        HistoryResult::CompletedWithWarnings => {
            (theme::WARNING_BG, theme::WARNING_TEXT, "WARNINGS")
        }
        HistoryResult::Failed | HistoryResult::CompletedWithErrors => {
            (theme::STATUS_FAILED_BG, theme::STATUS_FAILED_TEXT, "FAILED")
        }
        HistoryResult::Canceled => (
            theme::STATUS_PAUSED_BG,
            theme::STATUS_PAUSED_TEXT,
            "CANCELED",
        ),
    };

    let dur_mins = (entry.total_time_seconds / 60.0).floor() as u64;
    let dur_secs = (entry.total_time_seconds % 60.0).floor() as u64;
    let dur_formatted = format!("{:02}m {:02}s", dur_mins, dur_secs);

    div()
        .styled()
        .w_full()
        .h(px(64.0))
        .mb(px(8.0))
        .bg(theme::BG_PANEL)
        .rounded_md()
        .border_1()
        .border_color(theme::BORDER)
        .px(px(14.0))
        .py(px(8.0))
        .flex()
        .flex_row()
        .items_center()
        .justify_between()
        .child(
            div()
                .flex()
                .flex_col()
                .justify_center()
                .gap(px(4.0))
                .flex_1()
                // Top line: Status chip + File name + Scene
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(8.0))
                        .child(
                            div()
                                .px(px(6.0))
                                .py(px(2.0))
                                .rounded_xs()
                                .bg(status_bg)
                                .text_color(status_fg)
                                .text_xs()
                                .font_bold()
                                .child(status_label),
                        )
                        .child(
                            div()
                                .text_sm()
                                .font_bold()
                                .text_color(theme::TEXT_PRIMARY)
                                .child(entry.file_name.clone()),
                        )
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_MUTED)
                                .child(format!("Scene: {}", entry.scene)),
                        ),
                )
                // Bottom line: Metadata
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(12.0))
                        .text_xs()
                        .text_color(theme::TEXT_SECONDARY)
                        .child(format!("{} frames in {}", entry.frame_count, dur_formatted))
                        .child(format!("{:.2} s/f", entry.average_frame_time_seconds))
                        .child(format!("{} · {}", entry.engine, entry.device))
                        .child(
                            div()
                                .text_color(theme::TEXT_MUTED)
                                .child(format!("Output: {}", entry.output_path)),
                        ),
                ),
        )
        // Right side: Action buttons
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(8.0))
                .child(Button().child("+ Re-add to Queue"))
                .child(Button().child("Reveal")),
        )
}
