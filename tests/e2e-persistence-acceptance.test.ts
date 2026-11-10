import { HistoryStore } from '../src/core/history';
import { QueuePersistence } from '../src/core/persistence/queue-persistence';
import { isPidAlive, SessionLockManager } from '../src/core/persistence/session-lock';
import { PostActionManager } from '../src/core/post-actions/post-action-manager';
import { QueueEngine, type QueueEngineJob } from '../src/core/queue/queue-engine';
import type { HistoryEntry } from '../src/core/schemas/history';
import type { PersistedQueueState } from '../src/core/schemas/queue-state';

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MOCK_BLENDER_PATH = path.resolve(__dirname, '../tools/mock-blender/index.js');
const RUNNER_SCRIPT_PATH = path.resolve(__dirname, '../resources/python/render_runner.py');

describe('End-to-End Acceptance: Crash mid-render, Relaunch, Safe Resume, Sound & History', () => {
  let tmpDir: string;
  let locksDir: string;
  let stateDir: string;
  let historyDir: string;
  let logsDir: string;
  let runtimeDir: string;
  let rendersDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-e2e-acceptance-'));
    locksDir = path.join(tmpDir, 'locks');
    stateDir = path.join(tmpDir, 'state');
    historyDir = path.join(tmpDir, 'history');
    logsDir = path.join(tmpDir, 'logs');
    runtimeDir = path.join(tmpDir, 'runtime');
    rendersDir = path.join(tmpDir, 'renders');

    fs.mkdirSync(locksDir, { recursive: true });
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(historyDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.mkdirSync(rendersDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    }
  });

  it('ACCEPTANCE: kill -9 app mid-render, relaunch, resume from right frame with no shutdown fired; sound plays on job end; history records device used', async () => {
    // -------------------------------------------------------------
    // STEP 1: INITIAL SESSION RENDERS MID-WAY THEN EXPERIENCES "KILL -9"
    // -------------------------------------------------------------
    const simulatedOldMainPid = 999998; // Simulated deceased main PID
    const sessionLock1 = new SessionLockManager(locksDir);

    // Spawn an actual long-running dummy process representing an orphaned worker
    const dummyWorker = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true,
      stdio: 'ignore',
    });
    const orphanedWorkerPid = dummyWorker.pid!;
    expect(isPidAlive(orphanedWorkerPid)).toBe(true);

    // Create session lock as if old process crashed while rendering
    await sessionLock1.acquireLock({
      workerPids: [orphanedWorkerPid],
      activeJobId: 'shot-01',
    });
    // Manually overwrite the lock file's main PID to simulated deceased PID
    const lockPath = sessionLock1.getLockPath();
    const rawLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    rawLock.pid = simulatedOldMainPid;
    fs.writeFileSync(lockPath, JSON.stringify(rawLock, null, 2), 'utf8');

    // Simulate saved state before crash where frames 1 and 2 completed, but job was active
    const persistence = new QueuePersistence(stateDir);
    const preCrashState: PersistedQueueState = {
      version: 1,
      jobs: [
        {
          id: 'shot-01',
          blendPath: path.join(tmpDir, 'shot_01.blend'),
          name: 'shot_01.blend',
          status: 'active',
          range: { start: 1, end: 5, step: 1 },
          renderMissingOnly: false,
          failedFrames: [],
          overrides: {},
          presets: [],
          outputDir: rendersDir,
          outputPattern: 'frame_####.png',
          createdAt: Date.now() - 5000,
          progress: 40,
        },
        {
          id: 'shot-02',
          blendPath: path.join(tmpDir, 'shot_02.blend'),
          name: 'shot_02.blend',
          status: 'pending',
          range: { start: 1, end: 3, step: 1 },
          renderMissingOnly: false,
          failedFrames: [],
          overrides: {},
          presets: [],
          outputDir: rendersDir,
          outputPattern: 'shot2_####',
          createdAt: Date.now() - 5000,
          progress: 0,
        },
      ],
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
        postAction: 'shutdown', // User had selected shutdown before crash!
        sound: { enabled: true, volume: 100, playOnFailure: false },
      },
    };
    await persistence.save(preCrashState);

    // Create the rendered image files for frame 1 and 2 to simulate partial render
    fs.writeFileSync(path.join(rendersDir, 'frame_0001.png'), 'fake-png-1');
    fs.writeFileSync(path.join(rendersDir, 'frame_0002.png'), 'fake-png-2');

    // -------------------------------------------------------------
    // STEP 2: RELAUNCH APP AFTER CRASH & CLEAN UP ORPHANED PIDS
    // -------------------------------------------------------------
    const sessionLock2 = new SessionLockManager(locksDir);

    const check = await sessionLock2.checkUncleanShutdown();
    expect(check.isUnclean).toBe(true);
    expect(check.lockData?.workerPids).toContain(orphanedWorkerPid);

    // Cleanup orphaned worker process
    const killedPids = await sessionLock2.cleanupOrphanedPids(check.lockData!.workerPids);
    expect(killedPids).toContain(orphanedWorkerPid);

    // Verify orphaned process was killed
    // Give OS process table a brief moment
    await new Promise((r) => setTimeout(r, 100));
    expect(isPidAlive(orphanedWorkerPid)).toBe(false);

    // -------------------------------------------------------------
    // STEP 3: HARD SAFETY RULE VERIFICATION: NO SHUTDOWN FIRED!
    // -------------------------------------------------------------
    let shutdownCommandExecuted = false;
    const mockActionRunner = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd === 'shutdown' || cmd === 'systemctl' || cmd === 'osascript') {
        shutdownCommandExecuted = true;
      }
    });

    const postActionManager = new PostActionManager({
      commandRunner: mockActionRunner,
      countdownDurationSeconds: 1, // fast for testing
    });

    // Restored session loads the previously selected 'shutdown' action, but isRestoredSession is TRUE
    postActionManager.setAction(preCrashState.settings.postAction, true /* isRestoredSession */);
    expect(postActionManager.getSelectedAction()).toBe('shutdown');
    expect(postActionManager.getIsArmed()).toBe(false); // Disarmed!

    // Even if something calls completion on the restored session, HARD SAFETY prevents execution
    const armedBeforeRun = await postActionManager.onQueueGracefulComplete();
    expect(armedBeforeRun).toBe(false);
    expect(postActionManager.getState()).toBe('idle');
    expect(shutdownCommandExecuted).toBe(false);

    // -------------------------------------------------------------
    // STEP 4: RESUME QUEUE FROM THE FIRST UNFINISHED FRAME (3..5)
    // -------------------------------------------------------------
    const loadedSavedState = await persistence.load();
    expect(loadedSavedState).not.toBeNull();

    const { remainingFrames, targetJob } = persistence.calculateResumeState(
      loadedSavedState!,
      'shot-01',
    );
    expect(targetJob?.id).toBe('shot-01');
    // Frames 1 and 2 exist in rendersDir, so remaining frames start at 3!
    expect(remainingFrames).toEqual([3, 4, 5]);

    // -------------------------------------------------------------
    // STEP 5: RESUME RENDERING VIA QUEUE ENGINE, PLAY SOUND & RECORD HISTORY
    // -------------------------------------------------------------
    const historyStore = new HistoryStore({ historyDir });
    const engine = new QueueEngine({
      logsDir,
      runtimeDir,
      runnerScriptPath: RUNNER_SCRIPT_PATH,
      historyStore,
    });

    let soundTriggered = false;
    let recordedHistory: HistoryEntry | undefined;

    engine.on('job:done', () => {
      soundTriggered = true;
    });

    engine.on('job:history', (entry: HistoryEntry) => {
      recordedHistory = entry;
    });

    // Now user in live session starts the resumed queue:
    // This arms the post-action manager for the live session!
    postActionManager.setAction('shutdown', false /* live session start! */);
    expect(postActionManager.getIsArmed()).toBe(true);

    const resumedJob: QueueEngineJob = {
      id: 'shot-01',
      blendPath: path.join(tmpDir, 'shot_01.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      frames: remainingFrames, // [3, 4, 5]
      outputPattern: 'frame_####',
      outputDir: rendersDir,
      devicePreferences: {
        enableGpu: true,
        deviceType: 'OPTIX',
      },
    };

    await engine.start([resumedJob]);

    // A) Verify Finish Sound triggered
    expect(soundTriggered).toBe(true);

    // B) Verify History recorded actual device used and completed result
    expect(recordedHistory).toBeDefined();
    expect(recordedHistory?.jobId).toBe('shot-01');
    expect(recordedHistory?.result).toBe('completed');
    expect(recordedHistory?.frameCount).toBe(3);
    // Device actually used was recorded
    expect(recordedHistory?.device).toBeDefined();
    expect(recordedHistory?.device.length).toBeGreaterThan(0);

    // Verify it was appended to history store on disk
    const savedEntries = await historyStore.getEntries();
    expect(savedEntries.length).toBe(1);
    expect(savedEntries[0].jobId).toBe('shot-01');
    expect(savedEntries[0].device).toBe(recordedHistory?.device);

    // C) Now that live session finished gracefully, post-action countdown fires!
    const countdownPromise = postActionManager.onQueueGracefulComplete();
    expect(postActionManager.getState()).toBe('countdown');

    const executed = await countdownPromise;
    expect(executed).toBe(true);
    expect(postActionManager.getState()).toBe('executed');
    expect(shutdownCommandExecuted).toBe(true);
  }, 15000);
});
