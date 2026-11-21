use serde_json::json;
use std::fs;
use std::process::Command;
use tempfile::tempdir;

fn mock_blender_bin() -> Command {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_rn-mock-blender"));
    cmd.current_dir(std::env::current_dir().unwrap());
    cmd
}

#[test]
fn test_cli_version() {
    let output = mock_blender_bin()
        .arg("--version")
        .output()
        .expect("Failed to execute rn-mock-blender");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Blender 4.2.0 LTS (sub 0)"));
    assert!(stdout.contains("build platform: Linux"));
}

#[test]
fn test_scenario_1_crash_114_via_cli_flag() {
    let dir = tempdir().unwrap();
    let payload_path = dir.path().join("payload.json");
    let renders_dir = dir.path().join("renders");

    let payload = json!({
        "frames": [112, 113, 114, 115],
        "scene": "Scene",
        "camera": "Camera",
        "outputPattern": "//shot_####.png",
        "outputDir": renders_dir.to_string_lossy(),
    });
    fs::write(&payload_path, payload.to_string()).unwrap();

    let output = mock_blender_bin()
        .args([
            "-b",
            "test.blend",
            "-P",
            "render_runner.py",
            "--mock-scenario",
            "crash_114",
            "--",
            payload_path.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to execute");

    assert_eq!(output.status.code(), Some(139));
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("CUDA error: Out of memory at frame 114"));
    assert!(stderr.contains("Traceback (most recent call last)"));

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Fra:112"));
    assert!(stdout.contains("Fra:113"));
    assert!(!stdout.contains("Fra:115"));
}

#[test]
fn test_scenario_1_crash_114_via_env_var() {
    let dir = tempdir().unwrap();
    let payload_path = dir.path().join("payload.json");

    let payload = json!({
        "frames": [113, 114],
        "scene": "Scene",
    });
    fs::write(&payload_path, payload.to_string()).unwrap();

    let output = mock_blender_bin()
        .env("RN_MOCK_SCENARIO", "crash_114")
        .args([
            "-b",
            "test.blend",
            "-P",
            "render_runner.py",
            "--",
            payload_path.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to execute");

    assert_eq!(output.status.code(), Some(139));
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("CUDA error: Out of memory at frame 114"));
}

#[test]
fn test_scenario_1_crash_114_via_payload_crash_config() {
    let dir = tempdir().unwrap();
    let payload_path = dir.path().join("payload.json");

    let payload = json!({
        "frames": [113, 114],
        "scene": "Scene",
        "crashConfig": {
            "frame": 114,
            "crashGpu": true,
            "crashCpu": true
        }
    });
    fs::write(&payload_path, payload.to_string()).unwrap();

    let output = mock_blender_bin()
        .args([
            "-b",
            "test.blend",
            "-P",
            "render_runner.py",
            "--",
            payload_path.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to execute");

    assert_eq!(output.status.code(), Some(139));
}

#[test]
fn test_scenario_2_gpu_oom_and_cpu_fallback() {
    let dir = tempdir().unwrap();
    let renders_dir = dir.path().join("renders");

    // 1. GPU attempt: must fail with exit code 139
    let payload_path_gpu = dir.path().join("payload_gpu.json");
    let payload_gpu = json!({
        "frames": [114],
        "scene": "Scene",
        "outputPattern": "//shot_####.png",
        "outputDir": renders_dir.to_string_lossy(),
        "devicePreferences": {
            "enableGpu": true,
            "deviceType": "OPTIX"
        }
    });
    fs::write(&payload_path_gpu, payload_gpu.to_string()).unwrap();

    let output_gpu = mock_blender_bin()
        .args([
            "-b",
            "test.blend",
            "-P",
            "render_runner.py",
            "--mock-scenario",
            "gpu_oom",
            "--",
            payload_path_gpu.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to execute");

    assert_eq!(output_gpu.status.code(), Some(139));
    let stderr = String::from_utf8_lossy(&output_gpu.stderr);
    assert!(stderr.contains("CUDA error: Out of memory at frame 114"));

    // 2. CPU fallback attempt: must succeed with exit code 0
    let payload_path_cpu = dir.path().join("payload_cpu.json");
    let payload_cpu = json!({
        "frames": [114],
        "scene": "Scene",
        "outputPattern": "//shot_####.png",
        "outputDir": renders_dir.to_string_lossy(),
        "devicePreferences": {
            "enableGpu": false,
            "deviceType": "NONE"
        }
    });
    fs::write(&payload_path_cpu, payload_cpu.to_string()).unwrap();

    let output_cpu = mock_blender_bin()
        .args([
            "-b",
            "test.blend",
            "-P",
            "render_runner.py",
            "--mock-scenario",
            "gpu_oom",
            "--",
            payload_path_cpu.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to execute");

    assert_eq!(output_cpu.status.code(), Some(0));
    let stdout = String::from_utf8_lossy(&output_cpu.stdout);
    assert!(stdout.contains("\"mode\":\"CPU\""));
    assert!(stdout.contains("Saved:"));
    assert!(stdout.contains("\"type\":\"job_done\""));
    assert!(renders_dir.join("shot_0114.png").exists());
}

#[test]
fn test_scenario_3_slow_control_pause_and_stop() {
    let dir = tempdir().unwrap();
    let payload_path = dir.path().join("payload.json");
    let ctrl_path = dir.path().join("control.json");

    // Write stop command immediately to verify control file sentinel parsing
    fs::write(&ctrl_path, json!({ "command": "stop" }).to_string()).unwrap();

    let payload = json!({
        "frames": [1, 2, 3, 4, 5],
        "scene": "Scene",
        "controlFile": ctrl_path.to_string_lossy(),
    });
    fs::write(&payload_path, payload.to_string()).unwrap();

    let output = mock_blender_bin()
        .args([
            "-b",
            "test.blend",
            "-P",
            "render_runner.py",
            "--mock-scenario",
            "slow_control",
            "--",
            payload_path.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to execute");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("\"type\":\"job_done\""));
    // Frame 1 should not have been completed because stop was issued before frame
    assert!(stdout.contains("\"completedFrames\":0"));
}

#[test]
fn test_scenario_4_missing_assets_inspection() {
    let dir = tempdir().unwrap();
    let out_json_path = dir.path().join("inspect_out.json");

    let output = mock_blender_bin()
        .args([
            "-b",
            "assets_scene.blend",
            "-P",
            "inspect_blend.py",
            "--mock-scenario",
            "missing_assets",
            "--",
            out_json_path.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to execute");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("RN_INSPECT_SUCCESS"));
    assert!(stdout.contains("Blender quit"));

    let content = fs::read_to_string(&out_json_path).unwrap();
    let data: serde_json::Value = serde_json::from_str(&content).unwrap();
    let missing_files = data["missingFiles"].as_array().expect("missingFiles array");
    assert!(!missing_files.is_empty());

    let has_used = missing_files.iter().any(|f| f["relevance"] == "used");
    let has_unused = missing_files.iter().any(|f| f["relevance"] == "unused");
    assert!(has_used, "Must contain at least one used missing file");
    assert!(has_unused, "Must contain at least one unused missing file");
}

#[test]
fn test_scenario_5_inspect_failure_via_scenario_and_corrupt_file() {
    let dir = tempdir().unwrap();

    // 1. Via --mock-scenario inspect_failure
    let out_json_1 = dir.path().join("out1.json");
    let output1 = mock_blender_bin()
        .args([
            "-b",
            "valid.blend",
            "-P",
            "inspect_blend.py",
            "--mock-scenario",
            "inspect_failure",
            "--",
            out_json_1.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to execute");

    assert_eq!(output1.status.code(), Some(1));
    let stderr1 = String::from_utf8_lossy(&output1.stderr);
    assert!(stderr1.contains("Error: Blender cannot read corrupted blend file!"));

    // 2. Via blend file containing "corrupt"
    let out_json_2 = dir.path().join("out2.json");
    let output2 = mock_blender_bin()
        .args([
            "-b",
            "my_corrupt_file.blend",
            "-P",
            "inspect_blend.py",
            "--",
            out_json_2.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to execute");

    assert_eq!(output2.status.code(), Some(1));
    let stderr2 = String::from_utf8_lossy(&output2.stderr);
    assert!(stderr2.contains("Error: Blender cannot read corrupted blend file!"));
}

#[test]
fn test_direct_render_flags() {
    let dir = tempdir().unwrap();
    let renders_dir = dir.path().join("renders");

    let output = mock_blender_bin()
        .args([
            "-b",
            "simple.blend",
            "-s",
            "1",
            "-e",
            "3",
            "-j",
            "1",
            "-o",
            renders_dir.join("frame_####.png").to_str().unwrap(),
            "-a",
        ])
        .output()
        .expect("Failed to execute");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Fra:1"));
    assert!(stdout.contains("Fra:2"));
    assert!(stdout.contains("Fra:3"));
    assert!(stdout.contains("Blender quit"));

    assert!(renders_dir.join("frame_0001.png").exists());
    assert!(renders_dir.join("frame_0002.png").exists());
    assert!(renders_dir.join("frame_0003.png").exists());
}
