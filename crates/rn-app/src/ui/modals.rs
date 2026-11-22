// Render Night - Modal Dialog Overlays
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::window::Context;
use blenderui::{ParentElement, Styled};

use super::theme;
use super::AppView;
use crate::state::{AppState, ModalState};

pub fn render_modal_overlay(state: &AppState, cx: &Context<AppView>) -> blenderui::element::Div {
    let Some(ref modal) = state.active_modal else {
        return div();
    };

    div()
        .styled()
        .absolute()
        .inset_0()
        .w_full()
        .h_full()
        .bg(theme::OVERLAY_DIM)
        .flex()
        .items_center()
        .justify_center()
        .p(px(24.0))
        .child(match modal {
            ModalState::ResumeAfterCrash {
                job_id,
                job_name,
                last_frame,
            } => render_resume_after_crash(job_id, job_name, *last_frame, cx),
            ModalState::ShutdownCountdown {
                seconds_remaining,
                action,
            } => render_shutdown_countdown(*seconds_remaining, *action, cx),
            ModalState::ConfirmQuit => render_confirm_quit(cx),
            ModalState::ShortcutsCheatSheet => render_shortcuts_sheet(cx),
            ModalState::PresetsManager => render_presets_manager(state, cx),
            ModalState::SkipReport { skipped } => render_skip_report(skipped, cx),
        })
}

fn render_resume_after_crash(
    _job_id: &str,
    job_name: &str,
    last_frame: i32,
    cx: &Context<AppView>,
) -> blenderui::element::Div {
    div()
        .styled()
        .w(px(520.0))
        .bg(theme::BG_PANEL)
        .rounded_lg()
        .border_2()
        .border_color(theme::WARNING_BORDER)
        .p(px(24.0))
        .flex()
        .flex_col()
        .gap(px(16.0))
        // Header
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(10.0))
                .child(
                    div()
                        .size(px(28.0))
                        .rounded_full()
                        .bg(theme::WARNING_BG)
                        .border_1()
                        .border_color(theme::WARNING_BORDER)
                        .text_sm()
                        .font_bold()
                        .text_color(theme::WARNING_TEXT)
                        .flex()
                        .items_center()
                        .justify_center()
                        .child("!"),
                )
                .child(
                    div()
                        .text_base()
                        .font_bold()
                        .text_color(theme::TEXT_PRIMARY)
                        .child("Unclean Shutdown Detected"),
                ),
        )
        // Body text
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(8.0))
                .child(
                    div()
                        .text_xs()
                        .text_color(theme::TEXT_PRIMARY)
                        .child(format!(
                            "Render Night was previously interrupted or crashed while rendering job \"{}\".",
                            job_name
                        )),
                )
                .child(
                    div()
                        .text_xs()
                        .text_color(theme::TEXT_SECONDARY)
                        .child(format!(
                            "The last recorded rendered frame was Frame {}. Would you like to restore the queue and resume from Frame {}?",
                            last_frame,
                            last_frame + 1
                        )),
                )
                .child(
                    div()
                        .p(px(8.0))
                        .bg(theme::BG_AREA)
                        .rounded_sm()
                        .border_1()
                        .border_color(theme::BORDER)
                        .text_xs()
                        .text_color(theme::WARNING_TEXT)
                        .child("Safety Rule: Post-queue actions have been strictly disarmed to prevent unexpected system shutdowns."),
                ),
        )
        // Actions
        .child(
            div()
                .flex()
                .flex_row()
                .justify_end()
                .gap(px(10.0))
                .child(
                    Button()
                        .id("btn-discard-crash")
                        .child("Discard & Start Fresh")
                        .on_click(cx.listener(|this, _event, _window, cx| {
                            this.state.active_modal = None;
                            cx.notify();
                        })),
                )
                .child(
                    Button()
                        .id("btn-resume-crash")
                        .child(format!("▶ Resume from Frame {}", last_frame + 1))
                        .on_click(cx.listener(|this, _event, _window, cx| {
                            this.state.resume_after_crash();
                            cx.notify();
                        })),
                ),
        )
}

fn render_shutdown_countdown(
    seconds_remaining: u32,
    action: rn_core::schemas::queue_state::PostAction,
    cx: &Context<AppView>,
) -> blenderui::element::Div {
    let action_str = format!("{:?}", action);

    div()
        .styled()
        .w(px(540.0))
        .bg(theme::BG_PANEL)
        .rounded_lg()
        .border_2()
        .border_color(theme::ACCENT_RED)
        .p(px(28.0))
        .flex()
        .flex_col()
        .items_center()
        .gap(px(16.0))
        // Title
        .child(
            div()
                .text_lg()
                .font_bold()
                .text_color(theme::TEXT_PRIMARY)
                .child(format!("System {} Scheduled", action_str)),
        )
        // Big Countdown Clock
        .child(
            div()
                .size(px(110.0))
                .rounded_full()
                .border_4()
                .border_color(theme::ACCENT_RED)
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .child(
                    div()
                        .text_2xl()
                        .font_bold()
                        .text_color(theme::TEXT_PRIMARY)
                        .child(format!("{}s", seconds_remaining)),
                )
                .child(
                    div()
                        .text_xs()
                        .text_color(theme::TEXT_MUTED)
                        .child("remaining"),
                ),
        )
        // Explanatory text
        .child(
            div()
                .text_xs()
                .text_color(theme::TEXT_SECONDARY)
                .text_center()
                .max_w(px(420.0))
                .child(format!(
                    "All queue render tasks have completed successfully. Your computer will {} in {} seconds.",
                    action_str.to_lowercase(),
                    seconds_remaining
                )),
        )
        // Cancel button (prominent)
        .child(
            div()
                .w_full()
                .flex()
                .flex_col()
                .items_center()
                .gap(px(6.0))
                .child(
                    Button()
                        .id("btn-cancel-shutdown")
                        .child(format!("CANCEL {} (OR PRESS ANY KEY)", action_str.to_uppercase()))
                        .on_click(cx.listener(|this, _event, _window, cx| {
                            this.state.cancel_shutdown_countdown();
                            this.state.active_modal = None;
                            cx.notify();
                        })),
                )
                .child(
                    div()
                        .text_xs()
                        .text_color(theme::TEXT_MUTED)
                        .child("Any keystroke or mouse movement immediately aborts this action."),
                ),
        )
}

fn render_confirm_quit(cx: &Context<AppView>) -> blenderui::element::Div {
    div()
        .styled()
        .w(px(480.0))
        .bg(theme::BG_PANEL)
        .rounded_lg()
        .border_1()
        .border_color(theme::BORDER)
        .p(px(24.0))
        .flex()
        .flex_col()
        .gap(px(16.0))
        .child(
            div()
                .text_base()
                .font_bold()
                .text_color(theme::TEXT_PRIMARY)
                .child("Quit Render Night?"),
        )
        .child(
            div()
                .text_xs()
                .text_color(theme::TEXT_SECONDARY)
                .child("A render job is actively executing. Quitting now will cleanly stop the Blender worker process, save the current queue state, and disarm all post-queue power actions."),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .justify_end()
                .gap(px(10.0))
                .child(
                    Button()
                        .id("btn-cancel-quit")
                        .child("Keep Rendering (Cancel)")
                        .on_click(cx.listener(|this, _event, _window, cx| {
                            this.state.active_modal = None;
                            cx.notify();
                        })),
                )
                .child(
                    Button()
                        .id("btn-confirm-quit")
                        .child("Stop & Quit")
                        .on_click(cx.listener(|this, _event, _window, _cx| {
                            this.state.stop_queue();
                            std::process::exit(0);
                        })),
                ),
        )
}

fn render_shortcuts_sheet(cx: &Context<AppView>) -> blenderui::element::Div {
    let shortcuts = [
        ("Ctrl/Cmd + O", "Add .blend file to queue"),
        ("Ctrl/Cmd + Enter", "Start or Pause queue rendering"),
        ("Ctrl/Cmd + D", "Duplicate selected job(s)"),
        ("Delete / Backspace", "Remove selected job(s) with Undo"),
        ("Ctrl/Cmd + C", "Copy overrides from active job"),
        ("Ctrl/Cmd + V", "Paste overrides (with engine verification)"),
        ("Ctrl/Cmd + A", "Select all queued jobs"),
        ("Escape", "Close editor / Deselect all / Dismiss modal"),
        ("?", "Toggle this Keyboard Shortcut Cheat Sheet"),
        (
            "J / K / L",
            "Sequence Player shuttle controls (1x, 2x, 4x, 8x)",
        ),
        ("Space", "Sequence Player play / pause toggle"),
        ("F / 1", "Sequence Player fit to window / 100% scale"),
    ];

    div()
        .styled()
        .w(px(580.0))
        .bg(theme::BG_PANEL)
        .rounded_lg()
        .border_1()
        .border_color(theme::BORDER)
        .p(px(24.0))
        .flex()
        .flex_col()
        .gap(px(14.0))
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .text_base()
                        .font_bold()
                        .text_color(theme::TEXT_PRIMARY)
                        .child("Keyboard Shortcuts"),
                )
                .child(
                    Button()
                        .id("btn-close-shortcuts")
                        .child("Close (Esc)")
                        .on_click(cx.listener(|this, _event, _window, cx| {
                            this.state.active_modal = None;
                            cx.notify();
                        })),
                ),
        )
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(6.0))
                .children(shortcuts.iter().map(|(keys, desc)| {
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .py(px(4.0))
                        .border_b_1()
                        .border_color(theme::BORDER)
                        .child(
                            div()
                                .px(px(6.0))
                                .py(px(2.0))
                                .bg(theme::BG_AREA)
                                .rounded_xs()
                                .border_1()
                                .border_color(theme::BORDER)
                                .text_xs()
                                .font_bold()
                                .text_color(theme::ACCENT_BLUE_LIGHT)
                                .child(*keys),
                        )
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_SECONDARY)
                                .child(*desc),
                        )
                })),
        )
}

fn render_skip_report(
    skipped: &[rn_core::overrides::compatibility::SkippedOverride],
    cx: &Context<AppView>,
) -> blenderui::element::Div {
    div()
        .styled()
        .w(px(560.0))
        .bg(theme::BG_PANEL)
        .rounded_lg()
        .border_1()
        .border_color(theme::WARNING_BORDER)
        .p(px(24.0))
        .flex()
        .flex_col()
        .gap(px(14.0))
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(10.0))
                .child(
                    div()
                        .size(px(24.0))
                        .rounded_full()
                        .bg(theme::WARNING_BG)
                        .text_xs()
                        .font_bold()
                        .text_color(theme::WARNING_TEXT)
                        .flex()
                        .items_center()
                        .justify_center()
                        .child("!"),
                )
                .child(
                    div()
                        .text_base()
                        .font_bold()
                        .text_color(theme::TEXT_PRIMARY)
                        .child("Incompatible Overrides Skipped"),
                ),
        )
        .child(
            div()
                .text_xs()
                .text_color(theme::TEXT_SECONDARY)
                .child(format!(
                    "{} override property(ies) were not applied because they are unsupported by the target job's render engine:",
                    skipped.len()
                )),
        )
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(6.0))
                .max_h(px(200.0))
                .overflow_y_scroll()
                .children(skipped.iter().map(|s| {
                    div()
                        .p(px(8.0))
                        .bg(theme::BG_AREA)
                        .rounded_sm()
                        .border_1()
                        .border_color(theme::BORDER)
                        .flex()
                        .flex_col()
                        .gap(px(2.0))
                        .child(
                            div()
                                .text_xs()
                                .font_bold()
                                .text_color(theme::TEXT_PRIMARY)
                                .child(s.rna_path.clone()),
                        )
                        .child(
                            div()
                                .text_xs()
                                .text_color(theme::TEXT_MUTED)
                                .child(s.reason.clone()),
                        )
                })),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .justify_end()
                .child(
                    Button()
                        .id("btn-dismiss-skip-report")
                        .child("Dismiss")
                        .on_click(cx.listener(|this, _event, _window, cx| {
                            this.state.active_modal = None;
                            cx.notify();
                        })),
                ),
        )
}

fn render_presets_manager(state: &AppState, cx: &Context<AppView>) -> blenderui::element::Div {
    div()
        .styled()
        .w(px(620.0))
        .bg(theme::BG_PANEL)
        .rounded_lg()
        .border_1()
        .border_color(theme::BORDER)
        .p(px(24.0))
        .flex()
        .flex_col()
        .gap(px(16.0))
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .text_base()
                        .font_bold()
                        .text_color(theme::TEXT_PRIMARY)
                        .child("Render Presets Manager"),
                )
                .child(
                    Button()
                        .id("btn-close-presets")
                        .child("Close (Esc)")
                        .on_click(cx.listener(|this, _event, _window, cx| {
                            this.state.active_modal = None;
                            cx.notify();
                        })),
                ),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .gap(px(8.0))
                .child(Button().child("Export JSON"))
                .child(Button().child("Import JSON")),
        )
        .child(if state.presets.is_empty() {
            div()
                .text_xs()
                .text_color(theme::TEXT_MUTED)
                .child("No presets saved yet. Save overrides from any job editor drawer.")
        } else {
            div()
                .flex()
                .flex_col()
                .gap(px(8.0))
                .max_h(px(240.0))
                .overflow_y_scroll()
                .children(state.presets.iter().map(|p| {
                    div()
                        .p(px(10.0))
                        .bg(theme::BG_AREA)
                        .rounded_sm()
                        .border_1()
                        .border_color(theme::BORDER)
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .gap(px(2.0))
                                .child(
                                    div()
                                        .text_xs()
                                        .font_bold()
                                        .text_color(theme::TEXT_PRIMARY)
                                        .child(p.name.clone()),
                                )
                                .child(div().text_xs().text_color(theme::TEXT_MUTED).child(
                                    format!(
                                        "{} overrides · {}",
                                        p.overrides.len(),
                                        p.engine.as_deref().unwrap_or("Cycles")
                                    ),
                                )),
                        )
                        .child(Button().child("Delete"))
                }))
        })
}
