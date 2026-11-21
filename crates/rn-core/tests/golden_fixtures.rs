use rn_core::ranges::{
    expand_tokens, is_format_video, parse_custom_range, preview_tokens, resolve_frame_range,
    FrameRangeConfig, FrameRangeMode, SimpleRange, TokenContext,
};
use serde::Deserialize;

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
