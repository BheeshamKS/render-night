// Render Night - CLI Parity & Crash Simulation Tests
// SPDX-License-Identifier: GPL-3.0-or-later

use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;
use tempfile::tempdir;

fn rn_cli_bin() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop(); // crates/
    path.pop(); // root/
    path.push("target");
    path.push("debug");
    path.push("render-night");
    path
}

fn mock_blender_bin() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop(); // crates/
    path.pop(); // root/
    path.push("target");
    path.push("debug");
    path.push("rn-mock-blender");
    path
}

#[test]
fn test_parity_scenario_1_crash_114_gpu_recovery() {
    let cli = rn_cli_bin();
    let mock_blender = mock_blender_bin();
    let temp = tempdir().expect("tempdir");

    let blend_path = temp.path().join("crash_114.blend");
    fs::write(&blend_path, b"BLENDER_v402\0\0\0\0").unwrap();

    let output_pattern = temp
        .path()
        .join("out_c114_####.png")
        .to_str()
        .unwrap()
        .to_string();

    let queue_file = temp.path().join("queue_c114.json");
    let queue_content = serde_json::json!({
        "jobs": [
            {
                "id": "job-crash-114",
                "blendPath": blend_path.to_str().unwrap(),
                "scene": "Scene",
                "camera": "Camera",
                "range": "1-2",
                "outputPattern": output_pattern,
                "crashPolicy": "retry_then_cpu_fallback"
            }
        ]
    });
    fs::write(&queue_file, queue_content.to_string()).unwrap();

    let base_dir = temp.path().join("app-data");

    // Pass RN_MOCK_SCENARIO=crash-114
    let out = Command::new(&cli)
        .arg("--queue")
        .arg(&queue_file)
        .arg("--blender")
        .arg(&mock_blender)
        .arg("--base-dir")
        .arg(&base_dir)
        .env("RN_MOCK_SCENARIO", "crash-114")
        .output()
        .expect("exec cli queue");

    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    println!("STATUS: {:?}", out.status);
    println!("STDOUT:\n{}", stdout);
    println!("STDERR:\n{}", stderr);

    assert!(
        out.status.success(),
        "CLI should recover from crash-114 and succeed with CPU fallback"
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("ALL JOBS COMPLETED SUCCESSFULLY"));
    assert!(stdout.contains("Completed Jobs:    1"));
    assert!(stdout.contains("Completed Frames:  2"));
}

#[test]
fn test_parity_scenario_2_gpu_oom_recovery() {
    let cli = rn_cli_bin();
    let mock_blender = mock_blender_bin();
    let temp = tempdir().expect("tempdir");

    let blend_path = temp.path().join("oom.blend");
    fs::write(&blend_path, b"BLENDER_v402\0\0\0\0").unwrap();

    let output_pattern = temp
        .path()
        .join("out_oom_####.png")
        .to_str()
        .unwrap()
        .to_string();

    let queue_file = temp.path().join("queue_oom.json");
    let queue_content = serde_json::json!({
        "jobs": [
            {
                "id": "job-oom",
                "blendPath": blend_path.to_str().unwrap(),
                "scene": "Scene",
                "camera": "Camera",
                "range": "1-2",
                "outputPattern": output_pattern,
                "crashPolicy": "retry_then_cpu_fallback"
            }
        ]
    });
    fs::write(&queue_file, queue_content.to_string()).unwrap();

    let base_dir = temp.path().join("app-data");

    let out = Command::new(&cli)
        .arg("--queue")
        .arg(&queue_file)
        .arg("--blender")
        .arg(&mock_blender)
        .arg("--base-dir")
        .arg(&base_dir)
        .env("RN_MOCK_SCENARIO", "gpu-oom")
        .output()
        .expect("exec cli queue");

    assert!(out.status.success(), "CLI should recover from GPU OOM");
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("ALL JOBS COMPLETED SUCCESSFULLY"));
    assert!(stdout.contains("Completed Jobs:    1"));
    assert!(stdout.contains("Completed Frames:  2"));
}

#[test]
fn test_parity_scenario_3_slow_control_stop() {
    let cli = rn_cli_bin();
    let mock_blender = mock_blender_bin();
    let temp = tempdir().expect("tempdir");

    let blend_path = temp.path().join("slow_control.blend");
    fs::write(&blend_path, b"BLENDER_v402\0\0\0\0").unwrap();

    let output_pattern = temp
        .path()
        .join("out_ctrl_####.png")
        .to_str()
        .unwrap()
        .to_string();

    let queue_file = temp.path().join("queue_ctrl.json");
    let queue_content = serde_json::json!({
        "jobs": [
            {
                "id": "job-slow-ctrl",
                "blendPath": blend_path.to_str().unwrap(),
                "scene": "Scene",
                "camera": "Camera",
                "range": "1-5",
                "outputPattern": output_pattern
            }
        ]
    });
    fs::write(&queue_file, queue_content.to_string()).unwrap();

    let base_dir = temp.path().join("app-data");
    let runtime_dir = base_dir.join("runtime");
    fs::create_dir_all(&runtime_dir).unwrap();
    let control_file = runtime_dir.join("control.json");

    // Write stop command to control file
    fs::write(
        &control_file,
        serde_json::json!({ "command": "stop", "action": "stop" }).to_string(),
    )
    .unwrap();

    let out = Command::new(&cli)
        .arg("--queue")
        .arg(&queue_file)
        .arg("--blender")
        .arg(&mock_blender)
        .arg("--base-dir")
        .arg(&base_dir)
        .output()
        .expect("exec cli queue");

    // Stop command halts queue execution
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("NIGHT RENDER SUMMARY"));
}

#[test]
fn test_parity_scenario_4_missing_assets_inspection() {
    let cli = rn_cli_bin();
    let mock_blender = mock_blender_bin();
    let temp = tempdir().expect("tempdir");

    let blend_path = temp.path().join("assets_scene.blend");
    fs::write(&blend_path, b"BLENDER_v402\0\0\0\0").unwrap();

    let out = Command::new(&cli)
        .arg("inspect")
        .arg(&blend_path)
        .arg("--blender")
        .arg(&mock_blender)
        .env("RN_MOCK_SCENARIO", "missing_assets")
        .output()
        .expect("exec inspect");

    assert!(
        out.status.success(),
        "Inspect with missing assets should succeed"
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    let missing_files = parsed["missingFiles"]
        .as_array()
        .expect("missingFiles array");
    assert!(!missing_files.is_empty());
    assert!(missing_files.iter().any(|f| f["relevance"] == "used"));
    assert!(missing_files.iter().any(|f| f["relevance"] == "unused"));
}

#[test]
fn test_parity_scenario_5_inspect_failure_handling() {
    let cli = rn_cli_bin();
    let mock_blender = mock_blender_bin();
    let temp = tempdir().expect("tempdir");

    let blend_path = temp.path().join("corrupt_test.blend");
    fs::write(&blend_path, b"BLENDER_v402\0\0\0\0").unwrap();

    // Inspect command on corrupt blend should exit 1
    let out = Command::new(&cli)
        .arg("inspect")
        .arg(&blend_path)
        .arg("--blender")
        .arg(&mock_blender)
        .output()
        .expect("exec inspect");

    assert_eq!(out.status.code(), Some(1));
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("Inspection error"));
}

#[test]
fn test_kill_9_crash_simulation_orphans_safety_and_resume() {
    let cli = rn_cli_bin();
    let mock_blender = mock_blender_bin();
    let temp = tempdir().expect("tempdir");

    let blend_path = temp.path().join("long_render.blend");
    fs::write(&blend_path, b"BLENDER_v402\0\0\0\0").unwrap();

    let output_pattern = temp
        .path()
        .join("frame_####.png")
        .to_str()
        .unwrap()
        .to_string();

    let queue_file = temp.path().join("queue_long.json");
    let queue_content = serde_json::json!({
        "jobs": [
            {
                "id": "job-long-1",
                "blendPath": blend_path.to_str().unwrap(),
                "scene": "Scene",
                "camera": "Camera",
                "range": "1-50",
                "outputPattern": output_pattern
            }
        ]
    });
    fs::write(&queue_file, queue_content.to_string()).unwrap();

    let base_dir = temp.path().join("app-data");

    // 1. Launch CLI in background with post-action set
    let mut child = Command::new(&cli)
        .arg("--queue")
        .arg(&queue_file)
        .arg("--blender")
        .arg(&mock_blender)
        .arg("--base-dir")
        .arg(&base_dir)
        .arg("--post-action")
        .arg("shutdown")
        .env("RN_MOCK_SCENARIO", "slow-control")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn cli");

    let pid = child.id();

    // 2. Wait until queue engine has acquired session lock and started rendering
    let session_lock_path = base_dir.join("unclean-shutdown.lock");
    let mut lock_acquired = false;
    for _ in 0..50 {
        if session_lock_path.exists() {
            lock_acquired = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    assert!(
        lock_acquired,
        "Session lock must be acquired when render starts"
    );

    // Give it a brief moment so it is actively mid-render
    std::thread::sleep(Duration::from_millis(150));

    // 3. Kill with SIGKILL (kill -9)
    #[cfg(unix)]
    {
        unsafe {
            libc::kill(pid as i32, libc::SIGKILL);
        }
    }
    let _ = child.wait();

    // 4. Verify ZERO orphaned child processes survive
    // Search for any running rn-mock-blender with our temp path
    #[cfg(unix)]
    {
        let ps_out = Command::new("ps").arg("-ef").output().expect("exec ps");
        let ps_str = String::from_utf8_lossy(&ps_out.stdout);
        let temp_str = temp.path().to_string_lossy();
        assert!(
            !ps_str.contains(&*temp_str),
            "Zero orphaned child processes must remain alive after kill -9"
        );
    }

    // 5. Verify session lock exists and indicates an unclean shutdown (PID is dead)
    assert!(session_lock_path.exists(), "Session lock file must exist");
    let lock_content = fs::read_to_string(&session_lock_path).unwrap();
    let lock_json: serde_json::Value = serde_json::from_str(&lock_content).unwrap();
    assert_eq!(lock_json["pid"], pid);

    // 6. Resume queue from missing frames with post-action requested to verify strict disarm invariant
    let resume_out = Command::new(&cli)
        .arg("--queue")
        .arg(&queue_file)
        .arg("--blender")
        .arg(&mock_blender)
        .arg("--base-dir")
        .arg(&base_dir)
        .arg("--post-action")
        .arg("shutdown")
        .arg("--resume")
        .output()
        .expect("exec cli resume");

    assert!(resume_out.status.success(), "Resume run should succeed");
    let resume_stdout = String::from_utf8_lossy(&resume_out.stdout);
    let resume_stderr = String::from_utf8_lossy(&resume_out.stderr);
    assert!(resume_stdout.contains("ALL JOBS COMPLETED SUCCESSFULLY"));
    assert!(
        resume_stderr.contains("strictly disarmed"),
        "Post-queue action must be strictly disarmed on session restore/resume"
    );
    assert!(
        !session_lock_path.exists(),
        "Session lock file must be cleaned up on successful completion"
    );
}
