use rn_core::overrides::{
    compute_override_diff, filter_overrides_for_active_engine, is_property_modified,
    is_property_relevant_to_engine,
};
use rn_core::ranges::{
    expand_tokens, is_format_video, parse_custom_range, preview_tokens, resolve_frame_range,
    FrameRangeConfig, FrameRangeMode, SimpleRange, TokenContext,
};
use rn_core::render::{parse_stdout_line, parse_stdout_stream, ParsedLine};
use rn_core::schemas::{
    HistoryEntry, InspectOutput, OverrideMap, Preset, QueueState, RunnerPayload,
};
use schemars::schema_for;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
struct GoldenRangeFixtures {
    custom_range_cases: Vec<CustomRangeCase>,
    invalid_expressions: Vec<InvalidExpressionCase>,
    mode_resolutions: Vec<ModeResolutionCase>,
    format_validations: Vec<FormatValidationCase>,
}

#[derive(Debug, Deserialize)]
struct CustomRangeCase {
    name: String,
    input: String,
    expected_count: usize,
    expected_first: i32,
    expected_last: i32,
    must_include: Vec<i32>,
    #[serde(default)]
    must_not_include: Vec<i32>,
}

#[derive(Debug, Deserialize)]
struct InvalidExpressionCase {
    input: String,
    #[allow(dead_code)]
    expected_error: String,
}

#[derive(Debug, Deserialize)]
struct ModeResolutionCase {
    name: String,
    mode: String,
    #[serde(default)]
    simple: Option<SimpleRangeDto>,
    #[serde(default)]
    single_still_frame: Option<i32>,
    #[serde(default)]
    custom_expression: Option<String>,
    scene_defaults: SceneDefaultsDto,
    #[serde(default)]
    expected_frames: Option<Vec<i32>>,
    expected_count: usize,
    expected_continuous: bool,
    expected_summary: String,
}

#[derive(Debug, Deserialize)]
struct SimpleRangeDto {
    start: i32,
    end: i32,
    step: i32,
}

#[derive(Debug, Deserialize)]
struct SceneDefaultsDto {
    start: i32,
    end: i32,
    step: i32,
}

#[derive(Debug, Deserialize)]
struct FormatValidationCase {
    format: String,
    is_video: bool,
}

#[derive(Debug, Deserialize)]
struct TokenExpanderCase {
    name: String,
    template: String,
    context: TokenContextDto,
    is_preview: bool,
    expected: String,
}

#[derive(Debug, Deserialize)]
struct TokenContextDto {
    project: String,
    scene: String,
    camera: String,
    frame: Option<i32>,
}

#[test]
fn test_golden_frame_ranges() {
    let json_str = include_str!("../../../tests/golden/frame_ranges.json");
    let fixtures: GoldenRangeFixtures =
        serde_json::from_str(json_str).expect("Valid frame_ranges.json schema");

    for case in &fixtures.custom_range_cases {
        let frames = parse_custom_range(&case.input).unwrap_or_else(|e| {
            panic!(
                "Failed parsing '{}' in '{}': {:?}",
                case.input, case.name, e
            )
        });
        assert_eq!(
            frames.len(),
            case.expected_count,
            "Count mismatch in '{}'",
            case.name
        );
        assert_eq!(
            frames[0], case.expected_first,
            "First mismatch in '{}'",
            case.name
        );
        assert_eq!(
            *frames.last().unwrap(),
            case.expected_last,
            "Last mismatch in '{}'",
            case.name
        );

        for val in &case.must_include {
            assert!(
                frames.contains(val),
                "Must include {} in '{}'",
                val,
                case.name
            );
        }
        for val in &case.must_not_include {
            assert!(
                !frames.contains(val),
                "Must not include {} in '{}'",
                val,
                case.name
            );
        }
        // Verify sorted
        for i in 1..frames.len() {
            assert!(frames[i] > frames[i - 1], "Unsorted in '{}'", case.name);
        }
    }

    for case in &fixtures.invalid_expressions {
        let res = parse_custom_range(&case.input);
        assert!(res.is_err(), "Expected error for '{}'", case.input);
    }

    for case in &fixtures.mode_resolutions {
        let mode = match case.mode.as_str() {
            "scene_default" => FrameRangeMode::SceneDefault,
            "simple" => FrameRangeMode::Simple,
            "single_still" => FrameRangeMode::SingleStill,
            "custom" => FrameRangeMode::Custom,
            other => panic!("Unknown mode: {other}"),
        };

        let simple = case.simple.as_ref().map(|s| SimpleRange {
            start: s.start,
            end: s.end,
            step: s.step,
        });

        let config = FrameRangeConfig {
            mode,
            simple,
            custom_expression: case.custom_expression.clone(),
            single_still_frame: case.single_still_frame,
        };

        let resolved = resolve_frame_range(
            &config,
            case.scene_defaults.start,
            case.scene_defaults.end,
            case.scene_defaults.step,
        )
        .unwrap();

        assert_eq!(
            resolved.frames.len(),
            case.expected_count,
            "Count mismatch in mode '{}'",
            case.name
        );
        assert_eq!(
            resolved.is_continuous, case.expected_continuous,
            "Continuity mismatch in mode '{}'",
            case.name
        );
        assert_eq!(
            resolved.summary, case.expected_summary,
            "Summary mismatch in mode '{}'",
            case.name
        );
        if let Some(ref exp_frames) = case.expected_frames {
            assert_eq!(
                &resolved.frames, exp_frames,
                "Frames mismatch in mode '{}'",
                case.name
            );
        }
    }

    for case in &fixtures.format_validations {
        assert_eq!(
            is_format_video(&case.format),
            case.is_video,
            "Video format mismatch for {}",
            case.format
        );
    }
}

#[test]
fn test_golden_token_expander() {
    let json_str = include_str!("../../../tests/golden/token_expander.json");
    let cases: Vec<TokenExpanderCase> =
        serde_json::from_str(json_str).expect("Valid token_expander.json schema");

    for case in &cases {
        let ctx = TokenContext {
            project: case.context.project.clone(),
            scene: case.context.scene.clone(),
            camera: case.context.camera.clone(),
            frame: case.context.frame,
        };

        let result = if case.is_preview {
            preview_tokens(&case.template, &ctx)
        } else {
            expand_tokens(&case.template, &ctx)
        };

        assert_eq!(result, case.expected, "Mismatch in '{}'", case.name);
    }
}

#[test]
fn test_all_golden_json_fixtures_parse() {
    let files = [
        include_str!("../../../tests/golden/frame_ranges.json"),
        include_str!("../../../tests/golden/token_expander.json"),
        include_str!("../../../tests/golden/stdout_samples.json"),
        include_str!("../../../tests/golden/inspect_sample.json"),
        include_str!("../../../tests/golden/override_diff.json"),
        include_str!("../../../tests/golden/queue_state_v0.json"),
        include_str!("../../../tests/golden/history_entry.json"),
        include_str!("../../../tests/golden/preflight_cases.json"),
    ];

    for (idx, content) in files.iter().enumerate() {
        let v: serde_json::Value = serde_json::from_str(content)
            .unwrap_or_else(|e| panic!("Fixture {} failed: {}", idx, e));
        assert!(v.is_object() || v.is_array());
    }
}

#[derive(Debug, Deserialize)]
struct GoldenStdoutFixtures {
    single_line_samples: Vec<StdoutLineCase>,
    multi_line_stream_samples: Vec<StdoutStreamCase>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct StdoutLineCase {
    name: String,
    line: String,
    #[serde(default)]
    expected_kind: Option<String>,
    #[serde(default)]
    expected_is_error: bool,
    #[serde(default)]
    expected_error: Option<String>,
    #[serde(default)]
    expected_progress: Option<serde_json::Value>,
    #[serde(default)]
    expected_saved_path: Option<String>,
    #[serde(default)]
    expected_text: Option<String>,
    #[serde(default)]
    expected_event: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct StdoutStreamCase {
    name: String,
    lines: Vec<String>,
    #[serde(default)]
    expected_version: Option<String>,
}

#[test]
fn test_golden_stdout_samples() {
    let json_str = include_str!("../../../tests/golden/stdout_samples.json");
    let fixtures: GoldenStdoutFixtures =
        serde_json::from_str(json_str).expect("Valid stdout_samples.json");

    for case in &fixtures.single_line_samples {
        if case.expected_is_error {
            let res = parse_stdout_line(&case.line);
            assert!(
                res.is_err(),
                "Expected error for '{}' in '{}'",
                case.line,
                case.name
            );
            continue;
        }

        let parsed = parse_stdout_line(&case.line).unwrap_or_else(|e| {
            panic!("Failed parsing '{}' in '{}': {:?}", case.line, case.name, e)
        });

        match case.expected_kind.as_deref().unwrap_or("text") {
            "progress" => match parsed {
                ParsedLine::Progress(p) => {
                    let exp = case.expected_progress.as_ref().unwrap();
                    if let Some(exp_frame) = exp.get("frame").and_then(|v| v.as_i64()) {
                        assert_eq!(
                            p.frame,
                            Some(exp_frame as i32),
                            "Frame mismatch in '{}'",
                            case.name
                        );
                    }
                    if let Some(exp_mem) = exp.get("memory").and_then(|v| v.as_str()) {
                        assert_eq!(
                            p.memory.as_deref(),
                            Some(exp_mem),
                            "Memory mismatch in '{}'",
                            case.name
                        );
                    }
                    if let Some(exp_peak) = exp.get("peakMemory").and_then(|v| v.as_str()) {
                        assert_eq!(
                            p.peak_memory.as_deref(),
                            Some(exp_peak),
                            "Peak memory mismatch in '{}'",
                            case.name
                        );
                    }
                    if let Some(exp_time) = exp.get("time").and_then(|v| v.as_str()) {
                        assert_eq!(
                            p.time.as_deref(),
                            Some(exp_time),
                            "Time mismatch in '{}'",
                            case.name
                        );
                    }
                    if let Some(exp_samples) = exp.get("samples") {
                        let s = p.samples.expect("samples should be present");
                        assert_eq!(
                            s.current as i64,
                            exp_samples["current"].as_i64().unwrap(),
                            "Samples current mismatch in '{}'",
                            case.name
                        );
                        assert_eq!(
                            s.total as i64,
                            exp_samples["total"].as_i64().unwrap(),
                            "Samples total mismatch in '{}'",
                            case.name
                        );
                    }
                }
                other => panic!("Expected Progress, got {:?} in '{}'", other, case.name),
            },
            "saved" => match parsed {
                ParsedLine::Saved(path) => {
                    assert_eq!(
                        Some(path),
                        case.expected_saved_path,
                        "Saved path mismatch in '{}'",
                        case.name
                    );
                }
                other => panic!("Expected Saved, got {:?} in '{}'", other, case.name),
            },
            "text" => match parsed {
                ParsedLine::Text(txt) => {
                    if let Some(ref exp_txt) = case.expected_text {
                        assert_eq!(&txt, exp_txt, "Text mismatch in '{}'", case.name);
                    }
                }
                other => panic!("Expected Text, got {:?} in '{}'", other, case.name),
            },
            "event" => match parsed {
                ParsedLine::Event(ev) => {
                    let exp_val = case.expected_event.as_ref().unwrap();
                    let serialized = serde_json::to_value(&ev).unwrap();
                    assert_eq!(
                        serialized["type"], exp_val["type"],
                        "Event type mismatch in '{}'",
                        case.name
                    );
                }
                other => panic!("Expected Event, got {:?} in '{}'", other, case.name),
            },
            other => panic!("Unknown expected kind: {}", other),
        }
    }

    // Stream test for two-frame sequence
    let stream_case = &fixtures.multi_line_stream_samples[0];
    let str_refs: Vec<&str> = stream_case.lines.iter().map(|s| s.as_str()).collect();
    let stream_parsed = parse_stdout_stream(&str_refs);
    assert_eq!(stream_parsed.len(), stream_case.lines.len());

    let saved_count = stream_parsed
        .iter()
        .filter(|p| matches!(p, ParsedLine::Saved(_)))
        .count();
    assert_eq!(saved_count, 2);

    let event_count = stream_parsed
        .iter()
        .filter(|p| matches!(p, ParsedLine::Event(_)))
        .count();
    assert_eq!(event_count, 8);
}

#[derive(Debug, Deserialize)]
struct GoldenOverrideDiffFixtures {
    property_modified_cases: Vec<PropModifiedCase>,
    compute_diff_cases: Vec<ComputeDiffCase>,
    engine_relevance_cases: Vec<EngineRelevanceCase>,
    filter_overrides_cases: Vec<FilterOverridesCase>,
}

#[derive(Debug, Deserialize)]
struct PropModifiedCase {
    path: String,
    a: serde_json::Value,
    b: serde_json::Value,
    expected_modified: bool,
}

#[derive(Debug, Deserialize)]
struct ComputeDiffCase {
    name: String,
    current: HashMap<String, serde_json::Value>,
    defaults: HashMap<String, serde_json::Value>,
    expected_diff: OverrideMap,
}

#[derive(Debug, Deserialize)]
struct EngineRelevanceCase {
    path: String,
    engine: String,
    expected_relevant: bool,
}

#[derive(Debug, Deserialize)]
struct FilterOverridesCase {
    name: String,
    overrides: OverrideMap,
    engine: String,
    expected_applicable: OverrideMap,
}

#[test]
fn test_golden_override_diff() {
    let json_str = include_str!("../../../tests/golden/override_diff.json");
    let fixtures: GoldenOverrideDiffFixtures =
        serde_json::from_str(json_str).expect("Valid override_diff.json");

    for case in &fixtures.property_modified_cases {
        let res = is_property_modified(&case.path, &case.a, &case.b);
        assert_eq!(
            res, case.expected_modified,
            "Mismatch for path '{}'",
            case.path
        );
    }

    for case in &fixtures.compute_diff_cases {
        let diff = compute_override_diff(&case.current, &case.defaults);
        assert_eq!(diff, case.expected_diff, "Diff mismatch in '{}'", case.name);
    }

    for case in &fixtures.engine_relevance_cases {
        let rel = is_property_relevant_to_engine(&case.path, &case.engine);
        assert_eq!(
            rel, case.expected_relevant,
            "Relevance mismatch for path '{}' engine '{}'",
            case.path, case.engine
        );
    }

    for case in &fixtures.filter_overrides_cases {
        let filtered = filter_overrides_for_active_engine(&case.overrides, &case.engine);
        assert_eq!(
            filtered, case.expected_applicable,
            "Filtered mismatch in '{}'",
            case.name
        );
    }
}

#[test]
fn test_golden_schema_fixtures() {
    let json_str = include_str!("../../../tests/golden/schema_fixtures.json");
    let val: serde_json::Value =
        serde_json::from_str(json_str).expect("Valid schema_fixtures.json");

    // 1. InspectOutput normal
    let inspect_normal: InspectOutput =
        serde_json::from_value(val["inspect_output_sample"].clone())
            .expect("inspect_output_sample should deserialize into InspectOutput");
    assert_eq!(inspect_normal.schema_version, 1);
    assert_eq!(inspect_normal.blender_version, "4.2.0");
    assert_eq!(inspect_normal.scenes.len(), 1);
    assert_eq!(inspect_normal.scenes[0].resolution_x, 1920);

    // 2. InspectOutput partial (Basic mode with errors)
    let inspect_partial: InspectOutput =
        serde_json::from_value(val["inspect_output_partial_basic_mode"].clone())
            .expect("inspect_output_partial_basic_mode should deserialize into InspectOutput");
    assert!(inspect_partial.errors.is_some());
    assert_eq!(inspect_partial.errors.as_ref().unwrap().len(), 2);

    // 3. Preset
    let preset: Preset = serde_json::from_value(val["preset_fixture"].clone())
        .expect("preset_fixture should deserialize into Preset");
    assert_eq!(preset.name, "1080p / 256 samples / PNG 16-bit");
    assert_eq!(preset.overrides["scene.cycles.samples"], 256);

    // 4. RunnerPayload
    let payload: RunnerPayload = serde_json::from_value(val["runner_payload_fixture"].clone())
        .expect("runner_payload_fixture should deserialize into RunnerPayload");
    assert_eq!(payload.blend_path, "/scenes/test.blend");
    assert_eq!(payload.frames, vec![1, 2, 3]);

    // 5. HistoryEntry
    let history: HistoryEntry = serde_json::from_value(val["history_entry_fixture"].clone())
        .expect("history_entry_fixture should deserialize into HistoryEntry");
    assert_eq!(history.file_name, "scene.blend");
    assert_eq!(history.frame_count, 150);
}

#[test]
fn test_schemars_schema_contracts() {
    let inspect_schema = schema_for!(InspectOutput);
    let payload_schema = schema_for!(RunnerPayload);
    let queue_schema = schema_for!(QueueState);
    let preset_schema = schema_for!(Preset);
    let history_schema = schema_for!(HistoryEntry);

    assert_eq!(
        inspect_schema
            .schema
            .metadata
            .as_ref()
            .unwrap()
            .title
            .as_deref(),
        Some("InspectOutput")
    );
    assert_eq!(
        payload_schema
            .schema
            .metadata
            .as_ref()
            .unwrap()
            .title
            .as_deref(),
        Some("RunnerPayload")
    );
    assert_eq!(
        queue_schema
            .schema
            .metadata
            .as_ref()
            .unwrap()
            .title
            .as_deref(),
        Some("QueueState")
    );
    assert_eq!(
        preset_schema
            .schema
            .metadata
            .as_ref()
            .unwrap()
            .title
            .as_deref(),
        Some("Preset")
    );
    assert_eq!(
        history_schema
            .schema
            .metadata
            .as_ref()
            .unwrap()
            .title
            .as_deref(),
        Some("HistoryEntry")
    );
}
