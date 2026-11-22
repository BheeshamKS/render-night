// Render Night - Creative & Production Tools View
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::{ParentElement, Styled};

use super::theme;
use crate::state::AppState;

pub fn render_tools_view(_state: &AppState) -> blenderui::element::Div {
    div()
        .styled()
        .flex_1()
        .h_full()
        .p(px(24.0))
        .flex()
        .flex_col()
        .gap(px(20.0))
        .overflow_y_scroll()
        // Header
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(4.0))
                .child(
                    div()
                        .text_lg()
                        .font_bold()
                        .text_color(theme::TEXT_PRIMARY)
                        .child("Creative & Production Tools"),
                )
                .child(
                    div()
                        .text_xs()
                        .text_color(theme::TEXT_MUTED)
                        .child("High-performance utility suite for review, preset management, and asset pipeline transcoding."),
                ),
        )
        // Cards Grid
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(16.0))
                // Tool 1: Sequence Player
                .child(render_tool_card(
                    "REALTIME VIEWER",
                    theme::ACCENT_BLUE,
                    "High-Speed Sequence Player",
                    "Clock-driven, zero-slideshow frame playback engine with direct RGBA blitting, LRU RAM caching, off-thread image decoding (PNG/JPEG/EXR), shuttle controls (J/K/L), and live folder watching.",
                    "Launch Sequence Player",
                ))
                // Tool 2: Presets Manager
                .child(render_tool_card(
                    "PROFILES",
                    theme::ACCENT_GREEN,
                    "Render Presets Manager",
                    "Create, curate, export, and import reusable override profiles across scenes. Copy and paste overrides between jobs with automatic engine compatibility verification and skip reports.",
                    "Manage Presets",
                ))
                // Tool 3: Format Converter
                .child(render_tool_card(
                    "TRANSCODER",
                    theme::ACCENT_ORANGE,
                    "Format & Proxy Converter",
                    "Transcode heavy EXR or multi-channel render passes into lightweight intra-frame H.264 video proxies (GOP 1) with sRGB tone-mapping or high-bitrate ProRes deliverables.",
                    "Open Converter",
                )),
        )
}

fn render_tool_card(
    badge: &'static str,
    badge_color: blenderui::color::Rgba,
    title: &'static str,
    description: &'static str,
    action_label: &'static str,
) -> blenderui::element::Div {
    div()
        .styled()
        .w_full()
        .bg(theme::BG_PANEL)
        .rounded_md()
        .border_1()
        .border_color(theme::BORDER)
        .p(px(18.0))
        .flex()
        .flex_row()
        .items_center()
        .justify_between()
        .gap(px(24.0))
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(6.0))
                .flex_1()
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
                                .bg(badge_color)
                                .text_color(theme::TEXT_PRIMARY)
                                .text_xs()
                                .font_bold()
                                .child(badge),
                        )
                        .child(
                            div()
                                .text_sm()
                                .font_bold()
                                .text_color(theme::TEXT_PRIMARY)
                                .child(title),
                        ),
                )
                .child(
                    div()
                        .text_xs()
                        .text_color(theme::TEXT_SECONDARY)
                        .max_w(px(680.0))
                        .child(description),
                ),
        )
        .child(Button().child(action_label))
}
