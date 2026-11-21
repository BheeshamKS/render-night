// Render Night CLI - Terminal Output & Formatting
// SPDX-License-Identifier: GPL-3.0-or-later

use std::io::{self, Write};

#[derive(Debug, Clone, Default)]
pub struct CliSummary {
    pub total_jobs: usize,
    pub completed_jobs: usize,
    pub failed_jobs: usize,
    pub total_frames: usize,
    pub completed_frames: usize,
    pub failed_frames: usize,
    pub duration_seconds: f64,
    pub dry_run: bool,
}

pub fn ring_terminal_bell() {
    let _ = io::stdout().write_all(b"\x07");
    let _ = io::stdout().flush();
}

pub fn render_progress_line(text: &str) {
    print!("\r\x1b[K{}", text);
    let _ = io::stdout().flush();
}

pub fn format_summary_table(summary: &CliSummary) -> String {
    let status = if summary.dry_run {
        "DRY-RUN VALIDATION PASSED"
    } else if summary.failed_jobs > 0 || summary.failed_frames > 0 {
        "FINISHED WITH FAILURES"
    } else {
        "ALL JOBS COMPLETED SUCCESSFULLY"
    };

    format!(
        "\n\
==================================================\n\
                 NIGHT RENDER SUMMARY             \n\
==================================================\n\
Status:            {}\n\
Total Jobs:        {}\n\
Completed Jobs:    {}\n\
Failed Jobs:       {}\n\
Total Frames:      {}\n\
Completed Frames:  {}\n\
Failed Frames:     {}\n\
Duration:          {:.1}s\n\
==================================================\n",
        status,
        summary.total_jobs,
        summary.completed_jobs,
        summary.failed_jobs,
        summary.total_frames,
        summary.completed_frames,
        summary.failed_frames,
        summary.duration_seconds
    )
}
