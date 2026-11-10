import {
  duplicateJob,
  expandAllCameras,
  expandAllScenes,
  type JobToolsTarget,
} from '../src/core/queue/job-tools';

import { describe, it, expect } from 'vitest';

describe('Job Tools (duplicate, expand cameras, expand scenes)', () => {
  const baseJob: JobToolsTarget = {
    id: 'job-123',
    filePath: '/renders/my_project.blend',
    fileName: 'my_project.blend',
    project: 'my_project',
    enabled: true,
    status: 'Rendering',
    selectedScene: 'Scene',
    selectedCamera: 'Camera_Main',
    scenes: [
      {
        name: 'Scene',
        activeCamera: 'Camera_Main',
        cameras: ['Camera_Main', 'Camera_Wide', 'Camera_CloseUp'],
        viewLayers: ['ViewLayer'],
        frameStart: 1,
        frameEnd: 100,
        frameStep: 1,
        fps: 24,
        fpsBase: 1,
        resolutionX: 1920,
        resolutionY: 1080,
        resolutionPercentage: 100,
        render: {},
        imageSettings: {},
        ffmpeg: {},
        cycles: {},
        eevee: {},
        viewSettings: {},
        displaySettings: {},
      },
      {
        name: 'Scene_Night',
        activeCamera: 'Camera_Night',
        cameras: ['Camera_Night'],
        viewLayers: ['ViewLayer'],
        frameStart: 101,
        frameEnd: 250,
        frameStep: 1,
        fps: 24,
        fpsBase: 1,
        resolutionX: 1920,
        resolutionY: 1080,
        resolutionPercentage: 100,
        render: {},
        imageSettings: {},
        ffmpeg: {},
        cycles: {},
        eevee: {},
        viewSettings: {},
        displaySettings: {},
      },
    ],
    availableCameras: ['Camera_Main', 'Camera_Wide', 'Camera_CloseUp'],
    outputPathPattern: '//renders/{scene}/{camera}/frame_####.png',
    outputPreview: '//renders/Scene/Camera_Main/frame_0001.png',
    rangeConfig: { mode: 'scene_default' },
    overrides: { 'cycles.samples': 256 },
    presets: ['HighQuality'],
    preRenderHook: 'print("pre-hook")',
  };

  it('duplicateJob creates a clone with new ID and reset state', () => {
    const dup = duplicateJob(baseJob);

    expect(dup.id).not.toBe(baseJob.id);
    expect(dup.status).toBe('Queued');
    expect(dup.completedFrames).toBe(0);
    expect(dup.filePath).toBe(baseJob.filePath);
    expect(dup.selectedScene).toBe('Scene');
    expect(dup.selectedCamera).toBe('Camera_Main');
    expect(dup.overrides).toEqual({ 'cycles.samples': 256 });
    expect(dup.presets).toEqual(['HighQuality']);
    expect(dup.preRenderHook).toBe('print("pre-hook")');
  });

  it('expandAllCameras expands multiple cameras into distinct jobs', () => {
    const expanded = expandAllCameras(baseJob);

    expect(expanded.length).toBe(3);
    expect(expanded.map((j) => j.selectedCamera)).toEqual([
      'Camera_Main',
      'Camera_Wide',
      'Camera_CloseUp',
    ]);

    // All should have unique IDs
    const ids = new Set(expanded.map((j) => j.id));
    expect(ids.size).toBe(3);

    // Each output preview should contain the respective camera name
    expect(expanded[0].outputPreview).toContain('Camera_Main');
    expect(expanded[1].outputPreview).toContain('Camera_Wide');
    expect(expanded[2].outputPreview).toContain('Camera_CloseUp');
  });

  it('expandAllScenes expands multiple scenes into distinct jobs', () => {
    const expanded = expandAllScenes(baseJob);

    expect(expanded.length).toBe(2);
    expect(expanded[0].selectedScene).toBe('Scene');
    expect(expanded[0].selectedCamera).toBe('Camera_Main');
    expect(expanded[0].outputPreview).toContain('Scene');

    expect(expanded[1].selectedScene).toBe('Scene_Night');
    expect(expanded[1].selectedCamera).toBe('Camera_Night');
    expect(expanded[1].outputPreview).toContain('Scene_Night');
    expect(expanded[1].outputPreview).toContain('Camera_Night');

    const ids = new Set(expanded.map((j) => j.id));
    expect(ids.size).toBe(2);
  });

  it('expandAllCameras returns single duplicate when only 1 or 0 cameras exist', () => {
    const singleCamJob = {
      ...baseJob,
      availableCameras: ['Camera_Solo'],
    };
    const expanded = expandAllCameras(singleCamJob);
    expect(expanded.length).toBe(1);
    expect(expanded[0].id).not.toBe(singleCamJob.id);
    expect(expanded[0].selectedCamera).toBe('Camera_Solo');
  });

  it('expandAllScenes returns single duplicate when only 1 or 0 scenes exist', () => {
    const singleSceneJob = {
      ...baseJob,
      scenes: [baseJob.scenes[0]],
    };
    const expanded = expandAllScenes(singleSceneJob);
    expect(expanded.length).toBe(1);
    expect(expanded[0].id).not.toBe(singleSceneJob.id);
    expect(expanded[0].selectedScene).toBe('Scene');
  });
});
