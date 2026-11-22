// Render Night - Slide-Over Job Properties Editor
// SPDX-License-Identifier: GPL-3.0-or-later

use blenderui::components::*;
use blenderui::geometry::px;
use blenderui::html::*;
use blenderui::{ParentElement, Styled};

use super::theme;
use crate::state::AppState;
use rn_core::schemas::inspect::{InspectOutput, RnaPropertyMeta};
use rn_core::schemas::queue_state::Job;

pub fn render_job_editor(job: &Job, _state: &AppState) -> blenderui::element::Div {
    let inspect_scene = job.inspect.as_ref().and_then(|v| {
        let out: Option<InspectOutput> = serde_json::from_value(v.clone()).ok();
        out.and_then(|o| o.scenes.into_iter().next())
    });

    let current_engine = job
        .overrides
        .get("scene.render.engine")
        .and_then(|v| v.as_str())
        .or(job.engine.as_deref())
        .unwrap_or("CYCLES")
        .to_string();

    let is_cycles = current_engine.to_uppercase().contains("CYCLES");

    let current_device = job
        .overrides
        .get("scene.cycles.device")
        .and_then(|v| v.as_str())
        .or(job.device.as_deref())
        .unwrap_or("GPU")
        .to_string();

    let res_x = job
        .overrides
        .get("scene.render.resolution_x")
        .and_then(|v| v.as_u64())
        .unwrap_or_else(|| {
            inspect_scene
                .as_ref()
                .map(|s| s.resolution_x as u64)
                .unwrap_or(1920)
        });

    let res_y = job
        .overrides
        .get("scene.render.resolution_y")
        .and_then(|v| v.as_u64())
        .unwrap_or_else(|| {
            inspect_scene
                .as_ref()
                .map(|s| s.resolution_y as u64)
                .unwrap_or(1080)
        });

    let res_pct = job
        .overrides
        .get("scene.render.resolution_percentage")
        .and_then(|v| v.as_f64())
        .unwrap_or(100.0);

    let samples = job
        .overrides
        .get("scene.cycles.samples")
        .and_then(|v| v.as_i64())
        .unwrap_or(128);

    let output_path = job
        .overrides
        .get("scene.render.filepath")
        .and_then(|v| v.as_str())
        .or(job.output_dir.as_deref())
        .unwrap_or("//render/")
        .to_string();

    div()
        .styled()
        .w(px(380.0))
        .h_full()
        .bg(theme::BG_PANEL)
        .border_l_1()
        .border_color(theme::BORDER)
        .flex()
        .flex_col()
        .overflow_y_scroll()
        // Header
        .child(
            div()
                .w_full()
                .h(px(40.0))
                .bg(theme::BG_HEADER)
                .border_b_1()
                .border_color(theme::BORDER)
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .px(px(12.0))
                .child(
                    div().flex().flex_row().items_center().gap(px(6.0)).child(
                        span()
                            .text_sm()
                            .font_bold()
                            .text_color(theme::TEXT_PRIMARY)
                            .child("Job Settings"),
                    ),
                )
                .child(Button().child("Close")),
        )
        // Scrollable settings body
        .child(
            div()
                .flex_1()
                .p(px(14.0))
                .flex()
                .flex_col()
                .gap(px(14.0))
                // Job Filename summary
                .child(
                    div()
                        .p(px(8.0))
                        .rounded_sm()
                        .bg(theme::BG_INPUT)
                        .border_1()
                        .border_color(theme::BORDER)
                        .child(
                            span()
                                .text_xs()
                                .font_semibold()
                                .text_color(theme::TEXT_PRIMARY)
                                .truncate()
                                .child(format!("Target: {}", job.name)),
                        ),
                )
                // SECTION 1: ESSENTIALS
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(10.0))
                        .child(
                            span()
                                .text_xs()
                                .font_bold()
                                .uppercase()
                                .text_color(theme::TEXT_MUTED)
                                .child("Essentials"),
                        )
                        // Render Engine
                        .child(render_setting_row(
                            "Render Engine",
                            job.overrides.contains_key("scene.render.engine"),
                            Dropdown()
                                .child(option().value("CYCLES").selected(is_cycles).child("Cycles"))
                                .child(
                                    option()
                                        .value("BLENDER_EEVEE_NEXT")
                                        .selected(!is_cycles)
                                        .child("EEVEE"),
                                )
                                .child(option().value("BLENDER_WORKBENCH").child("Workbench")),
                        ))
                        // Compute Device
                        .child(render_setting_row(
                            "Compute Device",
                            job.overrides.contains_key("scene.cycles.device"),
                            Dropdown()
                                .child(
                                    option()
                                        .value("GPU")
                                        .selected(current_device.contains("GPU"))
                                        .child("GPU Compute"),
                                )
                                .child(
                                    option()
                                        .value("CPU")
                                        .selected(current_device.contains("CPU"))
                                        .child("CPU"),
                                ),
                        ))
                        // Resolution X & Y
                        .child(
                            div()
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
                                            span()
                                                .text_xs()
                                                .font_medium()
                                                .text_color(theme::TEXT_SECONDARY)
                                                .child("Resolution (X × Y)"),
                                        )
                                        .child(
                                            if job
                                                .overrides
                                                .contains_key("scene.render.resolution_x")
                                                || job
                                                    .overrides
                                                    .contains_key("scene.render.resolution_y")
                                            {
                                                span()
                                                    .text_xs()
                                                    .text_color(theme::CHANGES_TEXT)
                                                    .child("modified")
                                            } else {
                                                span()
                                            },
                                        ),
                                )
                                .child(
                                    div()
                                        .flex()
                                        .flex_row()
                                        .items_center()
                                        .gap(px(6.0))
                                        .child(NumberField().value(res_x.to_string()))
                                        .child(
                                            span()
                                                .text_xs()
                                                .text_color(theme::TEXT_MUTED)
                                                .child("×"),
                                        )
                                        .child(NumberField().value(res_y.to_string())),
                                ),
                        )
                        // Resolution Percentage
                        .child(render_setting_row(
                            "Resolution Scale %",
                            job.overrides
                                .contains_key("scene.render.resolution_percentage"),
                            NumberSlider()
                                .min(25.0)
                                .max(200.0)
                                .value(res_pct.to_string()),
                        ))
                        // Frame Range (Start, End, Step)
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .gap(px(4.0))
                                .child(
                                    span()
                                        .text_xs()
                                        .font_medium()
                                        .text_color(theme::TEXT_SECONDARY)
                                        .child("Frame Range (Start · End · Step)"),
                                )
                                .child(
                                    div()
                                        .flex()
                                        .flex_row()
                                        .items_center()
                                        .gap(px(6.0))
                                        .child(NumberField().value(job.range.start.to_string()))
                                        .child(
                                            span()
                                                .text_xs()
                                                .text_color(theme::TEXT_MUTED)
                                                .child(".."),
                                        )
                                        .child(NumberField().value(job.range.end.to_string()))
                                        .child(
                                            span()
                                                .text_xs()
                                                .text_color(theme::TEXT_MUTED)
                                                .child("+"),
                                        )
                                        .child(NumberField().value("1")),
                                ),
                        )
                        // Samples (Engine-specific)
                        .child(render_setting_row(
                            if is_cycles {
                                "Cycles Render Samples"
                            } else {
                                "EEVEE TAA Samples"
                            },
                            job.overrides.contains_key("scene.cycles.samples"),
                            NumberField().value(samples.to_string()),
                        ))
                        // Output Path
                        .child(render_setting_row(
                            "Output Directory & Pattern",
                            job.overrides.contains_key("scene.render.filepath"),
                            TextField().value(output_path),
                        )),
                )
                // SECTION 2: ALL SETTINGS (SCHEMA-DRIVEN RNA METADATA - COLLAPSED)
                .child(
                    details()
                        .child(
                            summary()
                                .text_xs()
                                .font_bold()
                                .uppercase()
                                .text_color(theme::TEXT_MUTED)
                                .child("All Settings (RNA Schema-Driven)"),
                        )
                        .child(
                            div()
                                .pt(px(8.0))
                                .flex()
                                .flex_col()
                                .gap(px(8.0))
                                .children(render_schema_properties(job, is_cycles)),
                        ),
                ),
        )
}

fn render_setting_row(
    label: &str,
    is_modified: bool,
    widget: blenderui::element::Div,
) -> blenderui::element::Div {
    div()
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
                    span()
                        .text_xs()
                        .font_medium()
                        .text_color(theme::TEXT_SECONDARY)
                        .child(label.to_string()),
                )
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(4.0))
                        .child(if is_modified {
                            span()
                                .text_xs()
                                .text_color(theme::CHANGES_TEXT)
                                .child("modified")
                        } else {
                            span()
                        })
                        .child(if is_modified {
                            Button().child("Reset")
                        } else {
                            div()
                        }),
                ),
        )
        .child(widget)
}

fn render_schema_properties(job: &Job, is_cycles: bool) -> Vec<blenderui::element::Div> {
    let inspect_out: Option<InspectOutput> = job
        .inspect
        .as_ref()
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    let scene = match inspect_out.and_then(|o| o.scenes.into_iter().next()) {
        Some(s) => s,
        None => return Vec::new(),
    };

    let mut rows = Vec::new();

    // 1. General Render RNA struct
    for (prop_name, meta) in &scene.render {
        let key = format!("scene.render.{}", prop_name);
        rows.push(render_rna_field(&key, prop_name, meta, job));
    }

    // 2. Image Settings RNA struct
    for (prop_name, meta) in &scene.image_settings {
        let key = format!("scene.image_settings.{}", prop_name);
        rows.push(render_rna_field(&key, prop_name, meta, job));
    }

    // 3. Engine-Aware RNA Struct: Cycles vs EEVEE
    if is_cycles {
        for (prop_name, meta) in &scene.cycles {
            let key = format!("scene.cycles.{}", prop_name);
            rows.push(render_rna_field(&key, prop_name, meta, job));
        }
    } else {
        for (prop_name, meta) in &scene.eevee {
            let key = format!("scene.eevee.{}", prop_name);
            rows.push(render_rna_field(&key, prop_name, meta, job));
        }
    }

    rows
}

fn render_rna_field(
    full_key: &str,
    prop_name: &str,
    meta: &RnaPropertyMeta,
    job: &Job,
) -> blenderui::element::Div {
    let is_modified = job.overrides.contains_key(full_key);
    let label = meta.name.as_deref().unwrap_or(prop_name);

    let prop_type = meta.property_type.as_deref().unwrap_or("STRING");

    let widget = match prop_type {
        "ENUM" => {
            let active_val = job
                .overrides
                .get(full_key)
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .or_else(|| meta.value.as_str().map(|s| s.to_string()))
                .unwrap_or_default();

            let mut dd = Dropdown();
            if let Some(items) = &meta.enum_items {
                for item in items {
                    dd = dd.child(
                        option()
                            .value(item.identifier.clone())
                            .selected(item.identifier == active_val)
                            .child(item.name.clone()),
                    );
                }
            } else {
                dd = dd.child(
                    option()
                        .value(active_val.clone())
                        .selected(true)
                        .child(active_val),
                );
            }
            dd
        }
        "BOOLEAN" => {
            let active_bool = job
                .overrides
                .get(full_key)
                .and_then(|v| v.as_bool())
                .or_else(|| meta.value.as_bool())
                .unwrap_or(false);

            Checkbox().checked(active_bool)
        }
        "INT" | "FLOAT" => {
            let active_num = job
                .overrides
                .get(full_key)
                .and_then(|v| v.as_f64())
                .or_else(|| meta.value.as_f64())
                .unwrap_or(0.0);

            if let (Some(min), Some(max)) = (meta.min, meta.max) {
                if max <= 1000.0 {
                    NumberSlider()
                        .min(min)
                        .max(max)
                        .value(active_num.to_string())
                } else {
                    NumberField().value(active_num.to_string())
                }
            } else {
                NumberField().value(active_num.to_string())
            }
        }
        _ => {
            let active_str = job
                .overrides
                .get(full_key)
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .or_else(|| meta.value.as_str().map(|s| s.to_string()))
                .unwrap_or_default();

            TextField().value(active_str)
        }
    };

    render_setting_row(label, is_modified, widget)
}
