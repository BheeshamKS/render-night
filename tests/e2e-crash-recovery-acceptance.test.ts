import { type PowerSaveBlockerDriver, SleepBlockerManager } from '../src/core/power/sleep-blocker';
import { QueueEngine, type QueueEngineJob } from '../src/core/queue/queue-engine';
import {
  parseCustomRange,
  resolveFrameRange,
  validateRangeForFormat,
} from '../src/core/ranges/frame-range';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const MOCK_BLENDER_PATH = path.resolve(__dirname, '../tools/mock-blender/index.js');
const RUNNER_SCRIPT_PATH = path.resolve(__dirname, '../resources/python/render_runner.py');

describe('End-to-End Crash Recovery & Frame Range Acceptance', () => {
  let tmpDir: string;
  let logsDir: string;
  let rendersDir: string;
  let mockDriver: PowerSaveBlockerDriver;
  let activeBlocks: Set<number>;
  let sleepManager: SleepBlockerManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-e2e-crash-'));
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

  it('verifies acceptance scenario: crash at frame 114 results in retry, CPU fallback, skip, then continue 115-200', async () => {
    const engine = new QueueEngine({
      logsDir,
      runtimeDir: tmpDir,
      runnerScriptPath: RUNNER_SCRIPT_PATH,
      sleepBlocker: sleepManager,
    });

    // Custom range: 112-117
    const customParsed = parseCustomRange('112-117');
    expect(customParsed).toEqual([112, 113, 114, 115, 116, 117]);

    const job: QueueEngineJob = {
      id: 'e2e-crash-recovery-job',
      blendPath: path.join(tmpDir, 'scene.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      frames: customParsed,
      outputPattern: path.join(rendersDir, 'frame_####.png'),
      outputDir: rendersDir,
      crashPolicy: {
        maxRetries: 2,
        fallbackToCpu: true,
        skipOnFailure: true,
        maxConsecutiveCrashes: 3,
      },
      crashConfig: {
        frame: 114,
        crashGpu: true,
        crashCpu: true, // crashes on CPU as well, so it skips after GPU retry + CPU attempt
      },
    };

    const renderedFrames: number[] = [];
    const failedFrames: number[] = [];
    const logs: string[] = [];

    engine.on('frame:done', (data) => {
      renderedFrames.push(data.frame);
    });

    engine.on('frame:failed', (data) => {
      failedFrames.push(data.frame);
    });

    engine.on('log', (data) => {
      logs.push(data.line);
    });

    let completedJobData: unknown = null;
    engine.on('job:done', (data) => {
      completedJobData = data;
    });

    await engine.start([job]);

    // Frame 112 and 113 succeeded
    expect(renderedFrames).toContain(112);
    expect(renderedFrames).toContain(113);

    // Frame 114 crashed on GPU, retried, fell back to CPU, crashed, skipped
    expect(failedFrames).toContain(114);
    expect(renderedFrames).not.toContain(114);

    // Continued to frames 115, 116, 117
    expect(renderedFrames).toContain(115);
    expect(renderedFrames).toContain(116);
    expect(renderedFrames).toContain(117);

    // Verify recovery logs
    expect(logs.some((l) => l.includes('Retrying frame 114'))).toBe(true);
    expect(logs.some((l) => l.includes('Falling back to CPU for frame 114'))).toBe(true);
    expect(
      logs.some((l) =>
        l.includes('Frame 114 failed permanently. Skipping frame and continuing queue.'),
      ),
    ).toBe(true);

    expect(completedJobData).toBeDefined();
  });

  it('verifies table-driven range parsing with deduplication and sorting for 50-200, 200-300', () => {
    const parsed = parseCustomRange('50-200, 200-300');
    expect(parsed.length).toBe(251);
    expect(parsed[0]).toBe(50);
    expect(parsed[parsed.length - 1]).toBe(300);

    // Deduplication check: frame 200 only appears once
    const count200 = parsed.filter((f) => f === 200).length;
    expect(count200).toBe(1);

    // Strict ascending order check
    for (let i = 1; i < parsed.length; i++) {
      expect(parsed[i]).toBe(parsed[i - 1] + 1);
    }
  });

  it('verifies image-vs-video rule constraints and error reporting', () => {
    const sceneDefaults = { start: 1, end: 100, step: 1 };

    // Continuous simple range on video: valid
    const continuous = resolveFrameRange(
      { mode: 'simple', simple: { start: 1, end: 50, step: 1 } },
      sceneDefaults,
    );
    const validResult = validateRangeForFormat(continuous, 'FFMPEG');
    expect(validResult.valid).toBe(true);

    // Stepped range on video: invalid
    const stepped = resolveFrameRange(
      { mode: 'simple', simple: { start: 1, end: 50, step: 2 } },
      sceneDefaults,
    );
    const steppedResult = validateRangeForFormat(stepped, 'FFMPEG');
    expect(steppedResult.valid).toBe(false);
    expect(steppedResult.reason).toContain('continuous sequential frames');

    // Single still on video: invalid
    const single = resolveFrameRange({ mode: 'single_still', singleStillFrame: 10 }, sceneDefaults);
    const singleResult = validateRangeForFormat(single, 'FFMPEG');
    expect(singleResult.valid).toBe(false);
    expect(singleResult.reason).toContain(
      'Single still frames cannot be rendered to a video container',
    );
  });

  it('verifies render missing frames only skips pre-rendered images', async () => {
    const engine = new QueueEngine({
      logsDir,
      runtimeDir: tmpDir,
      runnerScriptPath: RUNNER_SCRIPT_PATH,
      sleepBlocker: sleepManager,
    });

    const outputPattern = path.join(rendersDir, 'missing_####.png');
    // Pre-create frames 1 and 2
    fs.writeFileSync(path.join(rendersDir, 'missing_0001.png'), 'EXISTING_1', 'utf8');
    fs.writeFileSync(path.join(rendersDir, 'missing_0002.png'), 'EXISTING_2', 'utf8');

    const job: QueueEngineJob = {
      id: 'missing-test-job',
      blendPath: path.join(tmpDir, 'test.blend'),
      executable: [process.execPath, MOCK_BLENDER_PATH],
      frames: [1, 2, 3, 4],
      outputPattern,
      outputDir: rendersDir,
      renderMissingOnly: true,
    };

    const renderedFrames: number[] = [];
    engine.on('frame:done', (data) => {
      renderedFrames.push(data.frame);
    });

    await engine.start([job]);

    // Frames 1 and 2 were skipped because they already existed!
    expect(renderedFrames).not.toContain(1);
    expect(renderedFrames).not.toContain(2);
    // Frames 3 and 4 were rendered
    expect(renderedFrames).toContain(3);
    expect(renderedFrames).toContain(4);
  });
});
