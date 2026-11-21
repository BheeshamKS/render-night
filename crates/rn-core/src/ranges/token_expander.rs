use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokenContext {
    pub project: String,
    pub scene: String,
    pub camera: String,
    pub frame: Option<i32>,
}

pub fn expand_tokens(template: &str, ctx: &TokenContext) -> String {
    if template.is_empty() {
        return String::new();
    }

    let mut out = template
        .replace("{project}", &ctx.project)
        .replace("{scene}", &ctx.scene)
        .replace("{camera}", &ctx.camera);

    if let Some(frame) = ctx.frame {
        out = replace_hashes(&out, frame);
    }

    out
}

pub fn preview_tokens(template: &str, ctx: &TokenContext) -> String {
    let mut preview_ctx = ctx.clone();
    if preview_ctx.frame.is_none() {
        preview_ctx.frame = Some(1);
    }
    expand_tokens(template, &preview_ctx)
}

fn replace_hashes(input: &str, frame: i32) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '#' {
            let mut count = 1;
            while let Some(&'#') = chars.peek() {
                chars.next();
                count += 1;
            }
            if frame < 0 {
                let abs_val = frame.unsigned_abs();
                result.push('-');
                result.push_str(&format!("{:0width$}", abs_val, width = count));
            } else {
                result.push_str(&format!("{:0width$}", frame, width = count));
            }
        } else {
            result.push(c);
        }
    }

    result
}
