// Render Night - Two-Line Job Row Component
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::window::WeakEntity;
use blenderui::{ParentElement, Styled};

use super::theme;
use super::AppView;
use crate::state::AppState;
use rn_core::schemas::queue_state::{Job, JobStatus};

pub fn render_job_row(
    job: &Job,
    state: &AppState,
    weak: WeakEntity<AppView>,
) -> blenderui::element::Div {
    let is_selected = state.selected_job_ids.contains(&job.id);
    let is_editing = state.editing_job_id.as_deref() == Some(&job.id);

    let (status_text, status_bg, status_color) = match job.status {
        JobStatus::Pending => ("Queued", theme::STATUS_QUEUED_BG, theme::STATUS_QUEUED_TEXT),
        JobStatus::Inspecting => (
            "⟳ Inspecting",
            theme::STATUS_QUEUED_BG,
            theme::STATUS_QUEUED_TEXT,
        ),
        JobStatus::Active => (
            "Rendering",
            theme::STATUS_ACTIVE_BG,
            theme::STATUS_ACTIVE_TEXT,
        ),
        JobStatus::Paused => ("Paused", theme::STATUS_PAUSED_BG, theme::STATUS_PAUSED_TEXT),
        JobStatus::Done => ("Completed", theme::STATUS_DONE_BG, theme::STATUS_DONE_TEXT),
        JobStatus::Failed => ("Failed", theme::STATUS_FAILED_BG, theme::STATUS_FAILED_TEXT),
        JobStatus::Canceled => (
            "Canceled",
            theme::STATUS_QUEUED_BG,
            theme::STATUS_QUEUED_TEXT,
        ),
    };

    let device_text = job.device.as_deref().unwrap_or("GPU").to_string();
    let is_gpu = device_text.to_uppercase().contains("GPU");
    let (device_bg, device_color) = if is_gpu {
        (theme::BADGE_GPU_BG, theme::BADGE_GPU_TEXT)
    } else {
        (theme::BADGE_CPU_BG, theme::BADGE_CPU_TEXT)
    };

    let warning_count = state
        .preflight_report
        .as_ref()
        .map(|r| r.warnings.iter().filter(|w| w.job_id == job.id).count())
        .unwrap_or(0);

    let change_count = job.overrides.len();
    let summary = state.effective_settings_summary(job);

    let border_color = if is_editing {
        theme::ACCENT_ORANGE
    } else if is_selected {
        theme::ACCENT_BLUE
    } else {
        theme::BORDER
    };

    let row_bg = if is_selected {
        theme::BG_SELECTED
    } else {
        theme::BG_PANEL
    };

    div()
        .styled()
        .w_full()
        .min_h(px(60.0))
        .bg(row_bg)
        .border_1()
        .border_color(border_color)
        .rounded_md()
        .flex()
        .flex_col()
        .justify_between()
        .overflow_hidden()
        // Content area (Top line + Bottom line)
        .child(
            div()
                .flex()
                .flex_col()
                .px(px(10.0))
                .pt(px(6.0))
                .pb(px(4.0))
                .gap(px(4.0))
                // Line 1: Checkbox, Filename, Status chip, Device badge, Warnings chip, Changes chip, Actions
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .gap(px(8.0))
                        // Left group: Checkbox + Filename
                        .child(
                            div()
                                .flex()
                                .flex_row()
                                .items_center()
                                .gap(px(8.0))
                                .flex_1()
                                .min_w(px(0.0))
                                .child({
                                    let jid = job.id.clone();
                                    Checkbox()
                                        .id(format!("chk-job-{}", job.id))
                                        .checked(is_selected)
                                        .on_click(move |_e, _window, app| {
                                            let jid_c = jid.clone();
                                            weak.update(app, |this, cx| {
                                                if this.state.selected_job_ids.contains(&jid_c) {
                                                    this.state.selected_job_ids.remove(&jid_c);
                                                } else {
                                                    this.state.selected_job_ids.insert(jid_c);
                                                }
                                                cx.notify();
                                            });
                                        })
                                })
                                .child({
                                    let mut s = span()
                                        .text_sm()
                                        .font_semibold()
                                        .text_color(theme::TEXT_PRIMARY)
                                        .truncate();
                                    if job.name.chars().any(|c| (c as u32) > 0x0590) {
                                        s = s.font_family("dejavu");
                                    }
                                    s.child(job.name.clone())
                                }),
                        )
                        // Right group: Status chip + Device badge + Badges + Actions
                        .child(
                            div()
                                .flex()
                                .flex_row()
                                .items_center()
                                .gap(px(6.0))
                                .flex_none()
                                // Status chip
                                .child(
                                    span()
                                        .text_xs()
                                        .font_medium()
                                        .px(px(6.0))
                                        .py(px(2.0))
                                        .rounded_sm()
                                        .bg(status_bg)
                                        .text_color(status_color)
                                        .child(status_text),
                                )
                                // Device badge
                                .child(
                                    span()
                                        .text_xs()
                                        .font_medium()
                                        .px(px(6.0))
                                        .py(px(2.0))
                                        .rounded_sm()
                                        .bg(device_bg)
                                        .text_color(device_color)
                                        .child(device_text),
                                )
                                // Basic mode chip
                                .child(if job.is_basic_mode == Some(true) {
                                    let jid = job.id.clone();
                                    Button()
                                        .id(format!("btn-basic-mode-{}", job.id))
                                        .cursor_pointer()
                                        .text_xs()
                                        .font_medium()
                                        .px(px(6.0))
                                        .py(px(2.0))
                                        .rounded_sm()
                                        .bg(theme::WARNING_BG)
                                        .border_1()
                                        .border_color(theme::WARNING_BORDER)
                                        .text_color(theme::WARNING_TEXT)
                                        .child("⚡ Basic mode")
                                        .on_click(move |_e, _window, app| {
                                            let jid_c = jid.clone();
                                            weak.update(app, |this, cx| {
                                                this.state.open_basic_mode_details(&jid_c);
                                                cx.notify();
                                            });
                                        })
                                } else {
                                    Button().hidden()
                                })
                                // Warnings chip
                                .child(if warning_count > 0 {
                                    let jid = job.id.clone();
                                    Button()
                                        .id(format!("btn-job-warnings-{}", job.id))
                                        .cursor_pointer()
                                        .text_xs()
                                        .font_medium()
                                        .px(px(6.0))
                                        .py(px(2.0))
                                        .rounded_sm()
                                        .bg(theme::WARNING_BG)
                                        .border_1()
                                        .border_color(theme::WARNING_BORDER)
                                        .text_color(theme::WARNING_TEXT)
                                        .child(format!(
                                            "! {} warning{}",
                                            warning_count,
                                            if warning_count > 1 { "s" } else { "" }
                                        ))
                                        .on_click(move |_e, _window, app| {
                                            let jid_c = jid.clone();
                                            weak.update(app, |this, cx| {
                                                this.state.open_job_warnings(&jid_c);
                                                cx.notify();
                                            });
                                        })
                                } else {
                                    Button().hidden()
                                })
                                // Changes chip
                                .child(if change_count > 0 {
                                    span()
                                        .text_xs()
                                        .font_medium()
                                        .px(px(6.0))
                                        .py(px(2.0))
                                        .rounded_sm()
                                        .bg(theme::CHANGES_BG)
                                        .border_1()
                                        .border_color(theme::CHANGES_BORDER)
                                        .text_color(theme::CHANGES_TEXT)
                                        .child(format!("{} modified", change_count,))
                                } else {
                                    span()
                                })
                                // Quick action buttons
                                .child({
                                    let jid = job.id.clone();
                                    Button()
                                        .id(format!("btn-edit-job-{}", job.id))
                                        .child("Edit")
                                        .on_click(move |_e, _window, app| {
                                            let jid_c = jid.clone();
                                            weak.update(app, |this, cx| {
                                                this.state.open_editor(&jid_c);
                                                cx.notify();
                                            });
                                        })
                                })
                                .child({
                                    let jid = job.id.clone();
                                    Button()
                                        .id(format!("btn-remove-job-{}", job.id))
                                        .child("×")
                                        .on_click(move |_e, _window, app| {
                                            let jid_c = jid.clone();
                                            weak.update(app, |this, cx| {
                                                this.state.remove_job(&jid_c);
                                                cx.notify();
                                            });
                                        })
                                }),
                        ),
                )
                // Line 2: Effective-settings summary
                .child(
                    div().flex().flex_row().items_center().pl(px(26.0)).child(
                        span()
                            .text_xs()
                            .text_color(theme::TEXT_MUTED)
                            .truncate()
                            .child(summary),
                    ),
                ),
        )
        // Bottom edge progress bar (Full width along bottom border)
        .child(
            div().w_full().h(px(4.0)).bg(theme::BG_INPUT).child(
                div()
                    .h_full()
                    .style(format!(
                        "width: {:.1}%;",
                        (job.progress.clamp(0.0, 1.0) * 100.0).max(
                            if job.status == JobStatus::Active {
                                2.0
                            } else {
                                0.0
                            }
                        )
                    ))
                    .bg(if job.status == JobStatus::Failed {
                        theme::ACCENT_RED
                    } else if job.status == JobStatus::Active {
                        theme::ACCENT_GREEN
                    } else if job.status == JobStatus::Done {
                        theme::STATUS_DONE_TEXT
                    } else {
                        theme::STATUS_QUEUED_TEXT
                    }),
            ),
        )
}
