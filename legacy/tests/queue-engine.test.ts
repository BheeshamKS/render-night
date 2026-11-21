import { type PowerSaveBlockerDriver, SleepBlockerManager } from '../src/core/power/sleep-blocker';
import { QueueEngine, type QueueEngineJob } from '../src/core/queue/queue-engine';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const MOCK_BLENDER_PATH = path.resolve(__dirname, '../tools/mock-blender/index.js');
const RUNNER_SCRIPT_PATH = path.resolve(__dirname, '../resources/python/render_runner.py');

describe('QueueEngine Execution & Process Control', () => {
  let tmpDir: string;
  let logsDir: string;
  let mockDriver: PowerSaveBlockerDriver;
  let activeBlocks: Set<number>;
  let sleepManager: SleepBlockerManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-night-queue-test-'));
    logsDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

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

  it('runs jobs sequentially, streams progress, creates disk logs, and holds sleep lock', async () => {
    const rendersDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(rendersDir, { recursive: true });

    const engine = new QueueEngine({
      logsDir,
      runtimeDir: tmpDir,
      runnerScriptPath: RUNNER_SCRIPT_PATH,
      sleepBlocker: sleepManager,
    });

    const job1: QueueEngineJob = {
      id: 'job-1',
      blendPath: path.join(tmpDir, 'shot1.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      scene: 'Scene',
      camera: 'Camera',
      frames: [1, 2],
      outputPattern: path.join(rendersDir, 'shot1_####.png'),
      outputDir: rendersDir,
    };

    const job2: QueueEngineJob = {
      id: 'job-2',
      blendPath: path.join(tmpDir, 'shot2.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      scene: 'Scene',
      camera: 'Camera',
      frames: [10],
      outputPattern: path.join(rendersDir, 'shot2_####.png'),
      outputDir: rendersDir,
    };

    const completedJobs: string[] = [];
    const frameDones: Array<{ jobId: string; frame: number }> = [];

    engine.on('frame:done', (data) => {
      frameDones.push({ jobId: data.jobId, frame: data.frame });
    });

    engine.on('job:done', (data) => {
      completedJobs.push(data.jobId);
    });

    expect(sleepManager.isBlocking()).toBe(false);

    const runPromise = engine.start([job1, job2]);
    // Immediately after starting, sleep blocker should be active
    expect(sleepManager.isBlocking()).toBe(true);

    await runPromise;

    expect(completedJobs).toEqual(['job-1', 'job-2']);
    expect(frameDones).toHaveLength(3);
    expect(sleepManager.isBlocking()).toBe(false);

    // Verify disk log created for job-1
    const job1LogsDir = path.join(logsDir, 'job-1');
    expect(fs.existsSync(job1LogsDir)).toBe(true);
    const logFiles = fs.readdirSync(job1LogsDir);
    expect(logFiles.length).toBeGreaterThan(0);
    const logContent = fs.readFileSync(path.join(job1LogsDir, logFiles[0]), 'utf8');
    expect(logContent).toContain('Fra:');
  });

  it('can stop a running queue and terminate the active process', async () => {
    const rendersDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(rendersDir, { recursive: true });

    const engine = new QueueEngine({
      logsDir,
      runtimeDir: tmpDir,
      runnerScriptPath: RUNNER_SCRIPT_PATH,
      sleepBlocker: sleepManager,
    });

    const job: QueueEngineJob = {
      id: 'job-long',
      blendPath: path.join(tmpDir, 'long.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      scene: 'Scene',
      camera: 'Camera',
      frames: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      outputPattern: path.join(rendersDir, 'long_####.png'),
      outputDir: rendersDir,
    };

    let stopped = false;
    engine.on('frame:done', async (data) => {
      if (data.frame === 2 && !stopped) {
        stopped = true;
        await engine.stop();
      }
    });

    await engine.start([job]);
    expect(engine.getState()).toBe('idle');
    expect(sleepManager.isBlocking()).toBe(false);
  });
});
