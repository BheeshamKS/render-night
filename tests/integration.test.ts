import { inspectBlend } from '../src/core/blender/inspector';
import { useQueueStore } from '../src/renderer/store/queueStore';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Render Night Integration & Acceptance', () => {
  const mockBlender = path.resolve(__dirname, '../tools/mock-blender/index.js');
  const tempDir = path.join(os.tmpdir(), 'rn-integration-tests');
  const file1 = path.join(tempDir, 'shot_01.blend');
  const file2 = path.join(tempDir, 'character_idle.blend');
  const file3 = path.join(tempDir, 'environment_forest.blend');
  const corruptFile = path.join(tempDir, 'corrupt.blend');

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(file1, Buffer.from('BLENDER_v402_dummy1'));
    fs.writeFileSync(file2, Buffer.from('BLENDER_v402_dummy2'));
    fs.writeFileSync(file3, Buffer.from('BLENDER_v306_dummy3'));
    fs.writeFileSync(corruptFile, Buffer.from('BLENDER_v402_corrupt'));

    // Mock window.rnApi for in-memory integration testing of the Zustand store
    (globalThis as unknown as { window: unknown }).window = {
      rnApi: {
        platform: 'linux',
        discoverBlenders: async () => [
          {
            id: 'mock-4.2',
            executable: [process.execPath, mockBlender],
            displayPath: '/usr/bin/blender-4.2',
            version: '4.2.0',
            major: 4,
            minor: 2,
            patch: 0,
            isPortable: false,
            source: 'system',
          },
          {
            id: 'mock-3.6',
            executable: [process.execPath, mockBlender],
            displayPath: '/usr/bin/blender-3.6',
            version: '3.6.12',
            major: 3,
            minor: 6,
            patch: 12,
            isPortable: false,
            source: 'system',
          },
        ],
        inspectBlend: async (
          blendPath: string,
          blenderExecutable: string | string[],
          options = {},
        ) => {
          return inspectBlend(blendPath, blenderExecutable, options);
        },
      },
    };
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads discovered Blender instances and defaults to latest', async () => {
    const store = useQueueStore.getState();
    await store.loadBlenders();

    const state = useQueueStore.getState();
    expect(state.blenders.length).toBe(2);
    expect(state.selectedBlenderId).toBe('mock-4.2');
  });

  it('accepts 3 dropped files, inspects them, and populates scenes and token preview', async () => {
    const store = useQueueStore.getState();
    await store.addFiles([file1, file2, file3]);

    const state = useQueueStore.getState();
    expect(state.jobs.length).toBe(3);

    // Check job 1
    const job1 = state.jobs.find((j) => j.fileName === 'shot_01.blend');
    expect(job1).toBeDefined();
    expect(job1?.status).toBe('Queued');
    expect(job1?.project).toBe('shot_01');
    expect(job1?.selectedScene).toBe('Scene');
    expect(job1?.selectedCamera).toBe('Camera');
    expect(job1?.outputPreview).toContain('shot_01/Scene_Camera_0001.png');

    // Check job 2
    const job2 = state.jobs.find((j) => j.fileName === 'character_idle.blend');
    expect(job2).toBeDefined();
    expect(job2?.status).toBe('Queued');
    expect(job2?.outputPreview).toContain('character_idle');

    // Check job 3
    const job3 = state.jobs.find((j) => j.fileName === 'environment_forest.blend');
    expect(job3).toBeDefined();
    expect(job3?.status).toBe('Queued');
  });

  it('updates token preview dynamically when user switches scene or camera', () => {
    const store = useQueueStore.getState();
    const job = store.jobs[0];

    // Switch camera
    store.updateJob(job.id, { selectedCamera: 'Camera.001' });
    let updatedJob = useQueueStore.getState().jobs.find((j) => j.id === job.id);
    expect(updatedJob?.selectedCamera).toBe('Camera.001');
    expect(updatedJob?.outputPreview).toContain('Camera.001');

    // Custom pattern edit
    store.updateJob(job.id, { outputPathPattern: '/custom/{project}/{camera}/frame_####.exr' });
    updatedJob = useQueueStore.getState().jobs.find((j) => j.id === job.id);
    expect(updatedJob?.outputPreview).toBe('/custom/shot_01/Camera.001/frame_0001.exr');
  });

  it('supports per-job Blender version override and global switching', () => {
    const store = useQueueStore.getState();
    const job = store.jobs[0];

    store.updateJob(job.id, { blenderOverrideId: 'mock-3.6' });
    const updatedJob = useQueueStore.getState().jobs.find((j) => j.id === job.id);
    expect(updatedJob?.blenderOverrideId).toBe('mock-3.6');

    // Switch global Blender
    store.setSelectedBlenderId('mock-3.6');
    expect(useQueueStore.getState().selectedBlenderId).toBe('mock-3.6');
  });

  it('supports moving and reordering jobs in queue', () => {
    const store = useQueueStore.getState();
    const firstJobId = store.jobs[0].id;
    const secondJobId = store.jobs[1].id;

    // Move first job down
    store.moveJob(firstJobId, 'down');
    const jobs = useQueueStore.getState().jobs;
    expect(jobs[0].id).toBe(secondJobId);
    expect(jobs[1].id).toBe(firstJobId);
  });

  it('records failure and captures stderr tail on corrupt file', async () => {
    const store = useQueueStore.getState();
    await store.addFiles([corruptFile]);

    const corruptJob = useQueueStore.getState().jobs.find((j) => j.fileName === 'corrupt.blend');
    expect(corruptJob).toBeDefined();
    expect(corruptJob?.status).toBe('Failed');
    expect(corruptJob?.inspectStderrTail).toContain('corrupted blend file');
  });
});
