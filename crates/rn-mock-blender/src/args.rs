use crate::scenarios::MockScenario;
use std::path::PathBuf;
use std::str::FromStr;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BlenderArgs {
    pub version: bool,
    pub background: bool,
    pub blend_file: Option<PathBuf>,
    pub python_script: Option<PathBuf>,
    pub python_args: Vec<String>,
    pub factory_startup: bool,
    pub autoexec: Option<bool>,
    pub threads: Option<u32>,
    pub start_frame: Option<i32>,
    pub end_frame: Option<i32>,
    pub frame_step: Option<i32>,
    pub output_pattern: Option<String>,
    pub format: Option<String>,
    pub render_animation: bool,
    pub render_still: Option<i32>,
    pub mock_scenario: Option<MockScenario>,
}

impl BlenderArgs {
    pub fn parse<I, T>(args_iter: I) -> Result<Self, String>
    where
        I: IntoIterator<Item = T>,
        T: AsRef<str>,
    {
        let raw_args: Vec<String> = args_iter
            .into_iter()
            .map(|s| s.as_ref().to_string())
            .collect();
        let mut parsed = BlenderArgs::default();

        // 1. Separate before and after `--`
        let (blender_tokens, py_tokens) = if let Some(pos) = raw_args.iter().position(|a| a == "--")
        {
            (&raw_args[..pos], &raw_args[pos + 1..])
        } else {
            (&raw_args[..], &[][..])
        };

        parsed.python_args = py_tokens.to_vec();

        let mut idx = 0;
        while idx < blender_tokens.len() {
            let token = &blender_tokens[idx];

            match token.as_str() {
                "--version" | "-v" => {
                    parsed.version = true;
                    idx += 1;
                }
                "-b" | "--background" => {
                    parsed.background = true;
                    // Check if followed by a blend file path (that doesn't start with '-')
                    if idx + 1 < blender_tokens.len() && !blender_tokens[idx + 1].starts_with('-') {
                        parsed.blend_file = Some(PathBuf::from(&blender_tokens[idx + 1]));
                        idx += 2;
                    } else {
                        idx += 1;
                    }
                }
                "-P" | "--python" => {
                    if idx + 1 < blender_tokens.len() {
                        parsed.python_script = Some(PathBuf::from(&blender_tokens[idx + 1]));
                        idx += 2;
                    } else {
                        return Err("Missing argument for -P/--python".to_string());
                    }
                }
                "--factory-startup" => {
                    parsed.factory_startup = true;
                    idx += 1;
                }
                "--enable-autoexec" => {
                    parsed.autoexec = Some(true);
                    idx += 1;
                }
                "--disable-autoexec" => {
                    parsed.autoexec = Some(false);
                    idx += 1;
                }
                "-t" | "--threads" => {
                    if idx + 1 < blender_tokens.len() {
                        let t = blender_tokens[idx + 1].parse::<u32>().map_err(|e| {
                            format!("Invalid thread count '{}': {e}", blender_tokens[idx + 1])
                        })?;
                        parsed.threads = Some(t);
                        idx += 2;
                    } else {
                        return Err("Missing argument for -t/--threads".to_string());
                    }
                }
                "-s" | "--frame-start" => {
                    if idx + 1 < blender_tokens.len() {
                        let s = blender_tokens[idx + 1].parse::<i32>().map_err(|e| {
                            format!("Invalid start frame '{}': {e}", blender_tokens[idx + 1])
                        })?;
                        parsed.start_frame = Some(s);
                        idx += 2;
                    } else {
                        return Err("Missing argument for -s/--frame-start".to_string());
                    }
                }
                "-e" | "--frame-end" => {
                    if idx + 1 < blender_tokens.len() {
                        let e = blender_tokens[idx + 1].parse::<i32>().map_err(|err| {
                            format!("Invalid end frame '{}': {err}", blender_tokens[idx + 1])
                        })?;
                        parsed.end_frame = Some(e);
                        idx += 2;
                    } else {
                        return Err("Missing argument for -e/--frame-end".to_string());
                    }
                }
                "-j" | "--frame-jump" => {
                    if idx + 1 < blender_tokens.len() {
                        let j = blender_tokens[idx + 1].parse::<i32>().map_err(|err| {
                            format!("Invalid frame step '{}': {err}", blender_tokens[idx + 1])
                        })?;
                        parsed.frame_step = Some(j);
                        idx += 2;
                    } else {
                        return Err("Missing argument for -j/--frame-jump".to_string());
                    }
                }
                "-o" | "--render-output" => {
                    if idx + 1 < blender_tokens.len() {
                        parsed.output_pattern = Some(blender_tokens[idx + 1].clone());
                        idx += 2;
                    } else {
                        return Err("Missing argument for -o/--render-output".to_string());
                    }
                }
                "-F" | "--render-format" => {
                    if idx + 1 < blender_tokens.len() {
                        parsed.format = Some(blender_tokens[idx + 1].clone());
                        idx += 2;
                    } else {
                        return Err("Missing argument for -F/--render-format".to_string());
                    }
                }
                "-a" | "--render-anim" => {
                    parsed.render_animation = true;
                    idx += 1;
                }
                "-f" | "--render-frame" => {
                    if idx + 1 < blender_tokens.len() {
                        let f = blender_tokens[idx + 1].parse::<i32>().map_err(|err| {
                            format!("Invalid still frame '{}': {err}", blender_tokens[idx + 1])
                        })?;
                        parsed.render_still = Some(f);
                        idx += 2;
                    } else {
                        return Err("Missing argument for -f/--render-frame".to_string());
                    }
                }
                "--mock-scenario" => {
                    if idx + 1 < blender_tokens.len() {
                        let sc = MockScenario::from_str(&blender_tokens[idx + 1])?;
                        parsed.mock_scenario = Some(sc);
                        idx += 2;
                    } else {
                        return Err("Missing argument for --mock-scenario".to_string());
                    }
                }
                other => {
                    // Check if it's a positional blend file argument (not starting with '-')
                    if !other.starts_with('-') && parsed.blend_file.is_none() {
                        parsed.blend_file = Some(PathBuf::from(other));
                    }
                    idx += 1;
                }
            }
        }

        Ok(parsed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_version() {
        let args = BlenderArgs::parse(["--version"]).unwrap();
        assert!(args.version);
    }

    #[test]
    fn test_parse_inspect_flags() {
        let input = [
            "-b",
            "scene.blend",
            "--factory-startup",
            "--enable-autoexec",
            "-P",
            "inspect_blend.py",
            "--",
            "output.json",
        ];
        let args = BlenderArgs::parse(input).unwrap();
        assert!(args.background);
        assert_eq!(args.blend_file, Some(PathBuf::from("scene.blend")));
        assert!(args.factory_startup);
        assert_eq!(args.autoexec, Some(true));
        assert_eq!(args.python_script, Some(PathBuf::from("inspect_blend.py")));
        assert_eq!(args.python_args, vec!["output.json"]);
    }

    #[test]
    fn test_parse_render_runner_flags() {
        let input = [
            "-b",
            "scene.blend",
            "-t",
            "16",
            "-P",
            "render_runner.py",
            "--mock-scenario",
            "crash_114",
            "--",
            "payload.json",
        ];
        let args = BlenderArgs::parse(input).unwrap();
        assert!(args.background);
        assert_eq!(args.threads, Some(16));
        assert_eq!(args.python_script, Some(PathBuf::from("render_runner.py")));
        assert_eq!(args.mock_scenario, Some(MockScenario::Crash114));
        assert_eq!(args.python_args, vec!["payload.json"]);
    }

    #[test]
    fn test_parse_standard_render_flags() {
        let input = [
            "-b",
            "my_project.blend",
            "-o",
            "//renders/frame_####.png",
            "-F",
            "PNG",
            "-s",
            "10",
            "-e",
            "20",
            "-j",
            "2",
            "-a",
        ];
        let args = BlenderArgs::parse(input).unwrap();
        assert!(args.background);
        assert_eq!(args.blend_file, Some(PathBuf::from("my_project.blend")));
        assert_eq!(
            args.output_pattern,
            Some("//renders/frame_####.png".to_string())
        );
        assert_eq!(args.format, Some("PNG".to_string()));
        assert_eq!(args.start_frame, Some(10));
        assert_eq!(args.end_frame, Some(20));
        assert_eq!(args.frame_step, Some(2));
        assert!(args.render_animation);
    }
}
