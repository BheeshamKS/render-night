import { PresetStore } from '../src/core/presets/preset-store';
import type { InspectScene } from '../src/core/schemas/inspect';
import { useQueueStore, type QueueJob } from '../src/renderer/store/queueStore';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('End-to-End Acceptance: Overrides Diff, Copy-Paste, Compatibility Skip Report & Presets', () => {
  let tmpDir: string;
  let presetFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-overrides-e2e-'));
    presetFilePath = path.join(tmpDir, 'presets.json');

    useQueueStore.setState({
      jobs: [],
      copiedOverrides: null,
      pasteReportModal: null,
      logs: [],
    });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  const createDummyScene = (engine = 'CYCLES'): InspectScene => ({
    name: 'Scene',
    activeCamera: 'Camera',
    cameras: ['Camera'],
    viewLayers: ['ViewLayer'],
    frameStart: 1,
    frameEnd: 100,
    frameStep: 1,
    fps: 24,
    fpsBase: 1,
    resolutionX: 1280,
    resolutionY: 720,
    resolutionPercentage: 100,
    render: {
      engine: {
        value: engine,
        type: 'ENUM',
        name: 'Engine',
        enumItems: [
          { identifier: 'CYCLES', name: 'Cycles' },
          { identifier: 'BLENDER_EEVEE_NEXT', name: 'EEVEE' },
        ],
      },
    },
    imageSettings: {
      file_format: {
        value: 'PNG',
        type: 'ENUM',
        name: 'File Format',
      },
      color_depth: {
        value: '8',
        type: 'ENUM',
        name: 'Color Depth',
      },
    },
    ffmpeg: {},
    cycles: {
      samples: {
        value: 128,
        type: 'INT',
        name: 'Render Samples',
      },
    },
    eevee: {
      taa_render_samples: {
        value: 64,
        type: 'INT',
        name: 'Render Samples',
      },
    },
    viewSettings: {},
    displaySettings: {},
  });

  const createDummyJob = (id: string, name: string, engine = 'CYCLES'): QueueJob => ({
    id,
    filePath: `/projects/${name}`,
    fileName: name,
    project: name.replace(/\.blend$/, ''),
    enabled: true,
    status: 'Queued',
    selectedScene: 'Scene',
    selectedCamera: 'Camera',
    scenes: [createDummyScene(engine)],
    availableCameras: ['Camera'],
    outputPathPattern: '//render/{project}_####.png',
    outputPreview: `/projects/render/${name.replace(/\.blend$/, '')}_0001.png`,
    logs: [],
    rangeConfig: { mode: 'scene_default' },
    failedFrames: [],
    renderMissingOnly: false,
    overrides: {},
    presets: [],
    deviceReport: {
      type: 'device_report',
      computeDeviceType: engine === 'CYCLES' ? 'CUDA' : 'NONE',
      engine,
      mode: engine === 'CYCLES' ? 'GPU' : 'GPU',
      devices: [],
      requestedGpu: true,
      fallbackToCpu: false,
    },
  });

  it('sets 1080p, 256 samples, PNG 16-bit on Job 1, copies and pastes to 5 other jobs (including one on EEVEE), verifying the skip report dialog; saves as preset and reloads after restart', async () => {
    // 1. Create 6 jobs: Job 0 (source) + 4 Cycles jobs (Jobs 1-4) + 1 EEVEE job (Job 5)
    const job0 = createDummyJob('job-0', 'hero_shot.blend', 'CYCLES');
    const job1 = createDummyJob('job-1', 'shot_01.blend', 'CYCLES');
    const job2 = createDummyJob('job-2', 'shot_02.blend', 'CYCLES');
    const job3 = createDummyJob('job-3', 'shot_03.blend', 'CYCLES');
    const job4 = createDummyJob('job-4', 'shot_04.blend', 'CYCLES');
    const job5 = createDummyJob('job-5', 'shot_eevee.blend', 'BLENDER_EEVEE_NEXT');

    useQueueStore.setState({
      jobs: [job0, job1, job2, job3, job4, job5],
    });

    const store = useQueueStore.getState();

    // 2. Configure 1080p, 256 samples, and PNG 16-bit on Job 0
    store.setJobOverride(job0.id, 'scene.render.resolution_x', 1920);
    store.setJobOverride(job0.id, 'scene.render.resolution_y', 1080);
    store.setJobOverride(job0.id, 'scene.cycles.samples', 256);
    store.setJobOverride(job0.id, 'scene.render.image_settings.color_depth', '16');

    // Verify Job 0 diff
    const updatedJob0 = useQueueStore.getState().jobs.find((j) => j.id === job0.id);
    expect(updatedJob0?.overrides).toEqual({
      'scene.render.resolution_x': 1920,
      'scene.render.resolution_y': 1080,
      'scene.cycles.samples': 256,
      'scene.render.image_settings.color_depth': '16',
    });

    // 3. Copy overrides from Job 0 to clipboard
    useQueueStore.getState().copyOverrides(job0.id);
    const clipboard = useQueueStore.getState().copiedOverrides;
    expect(clipboard).toBeDefined();
    expect(clipboard).toEqual(updatedJob0?.overrides);

    // 4. Paste overrides onto 5 other jobs (Jobs 1, 2, 3, 4, 5)
    useQueueStore.getState().pasteOverrides([job1.id, job2.id, job3.id, job4.id, job5.id]);

    // Verify Paste Report Modal state
    const reportModal = useQueueStore.getState().pasteReportModal;
    expect(reportModal).not.toBeNull();
    expect(reportModal?.isOpen).toBe(true);
    expect(reportModal?.reports).toHaveLength(5);

    // Verify Cycles jobs (Jobs 1 to 4) received all 4 overrides with 0 skipped
    for (const cycleJobId of [job1.id, job2.id, job3.id, job4.id]) {
      const rep = reportModal?.reports.find((r) => r.jobId === cycleJobId);
      expect(rep).toBeDefined();
      expect(rep?.applied).toContain('scene.render.resolution_x');
      expect(rep?.applied).toContain('scene.render.resolution_y');
      expect(rep?.applied).toContain('scene.cycles.samples');
      expect(rep?.applied).toContain('scene.render.image_settings.color_depth');
      expect(rep?.skipped).toEqual([]);

      const targetJob = useQueueStore.getState().jobs.find((j) => j.id === cycleJobId);
      expect(targetJob?.overrides?.['scene.cycles.samples']).toBe(256);
      expect(targetJob?.overrides?.['scene.render.resolution_x']).toBe(1920);
      expect(targetJob?.overrides?.['scene.render.image_settings.color_depth']).toBe('16');
    }

    // Verify EEVEE job (Job 5) skipped scene.cycles.samples with reason
    const eeveeReport = reportModal?.reports.find((r) => r.jobId === job5.id);
    expect(eeveeReport).toBeDefined();
    expect(eeveeReport?.applied).toContain('scene.render.resolution_x');
    expect(eeveeReport?.applied).toContain('scene.render.resolution_y');
    expect(eeveeReport?.applied).toContain('scene.render.image_settings.color_depth');
    expect(eeveeReport?.applied).not.toContain('scene.cycles.samples');

    // The skip reason must state incompatible engine
    expect(eeveeReport?.skipped).toHaveLength(1);
    expect(eeveeReport?.skipped[0].rnaPath).toBe('scene.cycles.samples');
    expect(eeveeReport?.skipped[0].reason).toContain('BLENDER_EEVEE_NEXT');

    // Job 5 state must have resolution and color depth, but NOT cycles.samples
    const targetEeveeJob = useQueueStore.getState().jobs.find((j) => j.id === job5.id);
    expect(targetEeveeJob?.overrides?.['scene.render.resolution_x']).toBe(1920);
    expect(targetEeveeJob?.overrides?.['scene.render.image_settings.color_depth']).toBe('16');
    expect(targetEeveeJob?.overrides?.['scene.cycles.samples']).toBeUndefined();

    // 5. Save as named preset
    const presetStore = new PresetStore(presetFilePath);
    const savedPreset = await presetStore.savePreset({
      name: '1080p / 256 samples / PNG 16-bit',
      overrides: { ...updatedJob0!.overrides },
      engine: 'CYCLES',
    });

    expect(savedPreset.id).toBeDefined();
    expect(savedPreset.name).toBe('1080p / 256 samples / PNG 16-bit');
    expect(savedPreset.overrides['scene.cycles.samples']).toBe(256);
    expect(savedPreset.overrides['scene.render.resolution_x']).toBe(1920);

    // 6. Simulate restart / reload from disk
    const reloadedPresetStore = new PresetStore(presetFilePath);
    const loadedPresets = await reloadedPresetStore.loadPresets(true);

    expect(loadedPresets).toHaveLength(1);
    expect(loadedPresets[0].name).toBe('1080p / 256 samples / PNG 16-bit');
    expect(loadedPresets[0].overrides).toEqual(savedPreset.overrides);

    // 7. Apply the reloaded preset to a fresh job
    const freshJob = createDummyJob('job-fresh', 'fresh_shot.blend', 'CYCLES');
    useQueueStore.getState().applyPresetToJob(freshJob.id, loadedPresets[0]);

    // Add fresh job to store and verify
    useQueueStore.setState((s) => ({ jobs: [...s.jobs, freshJob] }));
    useQueueStore.getState().applyPresetToJob(freshJob.id, loadedPresets[0]);

    const updatedFresh = useQueueStore.getState().jobs.find((j) => j.id === freshJob.id);
    expect(updatedFresh?.overrides).toEqual(savedPreset.overrides);
    expect(updatedFresh?.presets).toContain('1080p / 256 samples / PNG 16-bit');
  });
});
