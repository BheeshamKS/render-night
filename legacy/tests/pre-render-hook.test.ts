import { QueueEngine, type QueueEngineJob } from '../src/core/queue/queue-engine';
import { parseStdoutLine } from '../src/core/render/stdout-parser';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

describe('Pre-render Python Hook', () => {
  it('parses pre_render_hook events via parseStdoutLine', () => {
    const startLine = 'RN_EVENT {"type":"pre_render_hook_start"}';
    const parsedStart = parseStdoutLine(startLine);
    expect(parsedStart.kind).toBe('event');
    expect(parsedStart.event?.type).toBe('pre_render_hook_start');

    const successLine =
      'RN_EVENT {"type":"pre_render_hook_success","hook":"print(\'custom setup\')"}';
    const parsedSuccess = parseStdoutLine(successLine);
    expect(parsedSuccess.kind).toBe('event');
    expect(parsedSuccess.event?.type).toBe('pre_render_hook_success');
    if (parsedSuccess.event?.type === 'pre_render_hook_success') {
      expect(parsedSuccess.event.hook).toBe("print('custom setup')");
    }

    const errorLine =
      'RN_EVENT {"type":"pre_render_hook_error","hook":"raise Exception()","error":"Boom","traceback":"Traceback..."}';
    const parsedError = parseStdoutLine(errorLine);
    expect(parsedError.kind).toBe('event');
    expect(parsedError.event?.type).toBe('pre_render_hook_error');
    if (parsedError.event?.type === 'pre_render_hook_error') {
      expect(parsedError.event.error).toBe('Boom');
    }
  });

  it('runs preRenderHook in mock blender and emits hook events through QueueEngine', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-hook-test-'));
    const logsDir = path.join(tmpDir, 'logs');
    const runtimeDir = path.join(tmpDir, 'runtime');
    const outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });

    const mockBlender = path.resolve(__dirname, '../tools/mock-blender/index.js');
    const engine = new QueueEngine({
      logsDir,
      runtimeDir,
    });

    const hookStartSpy = vi.fn();
    const hookSuccessSpy = vi.fn();
    engine.on('hook:start', hookStartSpy);
    engine.on('hook:success', hookSuccessSpy);

    const job: QueueEngineJob = {
      id: 'job-hook-1',
      blendPath: path.resolve(__dirname, 'fixtures/sample.blend'),
      executable: ['node', mockBlender],
      frames: [1],
      outputPattern: 'hook_####.png',
      outputDir: outDir,
      preRenderHook: 'bpy.context.scene.render.resolution_x = 1920',
    };

    await engine.start([job]);

    expect(hookStartSpy).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-hook-1' }));
    expect(hookSuccessSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-hook-1',
        hook: 'bpy.context.scene.render.resolution_x = 1920',
      }),
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles preRenderHook failure in mock blender', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-hook-fail-test-'));
    const logsDir = path.join(tmpDir, 'logs');
    const runtimeDir = path.join(tmpDir, 'runtime');
    const outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });

    const mockBlender = path.resolve(__dirname, '../tools/mock-blender/index.js');
    const engine = new QueueEngine({
      logsDir,
      runtimeDir,
    });

    const hookErrorSpy = vi.fn();
    engine.on('hook:error', hookErrorSpy);

    const job: QueueEngineJob = {
      id: 'job-hook-fail',
      blendPath: path.resolve(__dirname, 'fixtures/sample.blend'),
      executable: ['node', mockBlender],
      frames: [1],
      outputPattern: 'hook_fail_####.png',
      outputDir: outDir,
      preRenderHook: 'RAISE_ERROR: invalid script',
      crashPolicy: {
        maxRetries: 0,
        fallbackToCpu: false,
        skipOnFailure: false,
        maxConsecutiveCrashes: 1,
      },
    };

    await engine.start([job]);

    expect(hookErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-hook-fail',
        error: 'Simulated pre-render hook execution failure',
      }),
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
