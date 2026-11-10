import { formatActualDevice, HistoryStore } from '../src/core/history';
import { QueueEngine, type QueueEngineJob } from '../src/core/queue/queue-engine';
import type { HistoryEntry } from '../src/core/schemas/history';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('HistoryStore & Actual Device Tracking', () => {
  let tmpDir: string;
  let historyStore: HistoryStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-history-test-'));
    historyStore = new HistoryStore({
      historyDir: tmpDir,
      maxEntriesPerFile: 3,
    });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('formats device report into human-readable device strings', () => {
    // GPU with OptiX
    expect(
      formatActualDevice({
        type: 'device_report',
        engine: 'CYCLES',
        mode: 'GPU',
        computeDeviceType: 'OPTIX',
        devices: [
          { name: 'NVIDIA GeForce RTX 3060', type: 'OPTIX', use: true },
          { name: 'NVIDIA GeForce RTX 4090', type: 'OPTIX', use: true },
        ],
        requestedGpu: true,
        fallbackToCpu: false,
      }),
    ).toBe('GPU: NVIDIA GeForce RTX 3060, NVIDIA GeForce RTX 4090 (OPTIX)');

    // CPU with threads
    expect(
      formatActualDevice({
        type: 'device_report',
        engine: 'CYCLES',
        mode: 'CPU',
        computeDeviceType: 'NONE',
        devices: [],
        requestedGpu: false,
        fallbackToCpu: false,
        threads: 16,
      }),
    ).toBe('CPU: 16 threads');

    // Unverified GPU preferences fallback when no report received
    expect(
      formatActualDevice(undefined, {
        enableGpu: true,
        deviceType: 'CUDA',
      }),
    ).toBe('GPU (CUDA)');

    // CPU fallback
    expect(formatActualDevice(undefined, { enableGpu: false })).toBe('CPU');
  });

  it('appends and reads history entries with query and engine filters', async () => {
    const entry1: HistoryEntry = {
      id: 'hist-1',
      jobId: 'job-1',
      filePath: '/projects/scene_a.blend',
      fileName: 'scene_a.blend',
      project: 'projects',
      scene: 'Scene',
      camera: 'Camera.001',
      frameCount: 10,
      totalTimeSeconds: 50,
      averageFrameTimeSeconds: 5,
      engine: 'CYCLES',
      device: 'GPU: NVIDIA GeForce RTX 3060 (OPTIX)',
      result: 'completed',
      failedFrames: [],
      outputPath: '/renders/scene_a',
      timestamp: 1000,
    };

    const entry2: HistoryEntry = {
      id: 'hist-2',
      jobId: 'job-2',
      filePath: '/projects/exterior_b.blend',
      fileName: 'exterior_b.blend',
      project: 'projects',
      scene: 'Exterior',
      camera: 'MainCam',
      frameCount: 20,
      totalTimeSeconds: 120,
      averageFrameTimeSeconds: 6,
      engine: 'BLENDER_EEVEE_NEXT',
      device: 'GPU',
      result: 'failed',
      failedFrames: [15, 16],
      outputPath: '/renders/exterior_b',
      timestamp: 2000,
    };

    await historyStore.appendEntry(entry1);
    await historyStore.appendEntry(entry2);

    // Default retrieval (newest first)
    const all = await historyStore.getEntries();
    expect(all.length).toBe(2);
    expect(all[0].id).toBe('hist-2');
    expect(all[1].id).toBe('hist-1');

    // Filter by query (matches filename or scene or camera)
    const filteredQuery = await historyStore.getEntries({ query: 'exterior' });
    expect(filteredQuery.length).toBe(1);
    expect(filteredQuery[0].id).toBe('hist-2');

    // Filter by result
    const filteredResult = await historyStore.getEntries({ result: 'completed' });
    expect(filteredResult.length).toBe(1);
    expect(filteredResult[0].id).toBe('hist-1');

    // Filter by engine
    const filteredEngine = await historyStore.getEntries({ engine: 'eevee' });
    expect(filteredEngine.length).toBe(1);
    expect(filteredEngine[0].id).toBe('hist-2');
  });

  it('rotates older entries to archive file when maxEntriesPerFile is exceeded', async () => {
    // maxEntriesPerFile was set to 3
    for (let i = 1; i <= 5; i++) {
      const entry: HistoryEntry = {
        id: `hist-${i}`,
        jobId: `job-${i}`,
        filePath: `/projects/test_${i}.blend`,
        fileName: `test_${i}.blend`,
        scene: 'Scene',
        camera: 'Camera',
        frameCount: i * 5,
        totalTimeSeconds: i * 10,
        averageFrameTimeSeconds: 2,
        engine: 'CYCLES',
        device: 'GPU: RTX 3060',
        result: 'completed',
        failedFrames: [],
        outputPath: `/renders/test_${i}`,
        timestamp: 1000 * i,
      };
      await historyStore.appendEntry(entry);
    }

    // Active entries file should only contain 3 newest entries (5, 4, 3)
    const active = await historyStore.getEntries();
    expect(active.length).toBe(3);
    expect(active.map((e) => e.id)).toEqual(['hist-5', 'hist-4', 'hist-3']);

    // Old entries should be archived in render-history.old.json
    const archivePath = path.join(tmpDir, 'render-history.old.json');
    expect(fs.existsSync(archivePath)).toBe(true);
    const archiveData = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
    expect(archiveData.length).toBe(2);
    expect(archiveData.map((e: HistoryEntry) => e.id)).toContain('hist-1');
    expect(archiveData.map((e: HistoryEntry) => e.id)).toContain('hist-2');
  });

  it('deletes an entry and clears history store', async () => {
    const entry: HistoryEntry = {
      id: 'del-1',
      jobId: 'job-1',
      filePath: '/test.blend',
      fileName: 'test.blend',
      scene: 'Scene',
      camera: 'Camera',
      frameCount: 1,
      totalTimeSeconds: 10,
      averageFrameTimeSeconds: 10,
      engine: 'CYCLES',
      device: 'CPU',
      result: 'completed',
      failedFrames: [],
      outputPath: '/renders',
      timestamp: 1000,
    };

    await historyStore.appendEntry(entry);
    expect((await historyStore.getEntries()).length).toBe(1);

    const deleted = await historyStore.deleteEntry('del-1');
    expect(deleted).toBe(true);
    expect((await historyStore.getEntries()).length).toBe(0);

    await historyStore.appendEntry(entry);
    await historyStore.clear();
    expect(fs.existsSync(historyStore.getFilePath())).toBe(false);
  });

  it('QueueEngine automatically records job:history with actual device into HistoryStore', async () => {
    const mockBlender = path.resolve(__dirname, '../tools/mock-blender/index.js');
    const runnerScript = path.resolve(__dirname, '../resources/python/render_runner.py');

    const engine = new QueueEngine({
      logsDir: path.join(tmpDir, 'logs'),
      runtimeDir: path.join(tmpDir, 'runtime'),
      runnerScriptPath: runnerScript,
      historyStore,
    });

    const job: QueueEngineJob = {
      id: 'hist-test-job',
      blendPath: path.join(tmpDir, 'test.blend'),
      executable: [process.execPath, mockBlender],
      frames: [1, 2],
      outputPattern: 'frame_####',
      outputDir: path.join(tmpDir, 'out'),
      devicePreferences: {
        enableGpu: true,
        deviceType: 'OPTIX',
      },
    };

    let historyEmitted: HistoryEntry | undefined;
    engine.on('job:history', (entry: HistoryEntry) => {
      historyEmitted = entry;
    });

    await engine.start([job]);

    expect(historyEmitted).toBeDefined();
    expect(historyEmitted?.jobId).toBe('hist-test-job');
    expect(historyEmitted?.result).toBe('completed');
    expect(historyEmitted?.frameCount).toBe(2);
    // Mock blender reports mock GPU device or fallback
    expect(historyEmitted?.device).toBeDefined();

    // Verify it was persisted to historyStore
    const saved = await historyStore.getEntries();
    expect(saved.length).toBe(1);
    expect(saved[0].jobId).toBe('hist-test-job');
  });
});
