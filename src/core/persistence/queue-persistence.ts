import { filterMissingFrames } from '../ranges/missing-frames';
import { queueStateSchema, type Job, type QueueState } from '../schemas/queue-state';
import { readJsonFile, writeAtomicJson } from './atomic-file';

import * as path from 'node:path';

export const CURRENT_SCHEMA_VERSION = 1;

export interface QueueMigration {
  fromVersion: number;
  toVersion: number;
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>;
}

export class QueuePersistence {
  private stateFilePath: string;
  private migrations: QueueMigration[];

  constructor(appDataDir: string, customFileName = 'render-night-queue.json') {
    this.stateFilePath = path.join(appDataDir, customFileName);
    this.migrations = [
      // Example future migration:
      // {
      //   fromVersion: 1,
      //   toVersion: 2,
      //   migrate: (data) => ({ ...data, version: 2 })
      // }
    ];
  }

  public getStateFilePath(): string {
    return this.stateFilePath;
  }

  /**
   * Register a custom migration.
   */
  public registerMigration(migration: QueueMigration): void {
    this.migrations.push(migration);
  }

  /**
   * Atomically save queue state to disk.
   */
  public async save(state: QueueState): Promise<void> {
    const dataToSave: QueueState = {
      ...state,
      version: CURRENT_SCHEMA_VERSION,
    };
    await writeAtomicJson(this.stateFilePath, dataToSave);
  }

  /**
   * Load and validate queue state, applying migrations if necessary.
   */
  public async load(): Promise<QueueState | null> {
    let raw: Record<string, unknown> | null;
    try {
      raw = await readJsonFile<Record<string, unknown>>(this.stateFilePath);
    } catch {
      return null;
    }
    if (!raw) return null;

    let current = { ...raw };
    let version = typeof current.version === 'number' ? current.version : 0;

    // Apply any migrations sequentially
    for (const migration of this.migrations) {
      if (version === migration.fromVersion) {
        current = migration.migrate(current);
        version = migration.toVersion;
        current.version = version;
      }
    }

    // Validate with zod schema
    return queueStateSchema.parse(current);
  }

  /**
   * Calculate resumed queue state after crash or unclean shutdown.
   * Finds the interrupted job, filters out already-completed frames on disk,
   * sets it to continue from the first unfinished frame, and preserves the rest of the queue.
   */
  public calculateResumeState(
    state: QueueState,
    interruptedJobId?: string,
  ): {
    resumedState: QueueState;
    targetJob?: Job;
    remainingFrames: number[];
  } {
    const jobs = [...state.jobs];
    // Find target interrupted job: either explicit ID or first active/pending job
    let targetIndex = -1;
    if (interruptedJobId) {
      targetIndex = jobs.findIndex((j) => j.id === interruptedJobId);
    }
    if (targetIndex === -1) {
      targetIndex = jobs.findIndex((j) => j.status === 'active' || j.status === 'paused');
    }
    if (targetIndex === -1) {
      targetIndex = jobs.findIndex((j) => j.status === 'pending');
    }

    if (targetIndex === -1 || targetIndex >= jobs.length) {
      return {
        resumedState: state,
        remainingFrames: [],
      };
    }

    const targetJob = { ...jobs[targetIndex] };

    // Calculate all planned frames for this job
    const allFrames: number[] = [];
    for (let f = targetJob.range.start; f <= targetJob.range.end; f += targetJob.range.step) {
      allFrames.push(f);
    }

    // Use outputPattern & outputDir to check missing frames
    const pattern = targetJob.outputPattern || targetJob.outputDir || '';
    const dir = targetJob.outputDir || process.cwd();

    const { missingFrames } = filterMissingFrames(allFrames, pattern, dir);

    const remainingFrames = missingFrames.length > 0 ? missingFrames : allFrames;

    // Update target job to resume from the first missing frame
    targetJob.status = 'pending';
    targetJob.lastFrame = remainingFrames.length > 0 ? remainingFrames[0] : targetJob.range.start;

    jobs[targetIndex] = targetJob;

    return {
      resumedState: {
        ...state,
        jobs,
      },
      targetJob,
      remainingFrames,
    };
  }
}
