// Render Night - Frame-Time Sparkline Component
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::{ParentElement, Styled};

use super::theme;
use crate::state::FrameTimeSample;

pub fn render_sparkline(samples: &[FrameTimeSample]) -> blenderui::element::Div {
    if samples.is_empty() {
        return div()
            .styled()
            .h(px(80.0))
            .w_full()
            .flex()
            .items_center()
            .justify_center()
            .child(
                span()
                    .text_xs()
                    .text_color(theme::TEXT_MUTED)
                    .child("No frame render times recorded yet. Start rendering to generate frame-time sparkline."),
            );
    }

    let mut max_time = 0.1f64;
    let mut min_time = 9999.0f64;
    let mut total_time = 0.0f64;

    for s in samples {
        if s.duration_secs > max_time {
            max_time = s.duration_secs;
        }
        if s.duration_secs < min_time {
            min_time = s.duration_secs;
        }
        total_time += s.duration_secs;
    }
    let avg_time = total_time / samples.len() as f64;

    let chart_height = 54.0f32;

    div()
        .styled()
        .w_full()
        .flex()
        .flex_col()
        .gap(px(6.0))
        .p(px(8.0))
        .bg(theme::BG_PANEL)
        .border_1()
        .border_color(theme::BORDER)
        .rounded_md()
        // Stats header
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .child(
                    span()
                        .text_xs()
                        .font_semibold()
                        .text_color(theme::TEXT_PRIMARY)
                        .child(format!("Frame Times ({} samples)", samples.len())),
                )
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(10.0))
                        .child(
                            span()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child(format!("Avg: {:.2}s", avg_time)),
                        )
                        .child(
                            span()
                                .text_xs()
                                .text_color(theme::TEXT_MUTED)
                                .child(format!("Min: {:.2}s", min_time)),
                        )
                        .child(
                            span()
                                .text_xs()
                                .text_color(theme::TEXT_MUTED)
                                .child(format!("Max: {:.2}s", max_time)),
                        ),
                ),
        )
        // Bars graph
        .child(
            div()
                .h(px(chart_height))
                .w_full()
                .bg(theme::BG_INPUT)
                .rounded_sm()
                .p(px(4.0))
                .flex()
                .flex_row()
                .items_end()
                .gap(px(3.0))
                .children(samples.iter().map(|s| {
                    let bar_h =
                        ((s.duration_secs / max_time) as f32 * (chart_height - 8.0)).max(3.0);
                    let color = if s.is_failed {
                        theme::SPARKLINE_BAR_FAILED
                    } else if s.duration_secs > avg_time * 1.5 {
                        theme::SPARKLINE_BAR_SLOW
                    } else {
                        theme::SPARKLINE_BAR
                    };

                    div().w(px(12.0)).h(px(bar_h)).rounded_xs().bg(color)
                })),
        )
}
