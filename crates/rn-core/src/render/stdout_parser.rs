use regex::Regex;
use std::sync::OnceLock;
use thiserror::Error;

use crate::schemas::{runner_event::RN_EVENT_PREFIX, RunnerEvent};

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SamplesProgress {
    pub current: u32,
    pub total: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct StdoutProgress {
    pub frame: Option<i32>,
    pub memory: Option<String>,
    pub peak_memory: Option<String>,
    pub time: Option<String>,
    pub remaining: Option<String>,
    pub samples: Option<SamplesProgress>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ParsedLine {
    Event(RunnerEvent),
    Progress(StdoutProgress),
    Saved(String),
    Text(String),
}

#[derive(Debug, Error)]
pub enum StdoutParseError {
    #[error("Invalid RN_EVENT JSON: {0}")]
    InvalidEventJson(String),
    #[error("Invalid RN_EVENT payload: {0}")]
    InvalidEventPayload(String),
}

static FRA_RE: OnceLock<Regex> = OnceLock::new();
static MEM_RE: OnceLock<Regex> = OnceLock::new();
static PEAK_RE: OnceLock<Regex> = OnceLock::new();
static TIME_RE: OnceLock<Regex> = OnceLock::new();
static REM_RE: OnceLock<Regex> = OnceLock::new();
static SAMPLES_RE1: OnceLock<Regex> = OnceLock::new();
static SAMPLES_RE2: OnceLock<Regex> = OnceLock::new();
static SAVED_RE: OnceLock<Regex> = OnceLock::new();

fn fra_re() -> &'static Regex {
    FRA_RE.get_or_init(|| Regex::new(r"Fra:(\d+)").unwrap())
}
fn mem_re() -> &'static Regex {
    MEM_RE.get_or_init(|| Regex::new(r"Mem:([0-9.]+[KkMmGgTt]?[Bb]?)").unwrap())
}
fn peak_re() -> &'static Regex {
    PEAK_RE.get_or_init(|| Regex::new(r"(?i)(?:\(Peak\s*|Peak:)([0-9.]+[KkMmGgTt]?[Bb]?)").unwrap())
}
fn time_re() -> &'static Regex {
    TIME_RE.get_or_init(|| Regex::new(r"Time:([0-9:.]+)").unwrap())
}
fn rem_re() -> &'static Regex {
    REM_RE.get_or_init(|| Regex::new(r"Remaining:([0-9:.]+)").unwrap())
}
fn samples_re1() -> &'static Regex {
    SAMPLES_RE1.get_or_init(|| Regex::new(r"(?i)Rendered\s*(\d+)/(\d+)\s*Samples").unwrap())
}
fn samples_re2() -> &'static Regex {
    SAMPLES_RE2.get_or_init(|| Regex::new(r"(?i)Sample\s*(\d+)/(\d+)").unwrap())
}
fn saved_re() -> &'static Regex {
    SAVED_RE.get_or_init(|| Regex::new(r#"^Saved:\s*['"]?([^'"]+)['"]?\s*$"#).unwrap())
}

/// Parse a single line of Blender stdout.
pub fn parse_stdout_line(line: &str) -> Result<ParsedLine, StdoutParseError> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Ok(ParsedLine::Text(String::new()));
    }

    // 1. Structured RN_EVENT lines
    if let Some(rest) = trimmed.strip_prefix(RN_EVENT_PREFIX) {
        let json_str = rest.trim();
        if json_str.is_empty() {
            return Ok(ParsedLine::Text(trimmed.to_string()));
        }
        let event: RunnerEvent = serde_json::from_str(json_str)
            .map_err(|e| StdoutParseError::InvalidEventJson(format!("{}: {}", json_str, e)))?;
        return Ok(ParsedLine::Event(event));
    }

    // 2. Saved line
    if let Some(caps) = saved_re().captures(trimmed) {
        if let Some(m) = caps.get(1) {
            return Ok(ParsedLine::Saved(m.as_str().trim().to_string()));
        }
    }

    // 3. Native progress line (Fra:, Mem:, Time:, Remaining:, Sample x/y)
    let fra_cap = fra_re().captures(trimmed);
    let mem_cap = mem_re().captures(trimmed);
    let peak_cap = peak_re().captures(trimmed);
    let time_cap = time_re().captures(trimmed);
    let rem_cap = rem_re().captures(trimmed);
    let samples_cap = samples_re1()
        .captures(trimmed)
        .or_else(|| samples_re2().captures(trimmed));

    if fra_cap.is_some()
        || mem_cap.is_some()
        || peak_cap.is_some()
        || time_cap.is_some()
        || rem_cap.is_some()
        || samples_cap.is_some()
    {
        let mut progress = StdoutProgress::default();

        if let Some(caps) = fra_cap {
            if let Some(m) = caps.get(1) {
                progress.frame = m.as_str().parse::<i32>().ok();
            }
        }
        if let Some(caps) = mem_cap {
            if let Some(m) = caps.get(1) {
                progress.memory = Some(m.as_str().to_string());
            }
        }
        if let Some(caps) = peak_cap {
            if let Some(m) = caps.get(1) {
                progress.peak_memory = Some(m.as_str().to_string());
            }
        }
        if let Some(caps) = time_cap {
            if let Some(m) = caps.get(1) {
                progress.time = Some(m.as_str().to_string());
            }
        }
        if let Some(caps) = rem_cap {
            if let Some(m) = caps.get(1) {
                progress.remaining = Some(m.as_str().to_string());
            }
        }
        if let Some(caps) = samples_cap {
            if let (Some(cur), Some(tot)) = (caps.get(1), caps.get(2)) {
                if let (Ok(c), Ok(t)) = (cur.as_str().parse::<u32>(), tot.as_str().parse::<u32>()) {
                    progress.samples = Some(SamplesProgress {
                        current: c,
                        total: t,
                    });
                }
            }
        }

        return Ok(ParsedLine::Progress(progress));
    }

    Ok(ParsedLine::Text(trimmed.to_string()))
}

/// Parse a stream of Blender stdout lines, tracking context between lines.
pub fn parse_stdout_stream(lines: &[&str]) -> Vec<ParsedLine> {
    let mut out = Vec::with_capacity(lines.len());
    let mut current_frame = None;

    for &line in lines {
        match parse_stdout_line(line) {
            Ok(mut parsed) => {
                match &mut parsed {
                    ParsedLine::Progress(p) => {
                        if let Some(f) = p.frame {
                            current_frame = Some(f);
                        } else if p.frame.is_none() {
                            p.frame = current_frame;
                        }
                    }
                    ParsedLine::Event(RunnerEvent::FrameStart { frame, .. }) => {
                        current_frame = Some(*frame);
                    }
                    _ => {}
                }
                out.push(parsed);
            }
            Err(_) => {
                out.push(ParsedLine::Text(line.trim().to_string()));
            }
        }
    }

    out
}

#[derive(Debug, Default)]
pub struct StdoutStreamParser {
    current_frame: Option<i32>,
}

impl StdoutStreamParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn parse_line(&mut self, line: &str) -> ParsedLine {
        match parse_stdout_line(line) {
            Ok(mut parsed) => {
                match &mut parsed {
                    ParsedLine::Progress(p) => {
                        if let Some(f) = p.frame {
                            self.current_frame = Some(f);
                        } else if p.frame.is_none() {
                            p.frame = self.current_frame;
                        }
                    }
                    ParsedLine::Event(RunnerEvent::FrameStart { frame, .. }) => {
                        self.current_frame = Some(*frame);
                    }
                    _ => {}
                }
                parsed
            }
            Err(_) => ParsedLine::Text(line.trim().to_string()),
        }
    }
}
