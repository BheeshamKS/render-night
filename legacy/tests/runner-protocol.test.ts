import { controlCommandSchema, runnerPayloadSchema } from '../src/core/schemas/override';
import { runnerEventSchema } from '../src/core/schemas/runner-event';

import { describe, expect, it } from 'vitest';

describe('Runner Protocol Schemas', () => {
  it('validates job_start event', () => {
    const raw = {
      type: 'job_start',
      totalFrames: 10,
      frames: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      scene: 'Scene',
      camera: 'Camera',
      engine: 'CYCLES',
    };
    const parsed = runnerEventSchema.parse(raw);
    expect(parsed.type).toBe('job_start');
  });

  it('validates device_report event with CPU fallback', () => {
    const raw = {
      type: 'device_report',
      computeDeviceType: 'OPTIX',
      engine: 'CYCLES',
      mode: 'CPU',
      devices: [{ name: 'AMD Ryzen 9', type: 'CPU', use: true }],
      requestedGpu: true,
      fallbackToCpu: true,
      threads: 16,
    };
    const parsed = runnerEventSchema.parse(raw);
    expect(parsed.type).toBe('device_report');
    if (parsed.type === 'device_report') {
      expect(parsed.fallbackToCpu).toBe(true);
      expect(parsed.mode).toBe('CPU');
    }
  });

  it('validates overrides_report event', () => {
    const raw = {
      type: 'overrides_report',
      applied: [{ rnaPath: 'scene.cycles.samples', value: 256 }],
      skipped: [{ rnaPath: 'scene.eevee.bloom', reason: 'Deprecated in Blender 4.2' }],
    };
    const parsed = runnerEventSchema.parse(raw);
    expect(parsed.type).toBe('overrides_report');
    if (parsed.type === 'overrides_report') {
      expect(parsed.applied.length).toBe(1);
      expect(parsed.skipped.length).toBe(1);
    }
  });

  it('validates frame_done event', () => {
    const raw = {
      type: 'frame_done',
      frame: 1,
      scene: 'Scene',
      saved: '/renders/shot_0001.png',
      timeSeconds: 4.25,
      peakMemory: '2.4G',
    };
    const parsed = runnerEventSchema.parse(raw);
    expect(parsed.type).toBe('frame_done');
  });

  it('validates runnerPayloadSchema', () => {
    const payload = {
      blendPath: '/scenes/test.blend',
      scene: 'Scene',
      camera: 'Camera',
      overrides: { 'scene.cycles.samples': 128 },
      frames: [1, 2, 3],
      outputPattern: '//render/test_####.png',
      outputDir: '/renders',
      controlFile: '/renders/control.json',
      devicePreferences: {
        deviceType: 'OPTIX',
        enableGpu: true,
      },
      threads: 8,
    };
    const parsed = runnerPayloadSchema.parse(payload);
    expect(parsed.scene).toBe('Scene');
    expect(parsed.frames).toEqual([1, 2, 3]);
  });

  it('validates controlCommandSchema', () => {
    expect(controlCommandSchema.parse({ command: 'continue' }).command).toBe('continue');
    expect(controlCommandSchema.parse({ command: 'pause' }).command).toBe('pause');
    expect(controlCommandSchema.parse({ command: 'stop' }).command).toBe('stop');
    expect(() => controlCommandSchema.parse({ command: 'invalid' })).toThrow();
  });
});
