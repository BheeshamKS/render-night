import { type PowerSaveBlockerDriver, SleepBlockerManager } from '../src/core/power/sleep-blocker';
import { QueueEngine, type QueueEngineJob } from '../src/core/queue/queue-engine';
import type { DeviceReport } from '../src/core/schemas/runner-event';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const MOCK_BLENDER_PATH = path.resolve(__dirname, '../tools/mock-blender/index.js');
const RUNNER_SCRIPT_PATH = path.resolve(__dirname, '../resources/python/render_runner.py');

describe('End-to-End 10-Frame Render Runner & Process Control Acceptance', () => {
  let tmpDir: string;
  let logsDir: string;
  let rendersDir: string;
  let mockDriver: PowerSaveBlockerDriver;
  let activeBlocks: Set<number>;
  let sleepManager: SleepBlockerManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-night-e2e-'));
    logsDir = path.join(tmpDir, 'logs');
    rendersDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(rendersDir, { recursive: true });

    let idCounter = 1;
    activeBlocks = new Set();
    mockDriver = {
      start: () => {
        const id = idCounter++;
        activeBlocks.add(id);
        return id;
      },
      stop: (id) => {
        activeBlocks.delete(id);
      },
      isStarted: (id) => activeBlocks.has(id),
    };
    sleepManager = new SleepBlockerManager(mockDriver);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('runs a complete 10-frame job streaming progress, holding sleep lock, emitting device report, and logging to disk', async () => {
    const engine = new QueueEngine({
      logsDir,
      runtimeDir: tmpDir,
      runnerScriptPath: RUNNER_SCRIPT_PATH,
      sleepBlocker: sleepManager,
    });

    const frames10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const job: QueueEngineJob = {
      id: 'job-10-frames',
      blendPath: path.join(tmpDir, 'project.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      scene: 'Scene',
      camera: 'Camera',
      frames: frames10,
      outputPattern: path.join(rendersDir, 'frame_####.png'),
      outputDir: rendersDir,
      devicePreferences: {
        deviceType: 'OPTIX',
        enableGpu: true,
      },
    };

    const completedFrames: number[] = [];
    const nativeProgressEvents: Array<{ frame?: number; peakMemory?: string }> = [];
    let receivedDeviceReport: DeviceReport | null = null;
    let jobDone = false;

    engine.on('frame:done', (data) => {
      completedFrames.push(data.frame);
    });

    engine.on('job:progress', (data) => {
      nativeProgressEvents.push({ frame: data.frame, peakMemory: data.peakMemory });
    });

    engine.on('device:report', (data) => {
      receivedDeviceReport = data.report;
    });

    engine.on('job:done', () => {
      jobDone = true;
    });

    // Before run: sleep lock inactive
    expect(sleepManager.isBlocking()).toBe(false);

    const runPromise = engine.start([job]);
    // During run: sleep lock active
    expect(sleepManager.isBlocking()).toBe(true);

    await runPromise;

    // After run: sleep lock released
    expect(sleepManager.isBlocking()).toBe(false);
    expect(jobDone).toBe(true);

    // 10 frames rendered
    expect(completedFrames).toEqual(frames10);

    // Device report received
    expect(receivedDeviceReport).not.toBeNull();
    const devReport = receivedDeviceReport as unknown as DeviceReport;
    expect(devReport.computeDeviceType).toBe('OPTIX');
    expect(devReport.mode).toBe('GPU');

    // Native progress with Peak Memory parsed
    expect(nativeProgressEvents.length).toBeGreaterThan(0);
    const hasPeak = nativeProgressEvents.some((p) => p.peakMemory === '25.10M');
    expect(hasPeak).toBe(true);

    // Disk log created and populated
    const jobLogDir = path.join(logsDir, 'job-10-frames');
    expect(fs.existsSync(jobLogDir)).toBe(true);
    const logFiles = fs.readdirSync(jobLogDir);
    expect(logFiles.length).toBe(1);
    const logContent = fs.readFileSync(path.join(jobLogDir, logFiles[0]), 'utf8');
    expect(logContent).toContain('Fra:10');
    expect(logContent).toContain('RN_EVENT');
  });

  it('verifies pause and resume during multi-frame execution', async () => {
    const engine = new QueueEngine({
      logsDir,
      runtimeDir: tmpDir,
      runnerScriptPath: RUNNER_SCRIPT_PATH,
      sleepBlocker: sleepManager,
    });

    const job: QueueEngineJob = {
      id: 'job-pause-test',
      blendPath: path.join(tmpDir, 'pause.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      scene: 'Scene',
      camera: 'Camera',
      frames: [1, 2, 3, 4],
      outputPattern: path.join(rendersDir, 'pause_####.png'),
      outputDir: rendersDir,
    };

    let pausedAtFrame2 = false;
    let resumed = false;

    engine.on('frame:done', async (data) => {
      if (data.frame === 2 && !pausedAtFrame2) {
        pausedAtFrame2 = true;
        await engine.pause();
        expect(engine.getState()).toBe('paused');

        // Resume after 80ms
        setTimeout(async () => {
          resumed = true;
          await engine.resume();
        }, 80);
      }
    });

    await engine.start([job]);
    expect(pausedAtFrame2).toBe(true);
    expect(resumed).toBe(true);
    expect(engine.getState()).toBe('idle');
  });

  it('verifies stop immediately terminates child process tree', async () => {
    const engine = new QueueEngine({
      logsDir,
      runtimeDir: tmpDir,
      runnerScriptPath: RUNNER_SCRIPT_PATH,
      sleepBlocker: sleepManager,
    });

    const job: QueueEngineJob = {
      id: 'job-stop-test',
      blendPath: path.join(tmpDir, 'stop.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      scene: 'Scene',
      camera: 'Camera',
      frames: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      outputPattern: path.join(rendersDir, 'stop_####.png'),
      outputDir: rendersDir,
    };

    let stoppedFrame = 0;
    engine.on('frame:done', async (data) => {
      if (data.frame === 3 && stoppedFrame === 0) {
        stoppedFrame = 3;
        await engine.stop();
      }
    });

    await engine.start([job]);
    expect(stoppedFrame).toBe(3);
    expect(engine.getState()).toBe('idle');
    expect(sleepManager.isBlocking()).toBe(false);
  });
});
