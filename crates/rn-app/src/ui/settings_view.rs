// Render Night - Application & Render Settings View
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::window::Context;
use blenderui::{ParentElement, Styled};

use super::theme;
use super::AppView;
use crate::state::AppState;
use rn_core::schemas::queue_state::PostAction;

pub fn render_settings_view(state: &AppState, cx: &Context<AppView>) -> blenderui::element::Div {
    div()
        .styled()
        .flex_1()
        .h_full()
        .p(px(20.0))
        .flex()
        .flex_col()
        .gap(px(16.0))
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
                        .child("Application & Render Settings"),
                )
                .child(
                    div()
                        .text_xs()
                        .text_color(theme::TEXT_MUTED)
                        .child("Configure Blender installations, rendering defaults, sound alerts, and safety policies."),
                ),
        )
        // 1. Blender Installations Section
        .child(render_blender_section(state))
        // 2. Rendering Defaults Section
        .child(render_rendering_section(state))
        // 3. Performance & Memory Section
        .child(render_performance_section(state))
        // 4. Sound & Audio Alerts Section
        .child(render_sound_section(state))
        // 5. Power & Safety Section
        .child(render_power_safety_section(state))
        // 6. Pre-flight Safety Checks Section
        .child(render_preflight_section(state))
        // 7. About Render Night Section
        .child(render_about_section(state, cx))
}

fn render_blender_section(state: &AppState) -> blenderui::element::Div {
    div()
        .styled()
        .w_full()
        .bg(theme::BG_PANEL)
        .rounded_md()
        .border_1()
        .border_color(theme::BORDER)
        .p(px(16.0))
        .flex()
        .flex_col()
        .gap(px(12.0))
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .text_sm()
                        .font_bold()
                        .text_color(theme::TEXT_PRIMARY)
                        .child("Blender Installations"),
                )
                .child(Button().child("+ Locate Executable (rfd)")),
        )
        .child(if state.discovered_blenders.is_empty() {
            div()
                .text_xs()
                .text_color(theme::TEXT_MUTED)
                .child("No Blender installations automatically detected on this system.")
        } else {
            div()
                .flex()
                .flex_col()
                .gap(px(6.0))
                .children(state.discovered_blenders.iter().map(|b| {
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .p(px(8.0))
                        .bg(theme::BG_AREA)
                        .rounded_sm()
                        .border_1()
                        .border_color(theme::BORDER)
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
                                        .bg(theme::BADGE_CPU_BG)
                                        .text_color(theme::BADGE_CPU_TEXT)
                                        .text_xs()
                                        .font_bold()
                                        .child(format!("v{}", b.version)),
                                )
                                .child(
                                    div()
                                        .text_xs()
                                        .text_color(theme::TEXT_PRIMARY)
                                        .child(b.display_path.clone()),
                                ),
                        )
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_MUTED)
                                .child(format!("{:?}", b.source)),
                        )
                }))
        })
}

fn render_rendering_section(state: &AppState) -> blenderui::element::Div {
    div()
        .styled()
        .w_full()
        .bg(theme::BG_PANEL)
        .rounded_md()
        .border_1()
        .border_color(theme::BORDER)
        .p(px(16.0))
        .flex()
        .flex_col()
        .gap(px(12.0))
        .child(
            div()
                .text_sm()
                .font_bold()
                .text_color(theme::TEXT_PRIMARY)
                .child("Rendering Defaults"),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .gap(px(16.0))
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(4.0))
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("Default Samples (Cycles)"),
                        )
                        .child(NumberField().value(state.default_samples.to_string())),
                )
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(4.0))
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("Default Resolution %"),
                        )
                        .child(
                            NumberSlider()
                                .min(25.0)
                                .max(200.0)
                                .value(state.default_resolution_pct.to_string()),
                        ),
                ),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .gap(px(16.0))
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(4.0))
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("Compute Device Preference"),
                        )
                        .child(
                            Dropdown()
                                .child(
                                    option()
                                        .value("gpu_optix")
                                        .selected(true)
                                        .child("GPU · OptiX (NVIDIA RTX)"),
                                )
                                .child(option().value("gpu_cuda").child("GPU · CUDA (NVIDIA)"))
                                .child(option().value("gpu_hip").child("GPU · HIP (AMD)"))
                                .child(option().value("cpu").child("CPU Only")),
                        ),
                )
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(4.0))
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("Crash Retry Policy"),
                        )
                        .child(
                            Dropdown()
                                .child(
                                    option()
                                        .value("retry_cpu")
                                        .selected(true)
                                        .child("Retry frame then CPU fallback (Recommended)"),
                                )
                                .child(
                                    option()
                                        .value("retry_same")
                                        .child("Retry once on same device"),
                                )
                                .child(
                                    option()
                                        .value("never")
                                        .child("Never retry / Fail immediately"),
                                ),
                        ),
                ),
        )
}

fn render_performance_section(state: &AppState) -> blenderui::element::Div {
    div()
        .styled()
        .w_full()
        .bg(theme::BG_PANEL)
        .rounded_md()
        .border_1()
        .border_color(theme::BORDER)
        .p(px(16.0))
        .flex()
        .flex_col()
        .gap(px(12.0))
        .child(
            div()
                .text_sm()
                .font_bold()
                .text_color(theme::TEXT_PRIMARY)
                .child("Performance & Memory"),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .gap(px(16.0))
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(4.0))
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("Background Worker Threads"),
                        )
                        .child(
                            NumberSlider()
                                .min(1.0)
                                .max(16.0)
                                .value(state.background_thread_limit.to_string()),
                        ),
                )
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(4.0))
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("RAM Frame Cache Budget (GB)"),
                        )
                        .child(
                            NumberSlider()
                                .min(1.0)
                                .max(32.0)
                                .value(state.memory_cache_budget_gb.to_string()),
                        ),
                ),
        )
}

fn render_sound_section(state: &AppState) -> blenderui::element::Div {
    div()
        .styled()
        .w_full()
        .bg(theme::BG_PANEL)
        .rounded_md()
        .border_1()
        .border_color(theme::BORDER)
        .p(px(16.0))
        .flex()
        .flex_col()
        .gap(px(12.0))
        .child(
            div()
                .text_sm()
                .font_bold()
                .text_color(theme::TEXT_PRIMARY)
                .child("Sound & Completion Alert"),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(16.0))
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(4.0))
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("\"to-DUNG\" Completion Volume (%)"),
                        )
                        .child(
                            NumberSlider()
                                .min(0.0)
                                .max(100.0)
                                .value(state.sound_volume.to_string()),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(6.0))
                        .child(Checkbox().checked(state.sound_muted))
                        .child(
                            span()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("Mute Audio Alerts"),
                        ),
                )
                .child(Button().child("▶ Test Sound")),
        )
}

fn render_power_safety_section(state: &AppState) -> blenderui::element::Div {
    div()
        .styled()
        .w_full()
        .bg(theme::BG_PANEL)
        .rounded_md()
        .border_1()
        .border_color(theme::BORDER)
        .p(px(16.0))
        .flex()
        .flex_col()
        .gap(px(12.0))
        .child(
            div()
                .text_sm()
                .font_bold()
                .text_color(theme::TEXT_PRIMARY)
                .child("Power & Post-Queue Safety"),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .gap(px(16.0))
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(4.0))
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("Default Action When Queue Finishes"),
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
                                ),
                        ),
                )
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(4.0))
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("Cancel Countdown Duration (Seconds)"),
                        )
                        .child(NumberField().value(state.shutdown_countdown_duration.to_string())),
                ),
        )
        // Hard Safety Invariant Callout
        .child(
            div()
                .p(px(10.0))
                .bg(theme::BG_AREA)
                .rounded_sm()
                .border_1()
                .border_color(theme::BORDER)
                .flex()
                .flex_row()
                .gap(px(8.0))
                .items_center()
                .child(
                    div()
                        .text_xs()
                        .text_color(theme::WARNING_TEXT)
                        .font_bold()
                        .child("Safety Notice:"),
                )
                .child(
                    div()
                        .text_xs()
                        .text_color(theme::TEXT_MUTED)
                        .child("To prevent data loss, post-queue actions are strictly disarmed upon session restore, crash recovery, or user keystroke/mouse input."),
                ),
        )
}

fn render_preflight_section(state: &AppState) -> blenderui::element::Div {
    div()
        .styled()
        .w_full()
        .bg(theme::BG_PANEL)
        .rounded_md()
        .border_1()
        .border_color(theme::BORDER)
        .p(px(16.0))
        .flex()
        .flex_col()
        .gap(px(12.0))
        .child(
            div()
                .text_sm()
                .font_bold()
                .text_color(theme::TEXT_PRIMARY)
                .child("Pre-Flight Safety Layer"),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .gap(px(16.0))
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(4.0))
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("Pre-Flight Mode"),
                        )
                        .child(
                            Dropdown()
                                .child(
                                    option()
                                        .value("never_block")
                                        .selected(
                                            state.preflight_mode == "never_block"
                                                || state.preflight_mode.is_empty(),
                                        )
                                        .child("Never block / Force-continue (Default)"),
                                )
                                .child(
                                    option()
                                        .value("ask")
                                        .selected(state.preflight_mode == "ask")
                                        .child("Ask with 30s countdown"),
                                )
                                .child(
                                    option()
                                        .value("strict")
                                        .selected(state.preflight_mode == "strict")
                                        .child("Strict (Require explicit confirmation)"),
                                ),
                        ),
                )
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(4.0))
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("Ignored Warning Codes"),
                        )
                        .child(
                            div()
                                .flex()
                                .flex_row()
                                .items_center()
                                .gap(px(8.0))
                                .child(div().text_xs().text_color(theme::TEXT_MUTED).child(
                                    format!(
                                        "{} ignored code(s)",
                                        state.ignored_warning_codes.len()
                                    ),
                                ))
                                .child(Button().child("Clear Ignored")),
                        ),
                ),
        )
}

fn render_about_section(_state: &AppState, cx: &Context<AppView>) -> blenderui::element::Div {
    div()
        .styled()
        .w_full()
        .bg(theme::BG_PANEL)
        .rounded_md()
        .border_1()
        .border_color(theme::BORDER)
        .p(px(16.0))
        .flex()
        .flex_col()
        .gap(px(12.0))
        .child(
            div()
                .text_sm()
                .font_bold()
                .text_color(theme::TEXT_PRIMARY)
                .child("About Render Night"),
        )
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(6.0))
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .justify_between()
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("Version"),
                        )
                        .child(
                            div()
                                .text_xs()
                                .font_bold()
                                .text_color(theme::TEXT_PRIMARY)
                                .child(env!("RN_FULL_VERSION")),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .justify_between()
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("Build Date"),
                        )
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_MUTED)
                                .child(env!("RN_BUILD_TIME")),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .justify_between()
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("License"),
                        )
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_MUTED)
                                .child("GPL-3.0-or-later"),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .justify_between()
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child("Blender Compatibility"),
                        )
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_MUTED)
                                .child("Blender 3.6 LTS, 4.2 LTS, 5.x"),
                        ),
                )
                .child(
                    div().pt(px(8.0)).flex().flex_row().justify_start().child(
                        Button()
                            .id("btn-open-diagnostics")
                            .child("System Diagnostics")
                            .on_click(cx.listener(|this, _event, _window, cx| {
                                this.state.open_diagnostics();
                                cx.notify();
                            })),
                    ),
                ),
        )
}
