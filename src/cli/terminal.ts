export interface CliSummary {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalFrames: number;
  completedFrames: number;
  failedFrames: number;
  durationSeconds: number;
  dryRun?: boolean;
}

/**
 * Rings the standard ASCII terminal bell character (\x07).
 */
export function ringTerminalBell(): void {
  try {
    process.stdout.write('\x07');
  } catch {
    // Ignore terminal output errors
  }
}

/**
 * Overwrites the current terminal line with progress information.
 */
export function renderProgressLine(text: string): void {
  try {
    process.stdout.write(`\r\x1b[K${text}`);
  } catch {
    console.log(text);
  }
}

/**
 * Formats a clean ASCII summary table for the terminal.
 */
export function formatSummaryTable(summary: CliSummary): string {
  const status = summary.dryRun
    ? 'DRY-RUN VALIDATION PASSED'
    : summary.failedJobs > 0 || summary.failedFrames > 0
      ? 'FINISHED WITH FAILURES'
      : 'ALL JOBS COMPLETED SUCCESSFULLY';

  const lines = [
    '',
    '==================================================',
    '                 NIGHT RENDER SUMMARY             ',
    '==================================================',
    `Status:            ${status}`,
    `Total Jobs:        ${summary.totalJobs}`,
    `Completed Jobs:    ${summary.completedJobs}`,
    `Failed Jobs:       ${summary.failedJobs}`,
    `Total Frames:      ${summary.totalFrames}`,
    `Completed Frames:  ${summary.completedFrames}`,
    `Failed Frames:     ${summary.failedFrames}`,
    `Duration:          ${summary.durationSeconds.toFixed(1)}s`,
    '==================================================',
    '',
  ];

  return lines.join('\n');
}
