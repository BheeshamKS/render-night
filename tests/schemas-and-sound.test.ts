import {
  historyEntrySchema,
  historyListSchema,
  postActionSchema,
  queueSettingsSchema,
  scheduleConfigSchema,
  soundSettingsSchema,
} from '../src/core/schemas';

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Protocol Schemas: History, Post-Actions, Sound & Scheduling', () => {
  it('validates postActionSchema choices', () => {
    expect(postActionSchema.parse('none')).toBe('none');
    expect(postActionSchema.parse('sleep')).toBe('sleep');
    expect(postActionSchema.parse('hibernate')).toBe('hibernate');
    expect(postActionSchema.parse('shutdown')).toBe('shutdown');
    expect(postActionSchema.parse('restart')).toBe('restart');
    expect(postActionSchema.parse('close_app')).toBe('close_app');

    expect(() => postActionSchema.parse('destroy_computer')).toThrow();
  });

  it('validates soundSettingsSchema defaults and constraints', () => {
    const def = soundSettingsSchema.parse({});
    expect(def.enabled).toBe(true);
    expect(def.volume).toBe(100);
    expect(def.playOnFailure).toBe(false);

    const custom = soundSettingsSchema.parse({
      enabled: false,
      volume: 65,
      playOnFailure: true,
    });
    expect(custom.volume).toBe(65);
    expect(custom.playOnFailure).toBe(true);

    expect(() => soundSettingsSchema.parse({ volume: 150 })).toThrow();
    expect(() => soundSettingsSchema.parse({ volume: -5 })).toThrow();
  });

  it('validates scheduleConfigSchema', () => {
    const def = scheduleConfigSchema.parse({});
    expect(def.enabled).toBe(false);
    expect(def.blockSleepWhileWaiting).toBe(true);

    const custom = scheduleConfigSchema.parse({
      enabled: true,
      targetTime: '22:45',
      targetTimestamp: 1731290000000,
      blockSleepWhileWaiting: false,
    });
    expect(custom.enabled).toBe(true);
    expect(custom.targetTime).toBe('22:45');
    expect(custom.blockSleepWhileWaiting).toBe(false);
  });

  it('validates historyEntrySchema and historyListSchema', () => {
    const validEntry = {
      id: 'hist-1',
      jobId: 'job-1',
      filePath: '/path/to/scene.blend',
      fileName: 'scene.blend',
      project: 'scene',
      scene: 'Scene',
      camera: 'Camera',
      frameCount: 150,
      totalTimeSeconds: 240.5,
      averageFrameTimeSeconds: 1.6,
      engine: 'CYCLES',
      device: 'GPU: NVIDIA RTX 4090 (OPTIX)',
      result: 'completed',
      failedFrames: [],
      outputPath: '/path/to/renders/scene_####.png',
      timestamp: 1731289200000,
    };

    const parsed = historyEntrySchema.parse(validEntry);
    expect(parsed.device).toBe('GPU: NVIDIA RTX 4090 (OPTIX)');
    expect(parsed.result).toBe('completed');

    const list = historyListSchema.parse([parsed]);
    expect(list.length).toBe(1);

    expect(() =>
      historyEntrySchema.parse({
        ...validEntry,
        result: 'unknown_result',
      }),
    ).toThrow();
  });

  it('validates queueSettingsSchema with sound, postAction and schedule fields', () => {
    const settings = queueSettingsSchema.parse({});
    expect(settings.postAction).toBe('none');
    expect(settings.sound.enabled).toBe(true);
    expect(settings.sound.volume).toBe(100);
  });
});

describe('todung.wav Sound Synthesis', () => {
  const soundPath = path.resolve(__dirname, '../resources/sounds/todung.wav');

  it('verifies todung.wav file exists on disk', () => {
    expect(fs.existsSync(soundPath)).toBe(true);
  });

  it('verifies todung.wav RIFF header and 16-bit PCM properties', () => {
    const buf = fs.readFileSync(soundPath);
    expect(buf.length).toBeGreaterThan(44);

    // RIFF header
    expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buf.toString('ascii', 8, 12)).toBe('WAVE');

    // fmt chunk
    expect(buf.toString('ascii', 12, 16)).toBe('fmt ');
    const audioFormat = buf.readUInt16LE(20);
    expect(audioFormat).toBe(1); // 1 = PCM

    const channels = buf.readUInt16LE(22);
    expect(channels).toBe(1); // Mono

    const sampleRate = buf.readUInt32LE(24);
    expect(sampleRate).toBe(44100);

    const bitsPerSample = buf.readUInt16LE(34);
    expect(bitsPerSample).toBe(16);

    // data chunk
    expect(buf.toString('ascii', 36, 40)).toBe('data');
    const dataSize = buf.readUInt32LE(40);
    expect(dataSize).toBe(buf.length - 44);

    // Duration is ~1.25 seconds
    const duration = dataSize / (sampleRate * channels * (bitsPerSample / 8));
    expect(duration).toBeCloseTo(1.25, 1);
  });
});
