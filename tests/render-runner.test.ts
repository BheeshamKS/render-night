import type { RunnerPayload } from '../src/core/schemas/override';
import {
  type RunnerEvent,
  runnerEventSchema,
  RN_EVENT_PREFIX,
} from '../src/core/schemas/runner-event';

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const MOCK_BLENDER_PATH = path.resolve(__dirname, '../tools/mock-blender/index.js');
const RUNNER_SCRIPT_PATH = path.resolve(__dirname, '../resources/python/render_runner.py');

describe('Render Runner & Mock Blender Protocol Integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-night-runner-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  function runMockBlender(payload: RunnerPayload): Promise<{
    events: RunnerEvent[];
    stdoutLines: string[];
    exitCode: number | null;
  }> {
    const payloadPath = path.join(tmpDir, 'payload.json');
    fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2), 'utf8');

    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [MOCK_BLENDER_PATH, '-b', payload.blendPath, '-P', RUNNER_SCRIPT_PATH, '--', payloadPath],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );

      const events: RunnerEvent[] = [];
      const stdoutLines: string[] = [];

      let buffer = '';
      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          stdoutLines.push(trimmed);
          if (trimmed.startsWith(RN_EVENT_PREFIX)) {
            const jsonStr = trimmed.slice(RN_EVENT_PREFIX.length).trim();
            try {
              const parsed = runnerEventSchema.parse(JSON.parse(jsonStr));
              events.push(parsed);
            } catch (err) {
              console.error('Failed to parse event JSON:', jsonStr, err);
            }
          }
        }
      });

      child.on('error', reject);
      child.on('close', (exitCode) => {
        resolve({ events, stdoutLines, exitCode });
      });
    });
  }

  it('executes a 3-frame job and streams structured events and native stdout', async () => {
    const controlFile = path.join(tmpDir, 'control.json');
    const outputDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(outputDir, { recursive: true });

    const payload: RunnerPayload = {
      blendPath: path.join(tmpDir, 'scene.blend'),
      scene: 'Scene',
      camera: 'Camera',
      overrides: {
        'scene.cycles.samples': 128,
        'scene.eevee.bloom': true,
      },
      frames: [1, 2, 3],
      outputPattern: path.join(outputDir, 'shot_####.png'),
      outputDir,
      controlFile,
      devicePreferences: {
        deviceType: 'OPTIX',
        enableGpu: true,
      },
      threads: 8,
    };

    const result = await runMockBlender(payload);
    expect(result.exitCode).toBe(0);

    const eventTypes = result.events.map((e) => e.type);
    expect(eventTypes).toContain('device_report');
    expect(eventTypes).toContain('overrides_report');
    expect(eventTypes).toContain('job_start');
    expect(eventTypes).toContain('frame_start');
    expect(eventTypes).toContain('frame_done');
    expect(eventTypes).toContain('job_done');

    const frameDones = result.events.filter((e) => e.type === 'frame_done');
    expect(frameDones).toHaveLength(3);

    // Native Blender stdout was also emitted
    const hasFraLine = result.stdoutLines.some((l) => l.includes('Fra:'));
    expect(hasFraLine).toBe(true);
  });

  it('handles pause and resume via control.json', async () => {
    const controlFile = path.join(tmpDir, 'control.json');
    const outputDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(outputDir, { recursive: true });

    // Start with paused control file
    fs.writeFileSync(controlFile, JSON.stringify({ command: 'pause' }), 'utf8');

    const payload: RunnerPayload = {
      blendPath: path.join(tmpDir, 'scene.blend'),
      scene: 'Scene',
      frames: [1, 2],
      outputPattern: path.join(outputDir, 'shot_####.png'),
      outputDir,
      controlFile,
      overrides: {},
    };

    const payloadPath = path.join(tmpDir, 'payload.json');
    fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2), 'utf8');

    const child = spawn(
      process.execPath,
      [MOCK_BLENDER_PATH, '-b', payload.blendPath, '-P', RUNNER_SCRIPT_PATH, '--', payloadPath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const events: RunnerEvent[] = [];
    child.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(RN_EVENT_PREFIX)) {
          const jsonStr = trimmed.slice(RN_EVENT_PREFIX.length).trim();
          try {
            const parsed = runnerEventSchema.parse(JSON.parse(jsonStr));
            events.push(parsed);
          } catch {
            // Ignore
          }
        }
      }
    });

    // Wait 50ms while child is paused, then resume
    await new Promise((r) => setTimeout(r, 50));
    fs.writeFileSync(controlFile, JSON.stringify({ command: 'continue' }), 'utf8');

    await new Promise((resolve) => child.on('close', resolve));
    const frameDones = events.filter((e) => e.type === 'frame_done');
    expect(frameDones).toHaveLength(2);
  });

  it('stops early when control.json contains stop command', async () => {
    const controlFile = path.join(tmpDir, 'control.json');
    const outputDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(outputDir, { recursive: true });

    const payload: RunnerPayload = {
      blendPath: path.join(tmpDir, 'scene.blend'),
      scene: 'Scene',
      frames: [1, 2, 3, 4, 5],
      outputPattern: path.join(outputDir, 'shot_####.png'),
      outputDir,
      controlFile,
      overrides: {},
    };

    const payloadPath = path.join(tmpDir, 'payload.json');
    fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2), 'utf8');

    const child = spawn(
      process.execPath,
      [MOCK_BLENDER_PATH, '-b', payload.blendPath, '-P', RUNNER_SCRIPT_PATH, '--', payloadPath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const events: RunnerEvent[] = [];
    child.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(RN_EVENT_PREFIX)) {
          const jsonStr = trimmed.slice(RN_EVENT_PREFIX.length).trim();
          try {
            const parsed = runnerEventSchema.parse(JSON.parse(jsonStr));
            events.push(parsed);
            if (parsed.type === 'frame_done' && parsed.frame === 1) {
              // Tell runner to stop
              fs.writeFileSync(controlFile, JSON.stringify({ command: 'stop' }), 'utf8');
            }
          } catch {
            // Ignore
          }
        }
      }
    });

    await new Promise((resolve) => child.on('close', resolve));
    const frameDones = events.filter((e) => e.type === 'frame_done');
    expect(frameDones.length).toBeLessThan(5);
    const jobDone = events.find((e) => e.type === 'job_done');
    expect(jobDone).toBeDefined();
  });
});
