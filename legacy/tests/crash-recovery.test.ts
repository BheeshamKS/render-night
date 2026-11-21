import { type PowerSaveBlockerDriver, SleepBlockerManager } from '../src/core/power/sleep-blocker';
import { QueueEngine, type QueueEngineJob } from '../src/core/queue/queue-engine';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const MOCK_BLENDER_PATH = path.resolve(__dirname, '../tools/mock-blender/index.js');
const RUNNER_SCRIPT_PATH = path.resolve(__dirname, '../resources/python/render_runner.py');

describe('Crash Recovery & Rolling ETA', () => {
  let tmpDir: string;
  let logsDir: string;
  let rendersDir: string;
  let sleepManager: SleepBlockerManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-night-crash-test-'));
    logsDir = path.join(tmpDir, 'logs');
    rendersDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(rendersDir, { recursive: true });

    let idCounter = 1;
    const activeBlocks = new Set<number>();
    const mockDriver: PowerSaveBlockerDriver = {
      start: () => {
        const id = idCounter++;
        activeBlocks.add(id);
        return id;
      },
      stop: (id) => activeBlocks.delete(id),
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

  it('spec acceptance: crash at frame 114 results in retry, CPU fallback, skip, then continue 115-200', async () => {
    const engine = new QueueEngine({
      logsDir,
      runtimeDir: tmpDir,
      runnerScriptPath: RUNNER_SCRIPT_PATH,
      sleepBlocker: sleepManager,
    });

    const frames = [112, 113, 114, 115, 116];
    const job: QueueEngineJob = {
      id: 'job-crash-114',
      blendPath: path.join(tmpDir, 'project.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      scene: 'Scene',
      camera: 'Camera',
      frames,
      outputPattern: path.join(rendersDir, 'shot_####.png'),
      outputDir: rendersDir,
      crashPolicy: {
        maxRetries: 1,
        fallbackToCpu: true,
        skipOnFailure: true,
        maxConsecutiveCrashes: 3,
      },
      crashConfig: {
        frame: 114,
        crashGpu: true,
        crashCpu: true,
      },
    };

    const completedFrames: number[] = [];
    const failedFramesRecorded: number[] = [];
    let jobFinished = false;

    engine.on('frame:done', (data) => {
      completedFrames.push(data.frame);
    });

    engine.on('frame:failed', (data) => {
      failedFramesRecorded.push(data.frame);
    });

    engine.on('job:done', (data) => {
      jobFinished = true;
      if (data.failedFramesList) {
        for (const f of data.failedFramesList) {
          if (!failedFramesRecorded.includes(f.frame)) {
            failedFramesRecorded.push(f.frame);
          }
        }
      }
    });

    await engine.start([job]);

    expect(jobFinished).toBe(true);
    // 112, 113 succeeded, 114 failed and was skipped, 115, 116 succeeded
    expect(completedFrames).toEqual([112, 113, 115, 116]);
    expect(failedFramesRecorded).toContain(114);
    expect(failedFramesRecorded).toHaveLength(1);
  });

  it('succeeds on frame 114 after falling back to CPU', async () => {
    const engine = new QueueEngine({
      logsDir,
      runtimeDir: tmpDir,
      runnerScriptPath: RUNNER_SCRIPT_PATH,
      sleepBlocker: sleepManager,
    });

    const frames = [113, 114, 115];
    const job: QueueEngineJob = {
      id: 'job-cpu-fallback-recovery',
      blendPath: path.join(tmpDir, 'project.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      scene: 'Scene',
      camera: 'Camera',
      frames,
      outputPattern: path.join(rendersDir, 'shot_####.png'),
      outputDir: rendersDir,
      crashPolicy: {
        maxRetries: 0,
        fallbackToCpu: true,
        skipOnFailure: true,
        maxConsecutiveCrashes: 3,
      },
      crashConfig: {
        frame: 114,
        crashGpu: true,
        crashCpu: false, // CPU succeeds!
      },
    };

    const completedFrames: number[] = [];
    engine.on('frame:done', (data) => {
      completedFrames.push(data.frame);
    });

    await engine.start([job]);

    // All frames succeeded because 114 was recovered by CPU fallback
    expect(completedFrames).toEqual([113, 114, 115]);
  });

  it('fails the job if max consecutive crashes is exceeded, but continues next job in queue', async () => {
    const engine = new QueueEngine({
      logsDir,
      runtimeDir: tmpDir,
      runnerScriptPath: RUNNER_SCRIPT_PATH,
      sleepBlocker: sleepManager,
    });

    const failingJob: QueueEngineJob = {
      id: 'failing-job',
      blendPath: path.join(tmpDir, 'bad.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      frames: [1, 2, 3, 4],
      outputPattern: path.join(rendersDir, 'bad_####.png'),
      outputDir: rendersDir,
      crashPolicy: {
        maxRetries: 0,
        fallbackToCpu: false,
        skipOnFailure: true,
        maxConsecutiveCrashes: 2, // 2 consecutive crashes will abort the job
      },
      crashConfig: {
        frames: [1, 2], // crashes frame 1, then crashes frame 2 (2 consecutive crashes)
        crashGpu: true,
        crashCpu: true,
      },
    };

    const healthyJob: QueueEngineJob = {
      id: 'healthy-job',
      blendPath: path.join(tmpDir, 'good.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      frames: [10, 11],
      outputPattern: path.join(rendersDir, 'good_####.png'),
      outputDir: rendersDir,
    };

    const failedJobs: string[] = [];
    const doneJobs: string[] = [];

    engine.on('job:failed', (data) => {
      failedJobs.push(data.jobId);
    });

    engine.on('job:done', (data) => {
      doneJobs.push(data.jobId);
    });

    await engine.start([failingJob, healthyJob]);

    // failingJob failed, but healthyJob still completed!
    expect(failedJobs).toContain('failing-job');
    expect(doneJobs).toContain('healthy-job');
  });

  it('skips existing frames when renderMissingOnly is set', async () => {
    const engine = new QueueEngine({
      logsDir,
      runtimeDir: tmpDir,
      runnerScriptPath: RUNNER_SCRIPT_PATH,
      sleepBlocker: sleepManager,
    });

    // Pre-create frame 1 and 2
    fs.writeFileSync(path.join(rendersDir, 'missing_0001.png'), 'DUMMY', 'utf8');
    fs.writeFileSync(path.join(rendersDir, 'missing_0002.png'), 'DUMMY', 'utf8');

    const job: QueueEngineJob = {
      id: 'job-missing-only',
      blendPath: path.join(tmpDir, 'test.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      frames: [1, 2, 3, 4],
      outputPattern: path.join(rendersDir, 'missing_####.png'),
      outputDir: rendersDir,
      renderMissingOnly: true,
    };

    const renderedFrames: number[] = [];
    engine.on('frame:done', (data) => {
      renderedFrames.push(data.frame);
    });

    await engine.start([job]);

    // Only frames 3 and 4 were rendered!
    expect(renderedFrames).toEqual([3, 4]);
  });
});
