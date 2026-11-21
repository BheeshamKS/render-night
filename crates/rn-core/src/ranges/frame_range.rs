use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum FrameRangeMode {
    #[default]
    SceneDefault,
    Simple,
    Custom,
    SingleStill,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SimpleRange {
    pub start: i32,
    pub end: i32,
    #[serde(default = "default_step")]
    pub step: i32,
}

fn default_step() -> i32 {
    1
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct FrameRangeConfig {
    #[serde(default)]
    pub mode: FrameRangeMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub simple: Option<SimpleRange>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_expression: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub single_still_frame: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ResolvedFrameRange {
    pub frames: Vec<i32>,
    pub is_continuous: bool,
    pub summary: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum RangeParseError {
    #[error("Empty frame expression")]
    Empty,
    #[error("Invalid frame token: \"{0}\"")]
    InvalidToken(String),
    #[error("Empty frame token in expression")]
    EmptyToken,
    #[error("Step must be a positive integer")]
    InvalidStep(i32),
}

pub fn parse_custom_range(expression: &str) -> Result<Vec<i32>, RangeParseError> {
    let trimmed = expression.trim();
    if trimmed.is_empty() {
        return Err(RangeParseError::Empty);
    }

    let mut frame_set = BTreeSet::new();

    for raw_seg in trimmed.split(',') {
        let seg = raw_seg.trim();
        if seg.is_empty() {
            return Err(RangeParseError::EmptyToken);
        }

        // 1. Check for step suffix 'x<step>' or 'X<step>'
        let (base, step) = if let Some(x_idx) = seg.rfind(['x', 'X']) {
            let base_part = seg[..x_idx].trim();
            let step_part = seg[x_idx + 1..].trim();
            let parsed_step: i32 = step_part
                .parse()
                .map_err(|_| RangeParseError::InvalidToken(seg.to_string()))?;
            if parsed_step <= 0 {
                return Err(RangeParseError::InvalidStep(parsed_step));
            }
            (base_part, parsed_step)
        } else {
            (seg, 1)
        };

        // 2. Check if range (<start>-<end>) taking care of negative numbers
        if let Some((start, end)) = parse_range_bounds(base) {
            let low = std::cmp::min(start, end);
            let high = std::cmp::max(start, end);
            let mut f = low;
            while f <= high {
                frame_set.insert(f);
                f = match f.checked_add(step) {
                    Some(next) => next,
                    None => break,
                };
            }
            continue;
        }

        // 3. Single frame number
        if let Ok(f) = base.parse::<i32>() {
            frame_set.insert(f);
            continue;
        }

        return Err(RangeParseError::InvalidToken(seg.to_string()));
    }

    Ok(frame_set.into_iter().collect())
}

/// Helper parsing `([+-]?\d+)\s*-\s*([+-]?\d+)`
fn parse_range_bounds(base: &str) -> Option<(i32, i32)> {
    let trimmed = base.trim();
    let bytes = trimmed.as_bytes();
    if bytes.is_empty() {
        return None;
    }

    // A range separator '-' must appear after the first number (optional sign + at least one digit)
    let mut start_idx = 0;
    if bytes[0] == b'+' || bytes[0] == b'-' {
        start_idx = 1;
    }
    let mut first_digit_end = None;
    for (i, &b) in bytes.iter().enumerate().skip(start_idx) {
        if b.is_ascii_digit() {
            first_digit_end = Some(i + 1);
        } else {
            break;
        }
    }
    let after_first_digits = first_digit_end?;

    // Find the dash separator after the first number's digits
    let rem = &trimmed[after_first_digits..];
    let dash_pos_in_rem = rem.find('-')?;
    let dash_abs_pos = after_first_digits + dash_pos_in_rem;

    let part_a = trimmed[..dash_abs_pos].trim();
    let part_b = trimmed[dash_abs_pos + 1..].trim();

    let a = part_a.parse::<i32>().ok()?;
    let b = part_b.parse::<i32>().ok()?;

    Some((a, b))
}

pub fn resolve_frame_range(
    config: &FrameRangeConfig,
    scene_start: i32,
    scene_end: i32,
    scene_step: i32,
) -> Result<ResolvedFrameRange, RangeParseError> {
    let frames = match config.mode {
        FrameRangeMode::SceneDefault => {
            let step = std::cmp::max(1, scene_step);
            let low = std::cmp::min(scene_start, scene_end);
            let high = std::cmp::max(scene_start, scene_end);
            let mut list = Vec::new();
            let mut f = low;
            while f <= high {
                list.push(f);
                f = match f.checked_add(step) {
                    Some(next) => next,
                    None => break,
                };
            }
            list
        }
        FrameRangeMode::Simple => {
            let (start, end, step) = if let Some(ref s) = config.simple {
                (s.start, s.end, std::cmp::max(1, s.step))
            } else {
                (scene_start, scene_end, std::cmp::max(1, scene_step))
            };
            let low = std::cmp::min(start, end);
            let high = std::cmp::max(start, end);
            let mut list = Vec::new();
            let mut f = low;
            while f <= high {
                list.push(f);
                f = match f.checked_add(step) {
                    Some(next) => next,
                    None => break,
                };
            }
            list
        }
        FrameRangeMode::SingleStill => {
            vec![config.single_still_frame.unwrap_or(scene_start)]
        }
        FrameRangeMode::Custom => {
            if let Some(ref expr) = config.custom_expression {
                if !expr.trim().is_empty() {
                    parse_custom_range(expr)?
                } else {
                    parse_custom_range(&format!("{}-{}", scene_start, scene_end))?
                }
            } else {
                parse_custom_range(&format!("{}-{}", scene_start, scene_end))?
            }
        }
    };

    let total_count = frames.len();
    let mut is_continuous = true;
    if total_count > 1 {
        for i in 1..total_count {
            if frames[i] != frames[i - 1] + 1 {
                is_continuous = false;
                break;
            }
        }
    }

    let summary = match total_count {
        0 => "0 frames".to_string(),
        1 => format!("Frame {}", frames[0]),
        _ => format!(
            "{} frames ({}..{})",
            total_count,
            frames[0],
            frames[total_count - 1]
        ),
    };

    Ok(ResolvedFrameRange {
        frames,
        is_continuous,
        summary,
    })
}

pub fn is_format_video(format: &str) -> bool {
    let clean = format.trim().to_uppercase();
    matches!(
        clean.as_str(),
        "FFMPEG"
            | "AVI_JPEG"
            | "AVI_RAW"
            | "THEORA"
            | "QUICKTIME"
            | "H264"
            | "MPEG"
            | "MP4"
            | "MKV"
    )
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RangeValidationResult {
    pub valid: bool,
    pub reason: Option<String>,
}

pub fn validate_range_for_format(
    range: &ResolvedFrameRange,
    mode: FrameRangeMode,
    format: Option<&str>,
) -> RangeValidationResult {
    if let Some(fmt) = format {
        if is_format_video(fmt) {
            if range.frames.is_empty() {
                return RangeValidationResult {
                    valid: false,
                    reason: Some(
                        "Video formats require at least 2 sequential frames to encode an animation."
                            .to_string(),
                    ),
                };
            }
            if mode == FrameRangeMode::SingleStill || range.frames.len() == 1 {
                return RangeValidationResult {
                    valid: false,
                    reason: Some(
                        "Single still frames cannot be rendered to a video container. Switch format to an image format or select a continuous frame range."
                            .to_string(),
                    ),
                };
            }
            if !range.is_continuous {
                return RangeValidationResult {
                    valid: false,
                    reason: Some(
                        "Video formats require continuous sequential frames. Custom discontinuous ranges and stepped skipping are only supported for image formats."
                            .to_string(),
                    ),
                };
            }
        }
    }

    RangeValidationResult {
        valid: true,
        reason: None,
    }
}
