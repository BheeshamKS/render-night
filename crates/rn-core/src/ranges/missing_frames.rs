use super::token_expander::{expand_tokens, TokenContext};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MissingFramesResult {
    pub missing_frames: Vec<i32>,
    pub existing_frames: Vec<i32>,
}

pub fn filter_missing_frames_with<F>(
    frames: &[i32],
    output_pattern: &str,
    output_dir: &Path,
    ctx: Option<&TokenContext>,
    exists_fn: F,
) -> (Vec<i32>, Vec<i32>)
where
    F: Fn(&Path) -> bool,
{
    let mut missing_frames = Vec::new();
    let mut existing_frames = Vec::new();

    for &frame in frames {
        let frame_file = if output_pattern.is_empty() {
            if frame < 0 {
                format!("frame_-{:04}.png", frame.unsigned_abs())
            } else {
                format!("frame_{:04}.png", frame)
            }
        } else if let Some(context) = ctx {
            let mut frame_ctx = context.clone();
            frame_ctx.frame = Some(frame);
            expand_tokens(output_pattern, &frame_ctx)
        } else if output_pattern.contains('#') {
            let dummy_ctx = TokenContext {
                frame: Some(frame),
                ..Default::default()
            };
            expand_tokens(output_pattern, &dummy_ctx)
        } else {
            output_pattern.to_string()
        };

        let full_path = if Path::new(&frame_file).is_absolute() {
            PathBuf::from(frame_file)
        } else {
            output_dir.join(frame_file)
        };

        if exists_fn(&full_path) {
            existing_frames.push(frame);
        } else {
            missing_frames.push(frame);
        }
    }

    (missing_frames, existing_frames)
}

pub fn filter_missing_frames(
    frames: &[i32],
    output_pattern: &str,
    output_dir: &Path,
    ctx: Option<&TokenContext>,
) -> (Vec<i32>, Vec<i32>) {
    filter_missing_frames_with(frames, output_pattern, output_dir, ctx, |p| {
        std::fs::metadata(p)
            .map(|m| m.is_file() && m.len() > 0)
            .unwrap_or(false)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn test_missing_frames_mock() {
        let mut existing = HashSet::new();
        existing.insert(PathBuf::from("/renders/shot_0001.png"));
        existing.insert(PathBuf::from("/renders/shot_0003.png"));

        let frames = vec![1, 2, 3, 4];
        let (missing, found) = filter_missing_frames_with(
            &frames,
            "shot_####.png",
            Path::new("/renders"),
            None,
            |p| existing.contains(p),
        );

        assert_eq!(missing, vec![2, 4]);
        assert_eq!(found, vec![1, 3]);
    }

    #[test]
    fn test_missing_frames_default_pattern() {
        let mut existing = HashSet::new();
        existing.insert(PathBuf::from("/out/frame_0005.png"));

        let frames = vec![5, 6];
        let (missing, found) =
            filter_missing_frames_with(&frames, "", Path::new("/out"), None, |p| {
                existing.contains(p)
            });

        assert_eq!(missing, vec![6]);
        assert_eq!(found, vec![5]);
    }
}
