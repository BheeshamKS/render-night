import { HistoryStore } from '../src/core/history';
import { SessionLockManager } from '../src/core/persistence/session-lock';
import { type PowerSaveBlockerDriver, SleepBlockerManager } from '../src/core/power/sleep-blocker';
import { QueueEngine, type QueueEngineJob } from '../src/core/queue/queue-engine';
import type { DeviceReport, OverridesReport } from '../src/core/schemas/runner-event';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const MOCK_BLENDER_PATH = path.resolve(__dirname, '../tools/mock-blender/index.js');
const RUNNER_SCRIPT_PATH = path.resolve(__dirname, '../resources/python/render_runner.py');

describe('End-to-End Complete Queue Execution with Mock Blender', () => {
  let tmpDir: string;
  let logsDir: string;
  let rendersDir: string;
  let historyDir: string;
  let sleepManager: SleepBlockerManager;
  let lockManager: SessionLockManager;
  let historyStore: HistoryStore;
  let activeLocks: Set<number>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-full-queue-'));
    logsDir = path.join(tmpDir, 'logs');
    rendersDir = path.join(tmpDir, 'renders');
    historyDir = path.join(tmpDir, 'history');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(rendersDir, { recursive: true });
    fs.mkdirSync(historyDir, { recursive: true });

    let idCounter = 1;
    activeLocks = new Set();
    const mockDriver: PowerSaveBlockerDriver = {
      start: () => {
        const id = idCounter++;
        activeLocks.add(id);
        return id;
      },
      stop: (id) => {
        activeLocks.delete(id);
      },
      isStarted: (id) => activeLocks.has(id),
    };
    sleepManager = new SleepBlockerManager(mockDriver);
    lockManager = new SessionLockManager(tmpDir);
    historyStore = new HistoryStore({ historyDir });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('runs a 2-job queue end-to-end, recording events, history, sleep locks, and output files', async () => {
    const engine = new QueueEngine({
      logsDir,
      runtimeDir: tmpDir,
      runnerScriptPath: RUNNER_SCRIPT_PATH,
      sleepBlocker: sleepManager,
      sessionLock: lockManager,
      historyStore,
    });

    const job1: QueueEngineJob = {
      id: 'job-full-1',
      blendPath: path.join(tmpDir, 'shot1.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      scene: 'Scene1',
      camera: 'Camera_Main',
      frames: [1, 2, 3],
      outputPattern: path.join(rendersDir, 'shot1_####.png'),
      outputDir: rendersDir,
      overrides: {
        'scene.cycles.samples': 128,
      },
      threads: 4,
      priority: 'low',
    };

    const job2: QueueEngineJob = {
      id: 'job-full-2',
      blendPath: path.join(tmpDir, 'shot2.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      scene: 'Scene2',
      camera: 'Camera_Secondary',
      frames: [10, 11, 12],
      outputPattern: path.join(rendersDir, 'shot2_####.png'),
      outputDir: rendersDir,
      preRenderHook: 'print("HOOK_OK")',
      threads: 4,
      priority: 'normal',
    };

    const completedFrames: number[] = [];
    const completedJobs: string[] = [];
    const receivedDeviceReports: DeviceReport[] = [];
    const receivedOverridesReports: OverridesReport[] = [];

    engine.on('frame:done', (ev) => {
      completedFrames.push(ev.frame);
    });

    engine.on('job:done', (ev) => {
      completedJobs.push(ev.jobId);
    });

    engine.on('device:report', (ev) => {
      receivedDeviceReports.push(ev.report);
    });

    engine.on('overrides:report', (ev) => {
      receivedOverridesReports.push(ev.report);
    });

    // Before queue execution: sleep blocker is inactive
    expect(sleepManager.isBlocking()).toBe(false);

    // Run both jobs
    await engine.start([job1, job2]);

    // After completion: sleep blocker must be released
    expect(sleepManager.isBlocking()).toBe(false);

    // Verify all frames and jobs completed
    expect(completedJobs).toEqual(['job-full-1', 'job-full-2']);
    expect(completedFrames).toEqual([1, 2, 3, 10, 11, 12]);

    // Verify reports
    expect(receivedDeviceReports.length).toBe(2);
    expect(receivedOverridesReports.length).toBe(2);
    expect(receivedOverridesReports[0].applied).toEqual([
      { rnaPath: 'scene.cycles.samples', value: 128 },
    ]);

    // Verify disk outputs
    expect(fs.existsSync(path.join(rendersDir, 'shot1_0001.png'))).toBe(true);
    expect(fs.existsSync(path.join(rendersDir, 'shot1_0002.png'))).toBe(true);
    expect(fs.existsSync(path.join(rendersDir, 'shot1_0003.png'))).toBe(true);
    expect(fs.existsSync(path.join(rendersDir, 'shot2_0010.png'))).toBe(true);
    expect(fs.existsSync(path.join(rendersDir, 'shot2_0011.png'))).toBe(true);
    expect(fs.existsSync(path.join(rendersDir, 'shot2_0012.png'))).toBe(true);

    // Verify history store entries
    const historyEntries = await historyStore.getEntries();
    expect(historyEntries.length).toBe(2);
    const entry1 = historyEntries.find((e) => e.jobId === 'job-full-1');
    const entry2 = historyEntries.find((e) => e.jobId === 'job-full-2');
    expect(entry1).toBeDefined();
    expect(entry1?.frameCount).toBe(3);
    expect(entry1?.result).toBe('completed');
    expect(entry2).toBeDefined();
    expect(entry2?.frameCount).toBe(3);
    expect(entry2?.result).toBe('completed');
  });
});
