import { queueStateSchema } from '../src/core/schemas/queue-state';
import { fromPersistedJob, type QueueJob, toPersistedJob } from '../src/renderer/store/queueStore';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Queue Export & Import', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-export-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  const sampleUiJob: QueueJob = {
    id: 'job-101',
    filePath: '/scenes/test-scene.blend',
    fileName: 'test-scene.blend',
    project: 'test-scene',
    enabled: true,
    status: 'Queued',
    selectedScene: 'Scene_Main',
    selectedCamera: 'Camera_Front',
    scenes: [
      {
        name: 'Scene_Main',
        frameStart: 10,
        frameEnd: 80,
        frameStep: 2,
        fps: 24,
        fpsBase: 1,
        resolutionX: 1920,
        resolutionY: 1080,
        resolutionPercentage: 100,
        render: {},
        imageSettings: {
          file_format: { value: 'PNG', type: 'ENUM', name: 'Format' },
        },
        ffmpeg: {},
        cycles: {},
        eevee: {},
        viewSettings: {},
        displaySettings: {},
        viewLayers: ['ViewLayer'],
        activeCamera: 'Camera_Front',
        cameras: ['Camera_Front', 'Camera_Top'],
      },
    ],
    availableCameras: ['Camera_Front', 'Camera_Top'],
    outputPathPattern: '//render/{project}/{scene}_{camera}_####.png',
    outputPreview: 'render/test-scene/Scene_Main_Camera_Front_0010.png',
    logs: [],
    rangeConfig: { mode: 'custom', customExpression: '10-30, 40-50' },
    renderMissingOnly: true,
    crashPolicy: {
      maxRetries: 4,
      maxConsecutiveCrashes: 2,
      fallbackToCpu: true,
      skipOnFailure: false,
    },
    failedFrames: [],
    overrides: {
      'cycles.samples': 256,
      'cycles.device': 'GPU',
    },
    presets: ['high-quality'],
    preRenderHook: 'echo "Pre-render"',
  };

  it('converts QueueJob to PersistedJob and back without losing critical properties', () => {
    const persisted = toPersistedJob(sampleUiJob);
    expect(persisted.id).toBe('job-101');
    expect(persisted.blendPath).toBe('/scenes/test-scene.blend');
    expect(persisted.name).toBe('test-scene.blend');
    expect(persisted.status).toBe('pending');
    expect(persisted.renderMissingOnly).toBe(true);
    expect(persisted.rangeConfig).toEqual({ mode: 'custom', customExpression: '10-30, 40-50' });
    expect(persisted.overrides).toEqual({
      'cycles.samples': 256,
      'cycles.device': 'GPU',
    });
    expect(persisted.preRenderHook).toBe('echo "Pre-render"');

    // Convert back to UI job
    const restored = fromPersistedJob(persisted);
    expect(restored.id).toBe('job-101');
    expect(restored.filePath).toBe('/scenes/test-scene.blend');
    expect(restored.fileName).toBe('test-scene.blend');
    expect(restored.project).toBe('test-scene');
    expect(restored.status).toBe('Queued');
    expect(restored.renderMissingOnly).toBe(true);
    expect(restored.rangeConfig).toEqual({ mode: 'custom', customExpression: '10-30, 40-50' });
    expect(restored.overrides).toEqual({
      'cycles.samples': 256,
      'cycles.device': 'GPU',
    });
    expect(restored.preRenderHook).toBe('echo "Pre-render"');
  });

  it('produces a valid queueStateSchema JSON file compatible with night-render CLI', () => {
    const persistedJob = toPersistedJob(sampleUiJob);
    const queueData = {
      version: 1,
      jobs: [persistedJob],
      settings: {
        concurrentJobs: 1,
        stopOnFailure: false,
        closeAppOnCompletion: false,
        closeAppOnCompletionMode: 'last' as const,
        soundOnCompletion: true,
        soundOnFailure: false,
        powerMode: 'none',
        pauseOnBattery: false,
        resumeOnAc: false,
        maxConcurrentFrames: 1,
        postAction: 'none' as const,
        sound: { enabled: true, volume: 100, playOnFailure: false },
      },
    };

    const validated = queueStateSchema.safeParse(queueData);
    expect(validated.success).toBe(true);

    const exportPath = path.join(tmpDir, 'test-exported.rnqueue.json');
    fs.writeFileSync(exportPath, JSON.stringify(queueData, null, 2), 'utf-8');

    const fileContent = fs.readFileSync(exportPath, 'utf-8');
    const parsed = JSON.parse(fileContent);
    const validatedRead = queueStateSchema.safeParse(parsed);
    expect(validatedRead.success).toBe(true);
    if (validatedRead.success) {
      expect(validatedRead.data.jobs).toHaveLength(1);
      expect(validatedRead.data.jobs[0].blendPath).toBe('/scenes/test-scene.blend');
    }
  });

  it('handles CLI minimal queue structure with fallback', () => {
    // Minimal CLI queue structure { jobs: [...] }
    const minimalCliQueue = {
      jobs: [
        {
          id: 'cli-job-1',
          blendPath: '/scenes/cli.blend',
          name: 'cli.blend',
          status: 'pending',
          range: { start: 1, end: 100, step: 1 },
          outputPattern: '//render/####.png',
        },
      ],
    };

    const exportPath = path.join(tmpDir, 'cli-queue.json');
    fs.writeFileSync(exportPath, JSON.stringify(minimalCliQueue), 'utf-8');

    const raw = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
    expect(Array.isArray(raw.jobs)).toBe(true);

    const imported = fromPersistedJob(raw.jobs[0]);
    expect(imported.id).toBe('cli-job-1');
    expect(imported.filePath).toBe('/scenes/cli.blend');
    expect(imported.fileName).toBe('cli.blend');
    expect(imported.status).toBe('Queued');
  });
});
