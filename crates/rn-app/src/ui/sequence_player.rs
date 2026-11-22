// Render Night - Sequence Player UI View & Performance HUD
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::{ParentElement, Styled};

use super::theme;
use crate::player::{PerformanceHudStats, SequencePlayer};

pub fn render_sequence_player_view(player: &SequencePlayer) -> blenderui::element::Div {
    let stats = player.get_hud_stats();
    let current_f = player.clock.current_frame;
    let start_f = player.clock.start_frame;
    let end_f = player.clock.end_frame;
    let total_f = (end_f - start_f + 1).max(1);
    let progress_pct = ((current_f - start_f) as f32 / total_f as f32) * 100.0;

    div()
        .styled()
        .flex_1()
        .h_full()
        .bg(theme::BG_WINDOW)
        .flex()
        .flex_col()
        .overflow_hidden()
        // Top Transport Header
        .child(
            div()
                .w_full()
                .h(px(46.0))
                .bg(theme::BG_HEADER)
                .border_b_1()
                .border_color(theme::BORDER)
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .px(px(14.0))
                // Left: Sequence title & Frame counter
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(10.0))
                        .child(
                            div()
                                .text_xs()
                                .font_bold()
                                .text_color(theme::TEXT_PRIMARY)
                                .child("SEQUENCE PLAYER"),
                        )
                        .child(
                            div()
                                .px(px(6.0))
                                .py(px(2.0))
                                .bg(theme::BG_PANEL)
                                .rounded_xs()
                                .border_1()
                                .border_color(theme::BORDER)
                                .text_xs()
                                .font_bold()
                                .text_color(theme::ACCENT_BLUE_LIGHT)
                                .child(format!("Fra: {} / {} ({})", current_f, end_f, total_f)),
                        ),
                )
                // Center: Transport Buttons
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(6.0))
                        .child(Button().child("|◀"))
                        .child(Button().child(if player.clock.is_playing {
                            "|| Pause"
                        } else {
                            "▶ Play"
                        }))
                        .child(Button().child("▶|"))
                        .child(
                            div()
                                .h(px(16.0))
                                .w(px(1.0))
                                .bg(theme::BORDER_LIGHT)
                                .mx(px(4.0)),
                        )
                        .child(
                            div()
                                .px(px(6.0))
                                .py(px(2.0))
                                .rounded_xs()
                                .bg(theme::BG_AREA)
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child(format!("Shuttle: {}x", player.clock.shuttle_speed)),
                        ),
                )
                // Right: View mode and Close
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(8.0))
                        .child(Button().child(if player.zoom_level == 0.0 {
                            "Scale: Fit (F)"
                        } else {
                            "Scale: 100% (1)"
                        }))
                        .child(Button().child(if player.show_hud {
                            "HUD: ON (S)"
                        } else {
                            "HUD: OFF (S)"
                        }))
                        .child(Button().child("Back to Queue")),
                ),
        )
        // Center: Main Image Viewport with Checkerboard & HUD
        .child(
            div()
                .flex_1()
                .w_full()
                .bg(theme::BG_WINDOW)
                .relative()
                .overflow_hidden()
                .flex()
                .items_center()
                .justify_center()
                // Checkerboard pattern representation
                .child(
                    div()
                        .w(px(800.0))
                        .h(px(450.0))
                        .bg(theme::BG_AREA)
                        .border_1()
                        .border_color(theme::BORDER)
                        .rounded_sm()
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(if let Some(ref frame) = player.current_frame_data {
                            div()
                                .text_sm()
                                .font_bold()
                                .text_color(theme::TEXT_PRIMARY)
                                .child(format!(
                                    "Decoded Frame {} ({}×{} RGBA)",
                                    frame.frame, frame.width, frame.height
                                ))
                        } else {
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_MUTED)
                                .child("Waiting for decoded frame raster...")
                        }),
                )
                // Performance HUD overlay (Top-Left inside viewport)
                .child(if player.show_hud {
                    render_performance_hud(&stats)
                } else {
                    div()
                }),
        )
        // Bottom: Scrub Timeline & Cache Bar
        .child(
            div()
                .w_full()
                .h(px(48.0))
                .bg(theme::BG_PANEL)
                .border_t_1()
                .border_color(theme::BORDER)
                .px(px(14.0))
                .py(px(6.0))
                .flex()
                .flex_col()
                .justify_between()
                // Frame ticks and cache bar line
                .child(
                    div()
                        .w_full()
                        .h(px(10.0))
                        .bg(theme::BG_INPUT)
                        .rounded_xs()
                        .relative()
                        .overflow_hidden()
                        // Cache bar (green)
                        .child(div().h_full().w(px(700.0)).bg(theme::hex_rgb(0x1a452a)))
                        // Playhead indicator (vertical line)
                        .child(
                            div()
                                .absolute()
                                .top_0()
                                .h_full()
                                .w(px(4.0))
                                .bg(theme::ACCENT_BLUE_LIGHT)
                                .style(format!("left: {:.1}%;", progress_pct)),
                        ),
                )
                // Bottom timeline legend
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .text_xs()
                        .text_color(theme::TEXT_MUTED)
                        .child(format!("Start: {}", start_f))
                        .child(format!("Current: {} ({:.1}%)", current_f, progress_pct))
                        .child(format!("End: {}", end_f)),
                ),
        )
}

fn render_performance_hud(stats: &PerformanceHudStats) -> blenderui::element::Div {
    div()
        .styled()
        .absolute()
        .top(px(16.0))
        .left(px(16.0))
        .w(px(320.0))
        .bg(theme::hex_rgba(0x111111d0))
        .rounded_md()
        .border_1()
        .border_color(theme::BORDER_LIGHT)
        .p(px(10.0))
        .flex()
        .flex_col()
        .gap(px(4.0))
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .text_xs()
                        .font_bold()
                        .text_color(theme::ACCENT_BLUE_LIGHT)
                        .child("PERFORMANCE HUD"),
                )
                .child(
                    div()
                        .text_xs()
                        .font_bold()
                        .text_color(if stats.drop_rate_pct > 1.0 {
                            theme::ACCENT_ORANGE
                        } else {
                            theme::ACCENT_GREEN
                        })
                        .child(format!(
                            "{:.1} / {:.1} FPS",
                            stats.measured_fps, stats.target_fps
                        )),
                ),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .text_xs()
                .child(div().text_color(theme::TEXT_MUTED).child("Dropped Frames:"))
                .child(div().text_color(theme::TEXT_PRIMARY).child(format!(
                    "{} ({:.1}%)",
                    stats.dropped_frames, stats.drop_rate_pct
                ))),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .text_xs()
                .child(div().text_color(theme::TEXT_MUTED).child("RAM Cache:"))
                .child(div().text_color(theme::TEXT_PRIMARY).child(format!(
                    "{:.1} / {:.0} MB ({} frames)",
                    stats.ram_usage_mb, stats.budget_mb, stats.cached_count
                ))),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .text_xs()
                .child(div().text_color(theme::TEXT_MUTED).child("Decode / Scrub:"))
                .child(div().text_color(theme::TEXT_PRIMARY).child(format!(
                    "{:.2} ms / {:.2} ms",
                    stats.avg_decode_ms, stats.last_scrub_latency_ms
                ))),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .text_xs()
                .child(div().text_color(theme::TEXT_MUTED).child("Proxy Status:"))
                .child(
                    div()
                        .text_color(if stats.is_proxy_active {
                            theme::ACCENT_GREEN
                        } else {
                            theme::TEXT_SECONDARY
                        })
                        .child(if stats.is_proxy_active {
                            "Active (H.264 GOP 1)"
                        } else {
                            "Inactive (Direct RGBA)"
                        }),
                ),
        )
}
