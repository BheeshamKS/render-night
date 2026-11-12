// @vitest-environment jsdom
import type { BlenderInstallation } from '../src/core/blender/discovery';
import { useQueueStore } from '../src/renderer/store/queueStore';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Features v3: Custom Blender, Output Folder Picker, IRL Timeframe Schedule', () => {
  beforeEach(() => {
    // Reset store
    useQueueStore.setState({
      jobs: [],
      blenders: [
        {
          id: 'blender-system',
          executable: ['/usr/bin/blender'],
          displayPath: '/usr/bin/blender',
          version: '4.2.0',
          major: 4,
          minor: 2,
          patch: 0,
          isPortable: false,
          source: 'system',
        },
      ],
      selectedBlenderId: 'blender-system',
      customBlenderPaths: [],
      queueState: 'idle',
      scheduleConfig: {
        enabled: false,
        time: '23:00',
        blockSleep: true,
        startImmediately: false,
        stopEnabled: false,
        stopTime: '06:00',
        stopAction: 'shutdown',
      },
    });

    // Mock rnApi
    window.rnApi = {
      discoverBlenders: vi.fn().mockImplementation(async (customPaths?: string[]) => {
        const base: BlenderInstallation[] = [
          {
            id: 'blender-system',
            executable: ['/usr/bin/blender'],
            displayPath: '/usr/bin/blender',
            version: '4.2.0',
            major: 4,
            minor: 2,
            patch: 0,
            isPortable: false,
            source: 'system',
          },
        ];
        if (customPaths && customPaths.length > 0) {
          for (const cp of customPaths) {
            base.push({
              id: `custom-${cp}`,
              executable: [cp],
              displayPath: cp,
              version: '4.3.0',
              major: 4,
              minor: 3,
              patch: 0,
              isPortable: true,
              source: 'custom',
            });
          }
        }
        return base;
      }),
      validateCustomBlender: vi.fn().mockImplementation(async (cmd: string | string[]) => {
        const path = Array.isArray(cmd) ? cmd[0] : cmd;
        if (path.includes('invalid')) {
          throw new Error('Not a valid Blender executable');
        }
        return {
          id: `custom-${path}`,
          executable: [path],
          displayPath: path,
          version: '4.3.0',
          major: 4,
          minor: 3,
          patch: 0,
          isPortable: true,
          source: 'custom' as const,
        };
      }),
      selectBlenderExecutable: vi.fn().mockResolvedValue('/custom/blender.exe'),
      selectDirectory: vi.fn().mockResolvedValue('/user/renders/shot1'),
      openPath: vi.fn().mockResolvedValue(undefined),
      acquireSleepBlock: vi.fn().mockResolvedValue(42),
      releaseSleepBlock: vi.fn().mockResolvedValue(undefined),
      saveQueue: vi.fn().mockResolvedValue(undefined),
      stopQueue: vi.fn().mockResolvedValue(undefined),
      startQueue: vi.fn().mockResolvedValue(undefined),
      executePostAction: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as typeof window.rnApi;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows manual addition of custom blender executable and marks it active', async () => {
    const store = useQueueStore.getState();

    const result = await store.addCustomBlender('/opt/blender-4.3/blender');
    expect(result.success).toBe(true);
    expect(result.blender?.version).toBe('4.3.0');

    const state = useQueueStore.getState();
    expect(state.customBlenderPaths).toContain('/opt/blender-4.3/blender');
    expect(state.selectedBlenderId).toBe('custom-/opt/blender-4.3/blender');
    expect(state.blenders.some((b) => b.id === 'custom-/opt/blender-4.3/blender')).toBe(true);

    // Browsing and adding
    const browseRes = await state.browseAndAddBlender();
    expect(browseRes.success).toBe(true);
    expect(useQueueStore.getState().customBlenderPaths).toContain('/custom/blender.exe');
  });

  it('rejects invalid custom blender path cleanly without corrupting state', async () => {
    const store = useQueueStore.getState();
    const result = await store.addCustomBlender('/invalid/path/blender');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not a valid Blender executable');
    expect(useQueueStore.getState().customBlenderPaths).toHaveLength(0);
  });

  it('updates job output directory when user changes pattern', async () => {
    useQueueStore.setState({
      jobs: [
        {
          id: 'job-1',
          filePath: '/projects/shot1.blend',
          fileName: 'shot1.blend',
          project: 'shot1',
          enabled: true,
          status: 'Queued',
          selectedScene: 'Scene',
          selectedCamera: 'Camera',
          scenes: [],
          availableCameras: ['Camera'],
          outputPathPattern: '//render/frame_####.png',
          outputPreview: '/projects/render/frame_0001.png',
          logs: [],
          failedFrames: [],
          rangeConfig: { mode: 'scene_default' },
        },
      ],
    });

    const store = useQueueStore.getState();
    store.updateJob('job-1', {
      outputPathPattern: '/new/folder/shot1_####.png',
    });

    const updated = useQueueStore.getState().jobs[0];
    expect(updated.outputPathPattern).toBe('/new/folder/shot1_####.png');
  });

  it('arms IRL schedule with start time, stop time, and shutdown action', async () => {
    const store = useQueueStore.getState();

    await store.setSchedule({
      enabled: true,
      time: '23:30',
      blockSleep: true,
      startImmediately: false,
      stopEnabled: true,
      stopTime: '05:00',
      stopAction: 'shutdown',
    });

    const config = useQueueStore.getState().scheduleConfig;
    expect(config.enabled).toBe(true);
    expect(config.time).toBe('23:30');
    expect(config.stopEnabled).toBe(true);
    expect(config.stopTime).toBe('05:00');
    expect(config.stopAction).toBe('shutdown');
    expect(useQueueStore.getState().activeSleepBlockId).toBe(42);

    // Cancelling releases sleep blocker
    await store.cancelSchedule();
    expect(useQueueStore.getState().scheduleConfig.enabled).toBe(false);
    expect(useQueueStore.getState().activeSleepBlockId).toBeNull();
  });
});
