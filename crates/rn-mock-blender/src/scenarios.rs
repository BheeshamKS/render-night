use serde::{Deserialize, Serialize};
use std::path::Path;
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MockScenario {
    Normal,
    Crash114,
    GpuOom,
    SlowControl,
    MissingAssets,
    InspectFailure,
}

impl FromStr for MockScenario {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let normalized = s.trim().to_lowercase().replace('-', "_");
        match normalized.as_str() {
            "normal" => Ok(MockScenario::Normal),
            "crash_114" | "crash114" => Ok(MockScenario::Crash114),
            "gpu_oom" | "gpuoom" => Ok(MockScenario::GpuOom),
            "slow_control" | "slowcontrol" | "slow" => Ok(MockScenario::SlowControl),
            "missing_assets" | "missingassets" => Ok(MockScenario::MissingAssets),
            "inspect_failure" | "inspectfailure" | "corrupt" | "fail" => {
                Ok(MockScenario::InspectFailure)
            }
            other => Err(format!("Unknown mock scenario: '{other}'")),
        }
    }
}

impl std::fmt::Display for MockScenario {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MockScenario::Normal => write!(f, "normal"),
            MockScenario::Crash114 => write!(f, "crash_114"),
            MockScenario::GpuOom => write!(f, "gpu_oom"),
            MockScenario::SlowControl => write!(f, "slow_control"),
            MockScenario::MissingAssets => write!(f, "missing_assets"),
            MockScenario::InspectFailure => write!(f, "inspect_failure"),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashConfig {
    pub frame: Option<i32>,
    pub frames: Option<Vec<i32>>,
    #[serde(default)]
    pub crash_gpu: Option<bool>,
    #[serde(default)]
    pub crash_cpu: Option<bool>,
}

impl CrashConfig {
    pub fn should_crash(&self, current_frame: i32, is_gpu: bool) -> bool {
        let matches_frame = if let Some(f) = self.frame {
            f == current_frame
        } else if let Some(ref list) = self.frames {
            list.contains(&current_frame)
        } else {
            false
        };

        if !matches_frame {
            return false;
        }

        if is_gpu {
            self.crash_gpu.unwrap_or(true)
        } else {
            self.crash_cpu.unwrap_or(true)
        }
    }
}

pub fn resolve_scenario(
    cli_scenario: Option<MockScenario>,
    env_scenario_var: Option<&str>,
    payload_crash_config: Option<&CrashConfig>,
    blend_path: Option<&Path>,
) -> MockScenario {
    // 1. Explicit CLI argument has highest priority
    if let Some(scenario) = cli_scenario {
        return scenario;
    }

    // 2. Environment variable
    if let Some(var_val) = env_scenario_var {
        if let Ok(parsed) = MockScenario::from_str(var_val) {
            return parsed;
        }
    }

    // 3. Payload crash config heuristics
    if let Some(config) = payload_crash_config {
        let triggers_114 =
            config.frame == Some(114) || config.frames.as_ref().is_some_and(|f| f.contains(&114));
        if triggers_114 {
            if config.crash_gpu != Some(false) && config.crash_cpu == Some(false) {
                return MockScenario::GpuOom;
            } else if config.crash_gpu != Some(false) && config.crash_cpu != Some(false) {
                return MockScenario::Crash114;
            }
        }
    }

    // 4. Blend file path heuristics
    if let Some(path) = blend_path {
        let path_str = path.to_string_lossy().to_lowercase();
        if path_str.contains("corrupt") || path_str.contains("fail") {
            return MockScenario::InspectFailure;
        }
    }

    // 5. Default
    MockScenario::Normal
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scenario_from_str() {
        assert_eq!(
            MockScenario::from_str("crash_114").unwrap(),
            MockScenario::Crash114
        );
        assert_eq!(
            MockScenario::from_str("crash-114").unwrap(),
            MockScenario::Crash114
        );
        assert_eq!(
            MockScenario::from_str("gpu_oom").unwrap(),
            MockScenario::GpuOom
        );
        assert_eq!(
            MockScenario::from_str("slow_control").unwrap(),
            MockScenario::SlowControl
        );
        assert_eq!(
            MockScenario::from_str("missing_assets").unwrap(),
            MockScenario::MissingAssets
        );
        assert_eq!(
            MockScenario::from_str("inspect_failure").unwrap(),
            MockScenario::InspectFailure
        );
    }

    #[test]
    fn test_scenario_resolution_priority() {
        // CLI overrides everything
        let res = resolve_scenario(
            Some(MockScenario::SlowControl),
            Some("crash_114"),
            None,
            Some(Path::new("corrupt.blend")),
        );
        assert_eq!(res, MockScenario::SlowControl);

        // Env overrides payload & path
        let res = resolve_scenario(
            None,
            Some("gpu_oom"),
            None,
            Some(Path::new("corrupt.blend")),
        );
        assert_eq!(res, MockScenario::GpuOom);

        // Corrupt path triggers InspectFailure
        let res = resolve_scenario(
            None,
            None,
            None,
            Some(Path::new("/scenes/corrupt_scene.blend")),
        );
        assert_eq!(res, MockScenario::InspectFailure);

        // Normal fallback
        let res = resolve_scenario(None, None, None, Some(Path::new("/scenes/scene.blend")));
        assert_eq!(res, MockScenario::Normal);
    }

    #[test]
    fn test_crash_config_evaluation() {
        let config_gpu_only = CrashConfig {
            frame: Some(114),
            frames: None,
            crash_gpu: Some(true),
            crash_cpu: Some(false),
        };
        assert!(config_gpu_only.should_crash(114, true));
        assert!(!config_gpu_only.should_crash(114, false));
        assert!(!config_gpu_only.should_crash(113, true));

        let config_both = CrashConfig {
            frame: Some(114),
            frames: None,
            crash_gpu: Some(true),
            crash_cpu: Some(true),
        };
        assert!(config_both.should_crash(114, true));
        assert!(config_both.should_crash(114, false));
    }
}
