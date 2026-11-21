import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Terminate an entire process tree given a root PID.
 * On Windows: uses taskkill /pid <pid> /T /F.
 * On Unix: sends SIGKILL/SIGTERM to the process group -pid, falling back to pid.
 */
export async function killProcessTree(
  pid: number,
  signal: NodeJS.Signals = 'SIGKILL',
): Promise<void> {
  if (pid <= 0) return;

  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', ['/pid', pid.toString(), '/T', '/F']);
    } catch (err: unknown) {
      // If the process already terminated, taskkill returns an error which we ignore
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('not found') && !msg.includes('no running instance')) {
        // Fallback to basic kill
        try {
          process.kill(pid, signal);
        } catch {
          // Ignore
        }
      }
    }
  } else {
    // Unix: Try killing process group first
    try {
      process.kill(-pid, signal);
      return;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ESRCH') {
        // Process does not exist anymore
        return;
      }
      // If -pid failed (e.g. EPERM or not a pgroup leader), try killing just pid
      try {
        process.kill(pid, signal);
      } catch (err2: unknown) {
        const code2 = (err2 as { code?: string })?.code;
        if (code2 !== 'ESRCH') {
          // Ignore if already dead
        }
      }
    }
  }
}
