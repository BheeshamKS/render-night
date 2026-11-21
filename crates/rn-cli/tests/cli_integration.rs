// Render Night CLI - Integration Tests
// SPDX-License-Identifier: GPL-3.0-or-later

use std::fs;
use std::path::PathBuf;
use std::process::Command;
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
fn test_cli_help_and_version() {
    let cli = rn_cli_bin();
    assert!(cli.exists(), "render-night binary must exist");

    let help_out = Command::new(&cli)
        .arg("--help")
        .output()
        .expect("exec help");
    assert!(help_out.status.success());
    let help_str = String::from_utf8_lossy(&help_out.stdout);
    assert!(help_str.contains("Night Render CLI"));
    assert!(help_str.contains("--queue"));

    let ver_out = Command::new(&cli)
        .arg("--version")
        .output()
        .expect("exec version");
    assert!(ver_out.status.success());
    let ver_str = String::from_utf8_lossy(&ver_out.stdout);
    assert!(ver_str.contains("render-night 0.1.0-alpha.6"));
}

#[test]
fn test_cli_list_blenders() {
    let cli = rn_cli_bin();
    let out = Command::new(&cli)
        .arg("list-blenders")
        .output()
        .expect("exec list-blenders");
    assert!(out.status.success());
}

#[test]
fn test_cli_missing_queue_file_returns_exit_code_2() {
    let cli = rn_cli_bin();
    let out = Command::new(&cli)
        .arg("--queue")
        .arg("non_existent_queue_file_12345.json")
        .output()
        .expect("exec cli");
    assert_eq!(out.status.code(), Some(2));
    let err_str = String::from_utf8_lossy(&out.stderr);
    assert!(err_str.contains("Queue file not found"));
}

#[test]
fn test_cli_dry_run_validation() {
    let cli = rn_cli_bin();
    let mock_blender = mock_blender_bin();
    let temp = tempdir().expect("tempdir");

    let blend_path = temp.path().join("test.blend");
    fs::write(&blend_path, b"BLENDER_v402\0\0\0\0").unwrap();

    let queue_file = temp.path().join("queue.json");
    let queue_content = serde_json::json!({
        "jobs": [
            {
                "blendPath": blend_path.to_str().unwrap(),
                "scene": "Scene",
                "camera": "Camera",
                "range": "1-3"
            }
        ]
    });
    fs::write(&queue_file, queue_content.to_string()).unwrap();

    let out = Command::new(&cli)
        .arg("--queue")
        .arg(&queue_file)
        .arg("--blender")
        .arg(&mock_blender)
        .arg("--dry-run")
        .output()
        .expect("exec cli dry-run");

    assert!(out.status.success(), "Dry run should exit with 0");
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("[DRY-RUN] Pre-flight checks passed"));
    assert!(stdout.contains("DRY-RUN VALIDATION PASSED"));
}

#[test]
fn test_cli_full_queue_execution_with_mock_blender() {
    let cli = rn_cli_bin();
    let mock_blender = mock_blender_bin();
    let temp = tempdir().expect("tempdir");

    let blend_path = temp.path().join("test.blend");
    fs::write(&blend_path, b"BLENDER_v402\0\0\0\0").unwrap();

    let output_pattern = temp
        .path()
        .join("out_####.png")
        .to_str()
        .unwrap()
        .to_string();

    let queue_file = temp.path().join("queue.json");
    let queue_content = serde_json::json!({
        "jobs": [
            {
                "id": "cli-test-job-1",
                "blendPath": blend_path.to_str().unwrap(),
                "scene": "Scene",
                "camera": "Camera",
                "range": { "start": 1, "end": 2, "step": 1 },
                "outputPattern": output_pattern
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
        .output()
        .expect("exec cli queue");

    assert!(out.status.success(), "Queue should complete with exit 0");
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("ALL JOBS COMPLETED SUCCESSFULLY"));
    assert!(stdout.contains("Completed Jobs:    1"));
    assert!(stdout.contains("Completed Frames:  2"));
}
