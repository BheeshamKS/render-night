import { crashPolicySchema, runnerPayloadSchema } from '../src/core/schemas/override';
import {
  failedFrameSchema,
  frameRangeConfigSchema,
  jobSchema,
} from '../src/core/schemas/queue-state';

import { describe, expect, it } from 'vitest';

describe('Range, Crash Policy & Failed Frames Schemas', () => {
  it('validates frameRangeConfigSchema across modes', () => {
    const sceneDef = frameRangeConfigSchema.parse({ mode: 'scene_default' });
    expect(sceneDef.mode).toBe('scene_default');

    const simple = frameRangeConfigSchema.parse({
      mode: 'simple',
      simple: { start: 1, end: 100, step: 2 },
    });
    expect(simple.mode).toBe('simple');
    expect(simple.simple?.step).toBe(2);

    const custom = frameRangeConfigSchema.parse({
      mode: 'custom',
      customExpression: '50-200, 200-300',
    });
    expect(custom.mode).toBe('custom');
    expect(custom.customExpression).toBe('50-200, 200-300');

    const still = frameRangeConfigSchema.parse({
      mode: 'single_still',
      singleStillFrame: 42,
    });
    expect(still.mode).toBe('single_still');
    expect(still.singleStillFrame).toBe(42);
  });

  it('validates crashPolicySchema with defaults', () => {
    const defaults = crashPolicySchema.parse({});
    expect(defaults.maxRetries).toBe(2);
    expect(defaults.fallbackToCpu).toBe(true);
    expect(defaults.skipOnFailure).toBe(true);
    expect(defaults.maxConsecutiveCrashes).toBe(3);

    const custom = crashPolicySchema.parse({
      maxRetries: 0,
      fallbackToCpu: false,
      skipOnFailure: false,
      maxConsecutiveCrashes: 1,
    });
    expect(custom.maxRetries).toBe(0);
    expect(custom.fallbackToCpu).toBe(false);
  });

  it('validates failedFrameSchema', () => {
    const failed = failedFrameSchema.parse({
      frame: 114,
      error: 'CUDA out of memory',
      stderrTail: 'Traceback (most recent call last)...',
      timestamp: 1700000000,
      attemptCount: 3,
    });
    expect(failed.frame).toBe(114);
    expect(failed.attemptCount).toBe(3);
  });

  it('validates updated jobSchema with rangeConfig and crashPolicy', () => {
    const job = jobSchema.parse({
      id: 'job-1',
      blendPath: '/scenes/test.blend',
      name: 'test',
      status: 'pending',
      range: { start: 1, end: 10, step: 1 },
      overrides: {},
      presets: [],
      createdAt: Date.now(),
      rangeConfig: {
        mode: 'custom',
        customExpression: '1-50, 75, 120-240x2',
      },
      crashPolicy: {
        maxRetries: 1,
        fallbackToCpu: true,
      },
      renderMissingOnly: true,
      failedFrames: [
        {
          frame: 75,
          error: 'Process crashed',
          timestamp: Date.now(),
        },
      ],
    });

    expect(job.rangeConfig?.mode).toBe('custom');
    expect(job.renderMissingOnly).toBe(true);
    expect(job.failedFrames).toHaveLength(1);
    expect(job.failedFrames[0].frame).toBe(75);
  });

  it('validates runnerPayloadSchema with crashPolicy and crashConfig', () => {
    const payload = runnerPayloadSchema.parse({
      blendPath: '/scenes/test.blend',
      frames: [114, 115, 116],
      outputPattern: '//render/test_####.png',
      outputDir: '/renders',
      controlFile: '/renders/control.json',
      crashPolicy: {
        maxRetries: 2,
        fallbackToCpu: true,
      },
      crashConfig: {
        frame: 114,
        crashGpu: true,
        crashCpu: true,
      },
      renderMissingOnly: true,
    });

    expect(payload.crashPolicy?.maxRetries).toBe(2);
    expect(payload.crashConfig?.frame).toBe(114);
    expect(payload.renderMissingOnly).toBe(true);
  });
});
