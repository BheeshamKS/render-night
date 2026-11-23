// Render Night CLI - Command Line Arguments
// SPDX-License-Identifier: GPL-3.0-or-later

use clap::{Parser, Subcommand};

#[derive(Parser, Debug, Clone)]
#[command(
    name = "render-night",
    version = env!("RN_FULL_VERSION"),
    about = "A fast local render queue for Blender.",
    long_about = concat!("Render Night CLI v", env!("RN_FULL_VERSION"), "\nA fast local render queue for Blender.")
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,

    /// Path to queue.json definition file
    #[arg(long)]
    pub queue: Option<String>,

    /// Blender executable path, version (e.g. 4.2), or 'latest'
    #[arg(long)]
    pub blender: Option<String>,

    /// Action after queue completes: none, sleep, hibernate, shutdown, restart, close_app
    #[arg(long)]
    pub post_action: Option<String>,

    /// Resume queue from missing frames only
    #[arg(long)]
    pub resume: bool,

    /// Apply a preset to all jobs
    #[arg(long)]
    pub preset: Option<String>,

    /// Run pre-flight checks and preview queue without rendering
    #[arg(long)]
    pub dry_run: bool,

    /// Strict pre-flight: fail on warnings as well as blocking errors
    #[arg(long)]
    pub strict: bool,

    /// Exit with status 1 if any warnings occurred during render
    #[arg(long)]
    pub fail_on_warning: bool,

    /// Path to render_runner.py (internal / test override)
    #[arg(long, hide = true)]
    pub runner_script_path: Option<String>,

    /// Base directory for state / logs / runtime
    #[arg(long, hide = true)]
    pub base_dir: Option<String>,

    /// Skip the 60s countdown for post-action (testing)
    #[arg(long, hide = true)]
    pub skip_countdown: bool,

    /// Run quick UI smoke test and exit
    #[arg(long)]
    pub smoke_test: bool,
}

#[derive(Subcommand, Debug, Clone)]
pub enum Commands {
    /// Inspect a .blend file
    Inspect {
        /// Path to .blend file
        blend_path: String,

        /// Blender executable path, version, or 'latest'
        #[arg(long)]
        blender: Option<String>,
    },
    /// Discover and list all installed Blender versions
    #[command(name = "list-blenders")]
    ListBlenders,
}
