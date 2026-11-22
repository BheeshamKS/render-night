// Render Night - Slim Monitor Bar & Expandable Full Dock
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::{ParentElement, Styled};

use super::sparkline::render_sparkline;
use super::theme;
use crate::state::{AppState, DockTab};
use rn_core::queue::QueueStatus;

pub fn render_monitor_dock(state: &AppState) -> blenderui::element::Div {
    if !state.monitor_expanded {
        render_slim_bar(state)
    } else {
        render_full_dock(state)
    }
}

fn render_slim_bar(state: &AppState) -> blenderui::element::Div {
    let is_rendering = state.queue_status == QueueStatus::Running;
    let active_job_name = state
        .active_job_id
        .as_ref()
        .and_then(|id| state.queue_state.jobs.iter().find(|j| &j.id == id))
        .map(|j| j.name.clone())
        .unwrap_or_else(|| "Queue Idle".to_string());

    let sample_info = match state.current_sample {
        Some((cur, tot)) => format!("Sample {}/{}", cur, tot),
        None => "Samples: --".to_string(),
    };

    let frame_info = match state.current_frame {
        Some((cur, tot)) => format!("Frame {}/{}", cur, tot),
        None => "Frame: --".to_string(),
    };

    let eta_info = match state.eta_seconds {
        Some(s) => format!("ETA: {:02}m {:02}s", s / 60, s % 60),
        None => "ETA: --".to_string(),
    };

    div()
        .styled()
        .w_full()
        .h(px(34.0))
        .bg(theme::BG_HEADER)
        .border_t_1()
        .border_color(theme::BORDER)
        .flex()
        .flex_row()
        .items_center()
        .justify_between()
        .px(px(14.0))
        // Left: status indicator + active filename
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(8.0))
                .child(div().size(px(8.0)).rounded_full().bg(if is_rendering {
                    theme::ACCENT_GREEN
                } else if state.queue_status == QueueStatus::Paused {
                    theme::ACCENT_ORANGE
                } else {
                    theme::TEXT_DIM
                }))
                .child(
                    span()
                        .text_xs()
                        .font_medium()
                        .text_color(theme::TEXT_PRIMARY)
                        .child(active_job_name),
                ),
        )
        // Center: sample / frame / eta
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(14.0))
                .child(
                    span()
                        .text_xs()
                        .text_color(theme::TEXT_SECONDARY)
                        .child(frame_info),
                )
                .child(
                    span()
                        .text_xs()
                        .text_color(theme::TEXT_SECONDARY)
                        .child(sample_info),
                )
                .child(
                    span()
                        .text_xs()
                        .text_color(theme::TEXT_MUTED)
                        .child(eta_info),
                ),
        )
        // Right: expand toggle
        .child(Button().child("▲ Expand Monitor Dock"))
}

fn render_full_dock(state: &AppState) -> blenderui::element::Div {
    let active_job_name = state
        .active_job_id
        .as_ref()
        .and_then(|id| state.queue_state.jobs.iter().find(|j| &j.id == id))
        .map(|j| j.name.clone())
        .unwrap_or_else(|| "Queue Idle".to_string());

    div()
        .styled()
        .w_full()
        .h(px(240.0))
        .bg(theme::BG_PANEL)
        .border_t_1()
        .border_color(theme::BORDER)
        .flex()
        .flex_col()
        // Dock Header: Tabs + Info + Collapse
        .child(
            div()
                .w_full()
                .h(px(34.0))
                .bg(theme::BG_HEADER)
                .border_b_1()
                .border_color(theme::BORDER)
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .px(px(10.0))
                // Tabs
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(4.0))
                        .child(render_dock_tab(
                            "🖼 Live Preview",
                            state.active_dock_tab == DockTab::Preview,
                        ))
                        .child(render_dock_tab(
                            "📈 Frame Times",
                            state.active_dock_tab == DockTab::FrameTimes,
                        ))
                        .child(render_dock_tab(
                            "💻 Console & Log",
                            state.active_dock_tab == DockTab::Console,
                        )),
                )
                // Middle info
                .child(
                    span()
                        .text_xs()
                        .text_color(theme::TEXT_MUTED)
                        .child(format!("Active: {}", active_job_name)),
                )
                // Collapse button
                .child(Button().child("▼ Collapse Dock")),
        )
        // Dock Content Viewport
        .child(
            div()
                .flex_1()
                .w_full()
                .p(px(8.0))
                .overflow_y_scroll()
                .child(match state.active_dock_tab {
                    DockTab::Preview => render_preview_tab(state),
                    DockTab::FrameTimes => render_sparkline(&state.frame_times),
                    DockTab::Console => render_console_tab(state),
                }),
        )
}

fn render_dock_tab(title: &'static str, is_active: bool) -> blenderui::element::Div {
    let (bg, text_color, border) = if is_active {
        (theme::BG_SELECTED, theme::TEXT_PRIMARY, theme::ACCENT_BLUE)
    } else {
        (theme::BG_HEADER, theme::TEXT_MUTED, theme::BORDER)
    };

    div()
        .px(px(10.0))
        .py(px(4.0))
        .rounded_sm()
        .bg(bg)
        .border_1()
        .border_color(border)
        .child(
            span()
                .text_xs()
                .font_medium()
                .text_color(text_color)
                .child(title),
        )
}

fn render_preview_tab(state: &AppState) -> blenderui::element::Div {
    let frame_str = match state.current_frame {
        Some((cur, tot)) => format!("Frame {} of {}", cur, tot),
        None => "Frame 88 of 250".to_string(),
    };
    let sample_str = match state.current_sample {
        Some((cur, tot)) => format!("Sample {}/{}", cur, tot),
        None => "Sample 45/128".to_string(),
    };

    div()
        .styled()
        .h_full()
        .w_full()
        .flex()
        .flex_row()
        .gap(px(12.0))
        // Preview Frame Canvas / Placeholder
        .child(
            div()
                .flex_1()
                .h_full()
                .bg(theme::BG_INPUT)
                .border_1()
                .border_color(theme::BORDER)
                .rounded_sm()
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .p(px(10.0))
                .gap(px(6.0))
                .child(span().text_base().child("🖼"))
                .child(
                    span()
                        .text_xs()
                        .font_bold()
                        .text_color(theme::TEXT_PRIMARY)
                        .child("Live Render Buffer (1920x1080 · RGBA 32-bit float)"),
                )
                .child(
                    span()
                        .text_xs()
                        .text_color(theme::TEXT_MUTED)
                        .child(format!("{} · {}", frame_str, sample_str)),
                ),
        )
        // Meta Inspector Sidebar
        .child(
            div()
                .w(px(220.0))
                .h_full()
                .bg(theme::BG_PANEL)
                .border_1()
                .border_color(theme::BORDER)
                .rounded_sm()
                .p(px(8.0))
                .flex()
                .flex_col()
                .gap(px(4.0))
                .child(
                    span()
                        .text_xs()
                        .font_bold()
                        .text_color(theme::TEXT_PRIMARY)
                        .child("Render Metrics"),
                )
                .child(
                    span()
                        .text_xs()
                        .text_color(theme::TEXT_SECONDARY)
                        .child("Resolution: 1920 x 1080 (100%)"),
                )
                .child(
                    span()
                        .text_xs()
                        .text_color(theme::TEXT_SECONDARY)
                        .child("Engine: Cycles · OptiX"),
                )
                .child(
                    span()
                        .text_xs()
                        .text_color(theme::TEXT_SECONDARY)
                        .child("Memory: 142.5 MB (Peak 182.4 MB)"),
                )
                .child(
                    span()
                        .text_xs()
                        .text_color(theme::TEXT_MUTED)
                        .child("Tiles: 128 / 128 rendered"),
                ),
        )
}

fn render_console_tab(state: &AppState) -> blenderui::element::Div {
    div()
        .styled()
        .w_full()
        .h_full()
        .bg(theme::BG_INPUT)
        .border_1()
        .border_color(theme::BORDER)
        .rounded_sm()
        .p(px(6.0))
        .flex()
        .flex_col()
        .gap(px(2.0))
        .children(state.console_logs.iter().rev().take(15).rev().map(|log| {
            let color = if log.is_error {
                theme::ACCENT_RED
            } else {
                theme::TEXT_SECONDARY
            };

            div()
                .flex()
                .flex_row()
                .gap(px(6.0))
                .child(
                    span()
                        .text_xs()
                        .font_bold()
                        .text_color(if log.is_error {
                            theme::ACCENT_RED
                        } else {
                            theme::TEXT_DIM
                        })
                        .child(format!("[{}]", log.stream)),
                )
                .child(span().text_xs().text_color(color).child(log.line.clone()))
        }))
}
