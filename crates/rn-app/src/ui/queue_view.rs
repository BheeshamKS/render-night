// Render Night - Main Queue View (List, Empty State, Bulk Bar, Drawer)
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::{ParentElement, Styled};

use super::bulk_bar::render_bulk_bar;
use super::job_editor::render_job_editor;
use super::job_row::render_job_row;
use super::preflight_banner::render_preflight_banner;
use super::theme;
use crate::state::AppState;

pub fn render_queue_view(state: &AppState) -> blenderui::element::Div {
    let has_jobs = !state.queue_state.jobs.is_empty();
    let editing_job = state
        .editing_job_id
        .as_ref()
        .and_then(|id| state.queue_state.jobs.iter().find(|j| &j.id == id));

    div()
        .styled()
        .flex_1()
        .h_full()
        .flex()
        .flex_row()
        .overflow_hidden()
        // Center queue column
        .child(
            div()
                .flex_1()
                .h_full()
                .p(px(14.0))
                .flex()
                .flex_col()
                .overflow_y_scroll()
                .child(render_preflight_banner(state))
                .child(render_bulk_bar(state))
                .child(if !has_jobs {
                    render_empty_drop_zone()
                } else {
                    div().w_full().flex().flex_col().gap(px(8.0)).children(
                        state
                            .queue_state
                            .jobs
                            .iter()
                            .map(|job| render_job_row(job, state)),
                    )
                }),
        )
        // Slide-Over Job Editor Drawer (when a job is being edited)
        .child(if let Some(job) = editing_job {
            render_job_editor(job, state)
        } else {
            div()
        })
}

fn render_empty_drop_zone() -> blenderui::element::Div {
    div()
        .styled()
        .w_full()
        .h(px(320.0))
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
        .gap(px(12.0))
        .child(span().text_3xl().child("📂"))
        .child(
            span()
                .text_base()
                .font_semibold()
                .text_color(theme::TEXT_PRIMARY)
                .child("Drop .blend files here to start rendering"),
        )
        .child(
            span()
                .text_xs()
                .text_color(theme::TEXT_MUTED)
                .child("or click '+ Add .blend' in the toolbar to browse"),
        )
        .child(
            div()
                .mt(px(8.0))
                .child(Button().child("+ Browse .blend Files")),
        )
        .child(
            span()
                .text_xs()
                .text_color(theme::TEXT_DIM)
                .child("Supports Blender 2.80 through 5.0 projects · Automatic GPU/CPU detection"),
        )
}
