// Render Night - Main Queue View (List, Empty State, Bulk Bar, Drawer)
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::list::uniform_list;
use blenderui::window::Context;
use blenderui::{ParentElement, Styled};

use super::bulk_bar::render_bulk_bar;
use super::job_editor::render_job_editor;
use super::job_row::render_job_row;
use super::preflight_banner::render_preflight_banner;
use super::theme;
use super::AppView;
use crate::state::AppState;

pub fn render_queue_view(state: &AppState, cx: &Context<AppView>) -> blenderui::element::Div {
    let has_jobs = !state.queue_state.jobs.is_empty();
    let editing_job = state
        .editing_job_id
        .as_ref()
        .and_then(|id| state.queue_state.jobs.iter().find(|j| &j.id == id));

    let state_for_list = state.clone();
    let job_count = state.queue_state.jobs.len();

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
                .overflow_hidden()
                .child(render_preflight_banner(state))
                .child(render_bulk_bar(state))
                .child(if !has_jobs {
                    div().w_full().child(render_empty_drop_zone(cx))
                } else {
                    div().w_full().flex_1().overflow_y_scroll().child(
                        uniform_list("queue_jobs", job_count, move |range, _window, _cx| {
                            range
                                .filter_map(|i| state_for_list.queue_state.jobs.get(i))
                                .map(|job| render_job_row(job, &state_for_list))
                                .collect::<Vec<_>>()
                        })
                        .item_height(px(68.0))
                        .w_full()
                        .flex_1(),
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

fn render_empty_drop_zone(cx: &Context<AppView>) -> blenderui::element::Div {
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
        // Clean vector icon for drop zone
        .child(
            div()
                .w(px(40.0))
                .h(px(32.0))
                .border_2()
                .border_color(theme::TEXT_MUTED)
                .rounded_sm()
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .child(
                    div()
                        .w(px(20.0))
                        .h(px(2.0))
                        .bg(theme::TEXT_MUTED)
                        .mb(px(3.0)),
                )
                .child(div().w(px(12.0)).h(px(2.0)).bg(theme::TEXT_MUTED)),
        )
        .child(
            span()
                .text_base()
                .font_semibold()
                .text_color(theme::TEXT_PRIMARY)
                .child("Click '+ Add .blend' or Browse to select projects"),
        )
        .child(
            span()
                .text_xs()
                .text_color(theme::TEXT_MUTED)
                .child("Add Blender files to queue for background batch rendering"),
        )
        .child(
            div()
                .mt(px(8.0))
                .child(
                    Button()
                        .id("btn-browse-blend")
                        .child("+ Browse .blend Files")
                        .on_click(cx.listener(|this, _event, _window, cx| {
                            this.state.prompt_add_blend_files();
                            cx.notify();
                        })),
                ),
        )
        .child(
            span()
                .text_xs()
                .text_color(theme::TEXT_DIM)
                .child("Tested on Blender 3.6 LTS, 4.2 LTS, 5.x · Automatic GPU/CPU detection"),
        )
}
