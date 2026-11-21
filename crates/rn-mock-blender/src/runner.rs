use crate::args::BlenderArgs;
use crate::scenarios::{CrashConfig, MockScenario};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevicePreferences {
    pub device_type: Option<String>,
    pub enable_gpu: Option<bool>,
    pub selected_devices: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerPayload {
    pub blend_path: Option<String>,
    pub scene: Option<String>,
    pub camera: Option<String>,
    pub frames: Option<Vec<i32>>,
    pub output_pattern: Option<String>,
    pub output_dir: Option<String>,
    pub control_file: Option<String>,
    pub device_preferences: Option<DevicePreferences>,
    pub threads: Option<u32>,
    pub overrides: Option<HashMap<String, Value>>,
    pub pre_render_hook: Option<Value>,
    pub crash_config: Option<CrashConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlCommand {
    pub command: String,
}

pub fn execute_render_runner(
    payload_path: &Path,
    scenario_override: Option<MockScenario>,
) -> Result<(), i32> {
    if !payload_path.exists() {
        eprintln!("Payload file not found: {}", payload_path.display());
        return Err(1);
    }

    let content = match fs::read_to_string(payload_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to read payload file: {e}");
            return Err(1);
        }
    };

    let payload: RunnerPayload = match serde_json::from_str(&content) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to parse payload JSON: {e}");
            return Err(1);
        }
    };

    let scenario = crate::scenarios::resolve_scenario(
        scenario_override,
        std::env::var("RN_MOCK_SCENARIO").ok().as_deref(),
        payload.crash_config.as_ref(),
        payload.blend_path.as_deref().map(Path::new),
    );

    let is_gpu = match &payload.device_preferences {
        Some(dp) => {
            dp.enable_gpu.unwrap_or(true)
                && dp.device_type.as_deref() != Some("NONE")
                && dp.device_type.as_deref() != Some("CPU")
        }
        None => true,
    };

    let frames = if let Some(ref f) = payload.frames {
        if f.is_empty() {
            vec![1]
        } else {
            f.clone()
        }
    } else {
        vec![1]
    };

    let scene_name = payload.scene.as_deref().unwrap_or("Scene");
    let camera_name = payload.camera.as_deref().unwrap_or("Camera");
    let threads = payload.threads.unwrap_or(16);

    // 1. Device Report
    let compute_device_type = if is_gpu {
        payload
            .device_preferences
            .as_ref()
            .and_then(|dp| dp.device_type.clone())
            .unwrap_or_else(|| "OPTIX".to_string())
    } else {
        "NONE".to_string()
    };

    let mode = if is_gpu { "GPU" } else { "CPU" };
    let devices = if is_gpu {
        json!([{
            "name": "NVIDIA RTX Mock 4090",
            "type": compute_device_type,
            "use": true
        }])
    } else {
        json!([{
            "name": "Mock CPU",
            "type": "CPU",
            "use": true
        }])
    };

    println!(
        "RN_EVENT {}",
        json!({
            "type": "device_report",
            "computeDeviceType": compute_device_type,
            "engine": "CYCLES",
            "mode": mode,
            "devices": devices,
            "requestedGpu": is_gpu,
            "fallbackToCpu": false,
            "threads": threads
        })
    );

    // 2. Overrides Report
    let mut applied = Vec::new();
    let skipped = Vec::<Value>::new();
    if let Some(ref overrides) = payload.overrides {
        for (k, v) in overrides {
            applied.push(json!({ "rnaPath": k, "value": v }));
        }
    }
    println!(
        "RN_EVENT {}",
        json!({
            "type": "overrides_report",
            "applied": applied,
            "skipped": skipped
        })
    );

    // 3. Pre-render hook simulation
    if let Some(ref hook) = payload.pre_render_hook {
        println!("RN_EVENT {}", json!({ "type": "pre_render_hook_start" }));
        let hook_str = hook.to_string();
        if hook_str.contains("RAISE_ERROR") || hook_str.contains("fail") {
            println!(
                "RN_EVENT {}",
                json!({
                    "type": "pre_render_hook_error",
                    "hook": hook,
                    "error": "Simulated pre-render hook execution failure"
                })
            );
            eprintln!("Error in pre-render hook: Simulated pre-render hook execution failure");
            return Err(1);
        } else {
            println!(
                "RN_EVENT {}",
                json!({
                    "type": "pre_render_hook_success",
                    "hook": hook
                })
            );
        }
    }

    // 4. Job Start
    println!(
        "RN_EVENT {}",
        json!({
            "type": "job_start",
            "totalFrames": frames.len(),
            "frames": frames,
            "scene": scene_name,
            "camera": camera_name,
            "engine": "CYCLES"
        })
    );

    let t_start = Instant::now();
    let mut completed_count = 0;
    let failed_count = 0;

    let control_file = payload.control_file.as_deref().map(Path::new);

    for (idx, &f) in frames.iter().enumerate() {
        // Control sentinel check before frame
        if let Some(ctrl_path) = control_file {
            loop {
                if ctrl_path.exists() {
                    if let Ok(ctrl_content) = fs::read_to_string(ctrl_path) {
                        if let Ok(cmd) = serde_json::from_str::<ControlCommand>(&ctrl_content) {
                            if cmd.command == "stop" {
                                break;
                            }
                            if cmd.command == "pause" {
                                sleep(Duration::from_millis(20));
                                continue;
                            }
                        }
                    }
                }
                break;
            }

            if ctrl_path.exists() {
                if let Ok(ctrl_content) = fs::read_to_string(ctrl_path) {
                    if let Ok(cmd) = serde_json::from_str::<ControlCommand>(&ctrl_content) {
                        if cmd.command == "stop" {
                            break;
                        }
                    }
                }
            }
        }

        // Crash simulation: Scenario 1 (crash_114) or Scenario 2 (gpu_oom) or payload.crashConfig
        let mut should_crash = false;
        if (scenario == MockScenario::Crash114 || (scenario == MockScenario::GpuOom && is_gpu))
            && f == 114
        {
            should_crash = true;
        } else if let Some(ref cc) = payload.crash_config {
            should_crash = cc.should_crash(f, is_gpu);
        }

        if should_crash {
            eprintln!("CUDA error: Out of memory at frame {f} (simulated crash)");
            eprintln!("Traceback (most recent call last):");
            eprintln!("  File \"render_runner.py\", line 123, in render_frame");
            eprintln!("RuntimeError: GPU/CPU out of memory at frame {f}");
            return Err(139);
        }

        // Frame Start
        println!(
            "RN_EVENT {}",
            json!({
                "type": "frame_start",
                "frame": f,
                "scene": scene_name,
                "frameIndex": idx,
                "totalFrames": frames.len()
            })
        );

        // Native Blender Progress
        println!(
            "Fra:{f} Mem:14.25M (Peak 25.10M) | Time:00:00.05 | Remaining:00:00.10 | Sample 64/128"
        );

        let delay_ms = if scenario == MockScenario::SlowControl {
            100
        } else {
            10
        };
        sleep(Duration::from_millis(delay_ms));

        println!("Fra:{f} Mem:15.80M (Peak 25.10M) | Time:00:00.10 | Remaining:00:00.00 | Sample 128/128");

        // Output path computation & dummy write
        let saved_path = compute_saved_path(
            payload.output_pattern.as_deref(),
            payload.output_dir.as_deref(),
            f,
        );

        if let Some(parent) = saved_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&saved_path, b"MOCK_IMAGE_DATA");

        println!("Saved: \"{}\"", saved_path.display());
        println!(
            "RN_EVENT {}",
            json!({
                "type": "frame_done",
                "frame": f,
                "scene": scene_name,
                "saved": saved_path.to_string_lossy(),
                "timeSeconds": 0.1,
                "peakMemory": "25.10M"
            })
        );
        completed_count += 1;
    }

    let duration = t_start.elapsed().as_secs_f64();
    println!(
        "RN_EVENT {}",
        json!({
            "type": "job_done",
            "completedFrames": completed_count,
            "failedFrames": failed_count,
            "durationSeconds": (duration * 100.0).round() / 100.0
        })
    );

    println!("Blender quit");
    Ok(())
}

pub fn execute_direct_render(args: &BlenderArgs, scenario: MockScenario) -> Result<(), i32> {
    let start = args.start_frame.unwrap_or(1);
    let end = args.end_frame.unwrap_or(start);
    let step = args.frame_step.unwrap_or(1).max(1);

    let mut frames = Vec::new();
    let mut cur = start;
    while cur <= end {
        frames.push(cur);
        cur += step;
    }

    if let Some(still) = args.render_still {
        frames = vec![still];
    }

    for &f in &frames {
        if (scenario == MockScenario::Crash114 || scenario == MockScenario::GpuOom) && f == 114 {
            eprintln!("CUDA error: Out of memory at frame {f} (simulated crash)");
            eprintln!("Traceback (most recent call last):");
            eprintln!("  File \"blender\", line 1, in render");
            eprintln!("RuntimeError: GPU out of memory at frame {f}");
            return Err(139);
        }

        println!(
            "Fra:{f} Mem:14.25M (Peak 25.10M) | Time:00:00.05 | Remaining:00:00.10 | Sample 64/128"
        );
        if scenario == MockScenario::SlowControl {
            sleep(Duration::from_millis(50));
        }
        println!("Fra:{f} Mem:15.80M (Peak 25.10M) | Time:00:00.10 | Remaining:00:00.00 | Sample 128/128");

        let saved = compute_saved_path(args.output_pattern.as_deref(), None, f);
        if let Some(p) = saved.parent() {
            let _ = fs::create_dir_all(p);
        }
        let _ = fs::write(&saved, b"MOCK_IMAGE_DATA");
        println!("Saved: \"{}\"", saved.display());
    }

    println!("Blender quit");
    Ok(())
}

fn compute_saved_path(pattern: Option<&str>, output_dir: Option<&str>, frame: i32) -> PathBuf {
    let default_file = format!("frame_{:04}.png", frame);
    let mut filename = if let Some(pat) = pattern {
        if pat.contains('#') {
            expand_hashes(pat, frame)
        } else {
            pat.to_string()
        }
    } else {
        default_file
    };

    // Blender uses // to denote relative paths
    if filename.starts_with("//") {
        filename = filename[2..].to_string();
    }

    let p = PathBuf::from(&filename);
    if p.is_absolute() {
        p
    } else if let Some(dir) = output_dir {
        PathBuf::from(dir).join(filename)
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(filename)
    }
}

fn expand_hashes(pattern: &str, frame: i32) -> String {
    let mut result = String::new();
    let mut chars = pattern.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '#' {
            let mut count = 1;
            while let Some(&next_c) = chars.peek() {
                if next_c == '#' {
                    count += 1;
                    chars.next();
                } else {
                    break;
                }
            }
            if frame < 0 {
                result.push('-');
                result.push_str(&format!("{:0width$}", frame.unsigned_abs(), width = count));
            } else {
                result.push_str(&format!("{:0width$}", frame, width = count));
            }
        } else {
            result.push(c);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_expand_hashes() {
        assert_eq!(expand_hashes("shot_####.png", 42), "shot_0042.png");
        assert_eq!(expand_hashes("frame_##.exr", 5), "frame_05.exr");
        assert_eq!(expand_hashes("frame_####.png", -5), "frame_-0005.png");
    }

    #[test]
    fn test_render_runner_normal() {
        let dir = tempdir().unwrap();
        let payload_path = dir.path().join("payload.json");
        let renders_dir = dir.path().join("renders");

        let payload = json!({
            "frames": [1, 2],
            "scene": "Scene",
            "camera": "Camera",
            "outputPattern": "//shot_####.png",
            "outputDir": renders_dir.to_string_lossy(),
        });
        fs::write(&payload_path, payload.to_string()).unwrap();

        let res = execute_render_runner(&payload_path, Some(MockScenario::Normal));
        assert!(res.is_ok());
        assert!(renders_dir.join("shot_0001.png").exists());
        assert!(renders_dir.join("shot_0002.png").exists());
    }

    #[test]
    fn test_render_runner_crash_114() {
        let dir = tempdir().unwrap();
        let payload_path = dir.path().join("payload.json");

        let payload = json!({
            "frames": [112, 113, 114, 115],
            "scene": "Scene",
        });
        fs::write(&payload_path, payload.to_string()).unwrap();

        let res = execute_render_runner(&payload_path, Some(MockScenario::Crash114));
        assert_eq!(res, Err(139));
    }

    #[test]
    fn test_render_runner_gpu_oom_vs_cpu() {
        let dir = tempdir().unwrap();
        let payload_path_gpu = dir.path().join("payload_gpu.json");

        let payload_gpu = json!({
            "frames": [114],
            "devicePreferences": {
                "enableGpu": true,
                "deviceType": "OPTIX"
            }
        });
        fs::write(&payload_path_gpu, payload_gpu.to_string()).unwrap();

        // GPU mode should crash with 139
        let res_gpu = execute_render_runner(&payload_path_gpu, Some(MockScenario::GpuOom));
        assert_eq!(res_gpu, Err(139));

        // CPU mode should succeed!
        let payload_path_cpu = dir.path().join("payload_cpu.json");
        let payload_cpu = json!({
            "frames": [114],
            "devicePreferences": {
                "enableGpu": false,
                "deviceType": "NONE"
            }
        });
        fs::write(&payload_path_cpu, payload_cpu.to_string()).unwrap();

        let res_cpu = execute_render_runner(&payload_path_cpu, Some(MockScenario::GpuOom));
        assert!(res_cpu.is_ok());
    }

    #[test]
    fn test_render_runner_control_stop() {
        let dir = tempdir().unwrap();
        let payload_path = dir.path().join("payload.json");
        let ctrl_path = dir.path().join("control.json");

        // Write stop command immediately
        fs::write(&ctrl_path, json!({ "command": "stop" }).to_string()).unwrap();

        let payload = json!({
            "frames": [1, 2, 3, 4, 5],
            "controlFile": ctrl_path.to_string_lossy(),
        });
        fs::write(&payload_path, payload.to_string()).unwrap();

        let res = execute_render_runner(&payload_path, Some(MockScenario::Normal));
        assert!(res.is_ok());
    }
}
