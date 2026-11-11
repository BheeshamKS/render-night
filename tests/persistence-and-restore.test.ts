import { readJsonFile, writeAtomicJson } from '../src/core/persistence/atomic-file';
import {
  CURRENT_SCHEMA_VERSION,
  QueuePersistence,
} from '../src/core/persistence/queue-persistence';
import { isPidAlive, SessionLockManager } from '../src/core/persistence/session-lock';
import type { QueueState } from '../src/core/schemas/queue-state';

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Atomic Persistence & Session Lock', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-persist-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('atomically writes and reads json files', async () => {
    const target = path.join(tmpDir, 'nested', 'state.json');
    const data = { hello: 'world', count: 42 };

    await writeAtomicJson(target, data);
    expect(fs.existsSync(target)).toBe(true);

    const loaded = await readJsonFile<typeof data>(target);
    expect(loaded).toEqual(data);
  });

  it('manages session lock lifecycle and unclean shutdown detection', async () => {
    const lockManager = new SessionLockManager(tmpDir);

    // Initial check: no lock file exists -> clean
    let check = await lockManager.checkUncleanShutdown();
    expect(check.isUnclean).toBe(false);

    // Acquire lock for active session
    await lockManager.acquireLock({ activeJobId: 'job-123', workerPids: [999999] });
    expect(fs.existsSync(lockManager.getLockPath())).toBe(true);

    // Check with current PID: clean because process is this running test process
    check = await lockManager.checkUncleanShutdown();
    expect(check.isUnclean).toBe(false);

    // Simulate an unclean shutdown by writing a dead PID into the lock file
    // PID 99999999 is overwhelmingly likely to be nonexistent
    const deadPid = 99999999;
    await writeAtomicJson(lockManager.getLockPath(), {
      pid: deadPid,
      timestamp: Date.now() - 5000,
      workerPids: [],
      activeJobId: 'crashed-job',
    });

    check = await lockManager.checkUncleanShutdown();
    expect(check.isUnclean).toBe(true);
    expect(check.lockData?.activeJobId).toBe('crashed-job');

    // Clean release
    await lockManager.releaseLock();
    expect(fs.existsSync(lockManager.getLockPath())).toBe(false);
  });

  it('detects and cleans up orphaned worker PIDs', async () => {
    const lockManager = new SessionLockManager(tmpDir);

    // Spawn a dummy long-lived child process to simulate an orphaned Blender worker
    const dummyWorker = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true,
      stdio: 'ignore',
    });

    const workerPid = dummyWorker.pid;
    expect(workerPid).toBeDefined();
    if (!workerPid) return;

    expect(isPidAlive(workerPid)).toBe(true);

    // Call cleanup on the orphaned PID
    const killed = await lockManager.cleanupOrphanedPids([workerPid]);
    expect(killed).toContain(workerPid);

    // Wait a brief moment to allow process termination
    await new Promise((r) => setTimeout(r, 100));
    expect(isPidAlive(workerPid)).toBe(false);
  });

  it('persists and loads queue state with schema validation and migrations', async () => {
    const persistence = new QueuePersistence(tmpDir);

    const sampleState: QueueState = {
      version: CURRENT_SCHEMA_VERSION,
      jobs: [
        {
          id: 'job-1',
          blendPath: '/path/to/test.blend',
          name: 'test.blend',
          status: 'pending',
          range: { start: 1, end: 50, step: 1 },
          renderMissingOnly: false,
          failedFrames: [],
          overrides: {},
          presets: [],
          createdAt: Date.now(),
          progress: 0,
        },
      ],
      settings: {
        concurrentJobs: 1,
        stopOnFailure: false,
        closeAppOnCompletion: false,
        closeAppOnCompletionMode: 'last',
        soundOnCompletion: true,
        soundOnFailure: true,
        powerMode: 'none',
        pauseOnBattery: false,
        resumeOnAc: false,
        maxConcurrentFrames: 1,
        postAction: 'none',
        sound: { enabled: true, volume: 100, playOnFailure: false },
      },
    };

    await persistence.save(sampleState);
    const loaded = await persistence.load();
    expect(loaded).toBeDefined();
    expect(loaded?.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded?.jobs.length).toBe(1);
    expect(loaded?.jobs[0].id).toBe('job-1');

    // Test migration from version 0
    persistence.registerMigration({
      fromVersion: 0,
      toVersion: 1,
      migrate: (raw) => ({
        ...raw,
        version: 1,
        migrated: true,
      }),
    });

    // Write a v0 file
    await writeAtomicJson(persistence.getStateFilePath(), {
      version: 0,
      jobs: sampleState.jobs,
      settings: sampleState.settings,
    });

    const migrated = await persistence.load();
    expect(migrated?.version).toBe(1);
  });

  it('calculates resume state from first missing frame and preserves subsequent queue jobs', () => {
    const persistence = new QueuePersistence(tmpDir);

    const rendersDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(rendersDir, { recursive: true });
    // Pre-create frame 1 and 2
    fs.writeFileSync(path.join(rendersDir, 'scene_0001.png'), 'DATA', 'utf8');
    fs.writeFileSync(path.join(rendersDir, 'scene_0002.png'), 'DATA', 'utf8');

    const state: QueueState = {
      version: 1,
      jobs: [
        {
          id: 'job-running',
          blendPath: path.join(tmpDir, 'scene.blend'),
          name: 'scene.blend',
          status: 'active',
          range: { start: 1, end: 5, step: 1 },
          outputPattern: path.join(rendersDir, 'scene_####.png'),
          outputDir: rendersDir,
          renderMissingOnly: false,
          failedFrames: [],
          overrides: {},
          presets: [],
          createdAt: Date.now(),
          progress: 40,
        },
        {
          id: 'job-queued-next',
          blendPath: path.join(tmpDir, 'scene2.blend'),
          name: 'scene2.blend',
          status: 'pending',
          range: { start: 10, end: 20, step: 1 },
          renderMissingOnly: false,
          failedFrames: [],
          overrides: {},
          presets: [],
          createdAt: Date.now(),
          progress: 0,
        },
      ],
      settings: {
        concurrentJobs: 1,
        stopOnFailure: false,
        closeAppOnCompletion: false,
        closeAppOnCompletionMode: 'last',
        soundOnCompletion: true,
        soundOnFailure: true,
        powerMode: 'none',
        pauseOnBattery: false,
        resumeOnAc: false,
        maxConcurrentFrames: 1,
        postAction: 'none',
        sound: { enabled: true, volume: 100, playOnFailure: false },
      },
    };

    const { resumedState, targetJob, remainingFrames } = persistence.calculateResumeState(
      state,
      'job-running',
    );

    expect(targetJob?.id).toBe('job-running');
    // Frames 1 and 2 are on disk, so remaining are 3, 4, 5
    expect(remainingFrames).toEqual([3, 4, 5]);
    expect(targetJob?.lastFrame).toBe(3); // Resumes starting at frame 3!

    // The second job remains untouched and intact
    expect(resumedState.jobs.length).toBe(2);
    expect(resumedState.jobs[1].id).toBe('job-queued-next');
    expect(resumedState.jobs[1].status).toBe('pending');
  });

  it('persists and restores audited global application settings', async () => {
    const persistence = new QueuePersistence(tmpDir);

    const stateWithSettings: QueueState = {
      version: CURRENT_SCHEMA_VERSION,
      jobs: [],
      settings: {
        concurrentJobs: 1,
        stopOnFailure: false,
        closeAppOnCompletion: false,
        closeAppOnCompletionMode: 'last',
        soundOnCompletion: true,
        soundOnFailure: false,
        powerMode: 'none',
        pauseOnBattery: false,
        resumeOnAc: false,
        maxConcurrentFrames: 1,
        postAction: 'sleep',
        sound: { enabled: true, volume: 85, playOnFailure: true },
        defaultBlenderId: 'blender-4-2',
        isolatedMode: true,
        autoExec: false,
        defaultPriority: 'low',
        defaultThreads: 8,
        blockSleepDuringRender: true,
        blockSleepWhileScheduled: true,
        minFreeDiskSpaceMb: 2048,
        defaultCrashPolicy: {
          maxRetries: 5,
          maxConsecutiveCrashes: 3,
          fallbackToCpu: true,
          skipOnFailure: true,
        },
      },
    };

    await persistence.save(stateWithSettings);
    const restored = await persistence.load();

    expect(restored).not.toBeNull();
    expect(restored?.settings.defaultPriority).toBe('low');
    expect(restored?.settings.defaultThreads).toBe(8);
    expect(restored?.settings.minFreeDiskSpaceMb).toBe(2048);
    expect(restored?.settings.isolatedMode).toBe(true);
    expect(restored?.settings.defaultCrashPolicy?.maxRetries).toBe(5);
    expect(restored?.settings.sound.volume).toBe(85);
  });

  it('handles corrupt state JSON safely without crashing', async () => {
    const persistence = new QueuePersistence(tmpDir);
    const statePath = persistence.getStateFilePath();

    // Write corrupted raw bytes
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, 'CORRUPTED_NON_JSON_DATA_<<<');

    const loaded = await persistence.load();
    expect(loaded).toBeNull();
  });
});
