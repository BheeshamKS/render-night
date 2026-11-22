// Render Night CLI - Entry Point
// SPDX-License-Identifier: GPL-3.0-or-later

mod args;
mod runner;
mod terminal;

use clap::Parser;
use std::path::Path;
use std::process::ExitCode;

use args::{Cli, Commands};
use rn_core::blender::{
    discover_all_blenders, inspect_blend, resolve_blender_for_cli, InspectOptions, Platform,
    RealBlenderFs, RealBlenderProber, RealEnv,
};
use runner::{run_cli_queue, CliRunOptions};

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();

    if cli.smoke_test {
        let current_exe = std::env::current_exe().expect("Failed to get current executable path");
        let parent_dir = current_exe
            .parent()
            .expect("Failed to get parent directory");
        let gui_bin_name = format!("render-night-gui{}", std::env::consts::EXE_SUFFIX);
        let gui_path = parent_dir.join(&gui_bin_name);
        if !gui_path.exists() {
            eprintln!("Error: GUI binary not found at {}", gui_path.display());
            return ExitCode::from(1);
        }
        let status = std::process::Command::new(&gui_path)
            .arg("--smoke-test")
            .status()
            .expect("Failed to execute render-night-gui --smoke-test");
        return if status.success() {
            ExitCode::from(0)
        } else {
            ExitCode::from(status.code().unwrap_or(1) as u8)
        };
    }

    // 1. Check Subcommands
    if let Some(cmd) = cli.command {
        match cmd {
            Commands::ListBlenders => {
                let blenders = discover_all_blenders(&[]);
                if blenders.is_empty() {
                    println!("No Blender installations found on system.");
                } else {
                    println!("Discovered {} Blender installation(s):", blenders.len());
                    for b in blenders {
                        println!(
                            "- Blender {} ({:?}): {}",
                            b.version, b.source, b.display_path
                        );
                    }
                }
                ExitCode::from(0)
            }
            Commands::Inspect {
                blend_path,
                blender,
            } => {
                let path = Path::new(&blend_path);
                if !path.exists() {
                    eprintln!("Error: File not found: {}", blend_path);
                    return ExitCode::from(2);
                }
                let canonical_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());

                let resolved = match resolve_blender_for_cli(
                    blender.as_deref(),
                    &[],
                    &RealBlenderFs,
                    &RealBlenderProber::default(),
                    &RealEnv,
                    Platform::current(),
                ) {
                    Ok(b) => b,
                    Err(e) => {
                        eprintln!("Blender resolution failed: {}", e);
                        return ExitCode::from(2);
                    }
                };

                let opts = InspectOptions::default();
                match inspect_blend(&canonical_path, &resolved.executable, &opts).await {
                    Ok(output) => {
                        match serde_json::to_string_pretty(&output) {
                            Ok(json) => println!("{}", json),
                            Err(e) => {
                                eprintln!("JSON serialization error: {}", e);
                                return ExitCode::from(1);
                            }
                        }
                        ExitCode::from(0)
                    }
                    Err(e) => {
                        eprintln!("Inspection error: {}", e);
                        ExitCode::from(1)
                    }
                }
            }
        }
    } else if let Some(queue_file) = cli.queue {
        let res = run_cli_queue(CliRunOptions {
            queue_file,
            blender: cli.blender,
            post_action: cli.post_action,
            resume: cli.resume,
            preset: cli.preset,
            dry_run: cli.dry_run,
            strict: cli.strict,
            fail_on_warning: cli.fail_on_warning,
            runner_script_path: cli.runner_script_path,
            base_dir: cli.base_dir,
            skip_countdown: cli.skip_countdown,
        })
        .await;
        ExitCode::from(res.exit_code as u8)
    } else {
        eprintln!("Error: Missing file path for --queue option or subcommand.");
        eprintln!("Run \"render-night --help\" for usage information.");
        ExitCode::from(2)
    }
}
