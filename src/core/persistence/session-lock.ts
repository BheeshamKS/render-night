import { killProcessTree } from '../render/process-killer';
import { readJsonFile, writeAtomicJson } from './atomic-file';

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SessionLockData {
  pid: number;
  timestamp: number;
  workerPids: number[];
  activeJobId?: string;
  statePath?: string;
}

export function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means process exists but we lack permission to signal it (still alive)
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export class SessionLockManager {
  private lockFilePath: string;

  constructor(appDataDir: string) {
    this.lockFilePath = path.join(appDataDir, 'unclean-shutdown.lock');
  }

  public getLockPath(): string {
    return this.lockFilePath;
  }

  /**
   * Acquire or update the session lock with the current main process PID and worker PIDs.
   */
  public async acquireLock(
    data: Partial<Omit<SessionLockData, 'pid' | 'timestamp'>> = {},
  ): Promise<void> {
    const lockData: SessionLockData = {
      pid: process.pid,
      timestamp: Date.now(),
      workerPids: data.workerPids || [],
      activeJobId: data.activeJobId,
      statePath: data.statePath,
    };
    await writeAtomicJson(this.lockFilePath, lockData);
  }

  /**
   * Update the active worker PIDs (e.g. newly spawned Blender process).
   */
  public async updateWorkerPids(workerPids: number[], activeJobId?: string): Promise<void> {
    const existing = await readJsonFile<SessionLockData>(this.lockFilePath);
    const lockData: SessionLockData = {
      pid: existing?.pid ?? process.pid,
      timestamp: Date.now(),
      workerPids,
      activeJobId: activeJobId ?? existing?.activeJobId,
      statePath: existing?.statePath,
    };
    await writeAtomicJson(this.lockFilePath, lockData);
  }

  /**
   * Release and remove the session lock on graceful quit or queue completion.
   */
  public async releaseLock(): Promise<void> {
    if (fs.existsSync(this.lockFilePath)) {
      try {
        await fs.promises.unlink(this.lockFilePath);
      } catch {
        // Ignore if already deleted
      }
    }
  }

  /**
   * Check if a previous session was uncleanly terminated (process died without releasing lock).
   */
  public async checkUncleanShutdown(): Promise<{
    isUnclean: boolean;
    lockData?: SessionLockData;
  }> {
    const lockData = await readJsonFile<SessionLockData>(this.lockFilePath);
    if (!lockData) {
      return { isUnclean: false };
    }

    // If the process recorded in the lock is still alive and it's our own process, it's our lock.
    if (lockData.pid === process.pid) {
      return { isUnclean: false, lockData };
    }

    // If the process recorded in the lock is no longer running in the OS, it was killed or crashed!
    const mainProcessAlive = isPidAlive(lockData.pid);
    if (!mainProcessAlive) {
      return { isUnclean: true, lockData };
    }

    return { isUnclean: false, lockData };
  }

  /**
   * Find and kill any orphaned worker child processes listed in the lock.
   */
  public async cleanupOrphanedPids(pids: number[]): Promise<number[]> {
    const killed: number[] = [];
    for (const pid of pids) {
      if (isPidAlive(pid)) {
        try {
          await killProcessTree(pid);
          killed.push(pid);
        } catch {
          // Ignore kill errors
        }
      }
    }
    return killed;
  }
}
