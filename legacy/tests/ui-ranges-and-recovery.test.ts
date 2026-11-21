import type { InspectScene } from '../src/core/schemas/inspect';
import { useQueueStore } from '../src/renderer/store/queueStore';

import { describe, expect, it } from 'vitest';

describe('UI Ranges, Video Rules, and Failed Frames Retry', () => {
  it('initializes jobs with default rangeConfig, empty failedFrames, and false renderMissingOnly', () => {
    const jobId = 'test-job-init';

    useQueueStore.setState({
      jobs: [
        {
          id: jobId,
          filePath: '/path/to/test.blend',
          fileName: 'test.blend',
          project: 'test',
          enabled: true,
          status: 'Queued',
          selectedScene: 'Scene',
          selectedCamera: 'Camera',
          scenes: [
            {
              name: 'Scene',
              frameStart: 1,
              frameEnd: 100,
              frameStep: 1,
              cameras: ['Camera'],
              activeCamera: 'Camera',
            },
          ] as unknown as InspectScene[],
          availableCameras: ['Camera'],
          outputPathPattern: '//render/test_####.png',
          outputPreview: '/path/to/render/test_0001.png',
          logs: [],
          rangeConfig: { mode: 'scene_default' },
          failedFrames: [],
          renderMissingOnly: false,
        },
      ],
    });

    const job = useQueueStore.getState().jobs.find((j) => j.id === jobId);
    expect(job).toBeDefined();
    expect(job?.rangeConfig.mode).toBe('scene_default');
    expect(job?.failedFrames).toEqual([]);
    expect(job?.renderMissingOnly).toBe(false);
  });

  it('updates custom range and computes live frame count', () => {
    const store = useQueueStore.getState();
    const jobId = 'test-job-custom';

    useQueueStore.setState({
      jobs: [
        {
          id: jobId,
          filePath: '/path/to/test.blend',
          fileName: 'test.blend',
          project: 'test',
          enabled: true,
          status: 'Queued',
          selectedScene: 'Scene',
          selectedCamera: 'Camera',
          scenes: [
            {
              name: 'Scene',
              frameStart: 1,
              frameEnd: 250,
              frameStep: 1,
              cameras: [],
            },
          ] as unknown as InspectScene[],
          availableCameras: [],
          outputPathPattern: '//render/test_####.png',
          outputPreview: '/path/to/render/test_0001.png',
          logs: [],
          rangeConfig: { mode: 'scene_default' },
          failedFrames: [],
        },
      ],
    });

    store.updateJob(jobId, {
      rangeConfig: { mode: 'custom', customExpression: '1-10, 20-30x2, 50' },
    });

    const job = useQueueStore.getState().jobs.find((j) => j.id === jobId);
    expect(job).toBeDefined();
    // 1..10 = 10 frames
    // 20, 22, 24, 26, 28, 30 = 6 frames
    // 50 = 1 frame
    // Total = 17 frames
    expect(job?.customRangeLiveCount).toBe(17);
    expect(job?.customRangeError).toBeUndefined();
  });

  it('flags videoRuleError when video format has discontinuous or custom range', () => {
    const store = useQueueStore.getState();
    const jobId = 'test-job-video';

    useQueueStore.setState({
      jobs: [
        {
          id: jobId,
          filePath: '/path/to/video.blend',
          fileName: 'video.blend',
          project: 'video',
          enabled: true,
          status: 'Queued',
          selectedScene: 'Scene',
          selectedCamera: 'Camera',
          isVideo: true,
          scenes: [
            {
              name: 'Scene',
              frameStart: 1,
              frameEnd: 100,
              frameStep: 1,
              cameras: [],
              imageSettings: {
                fileFormat: { value: 'FFMPEG' },
              },
            },
          ] as unknown as InspectScene[],
          availableCameras: [],
          outputPathPattern: '//render/video.mp4',
          outputPreview: '/path/to/render/video.mp4',
          logs: [],
          rangeConfig: { mode: 'scene_default' },
          failedFrames: [],
        },
      ],
    });

    store.updateJob(jobId, {
      rangeConfig: { mode: 'custom', customExpression: '1-10, 20-30' },
    });

    const job = useQueueStore.getState().jobs.find((j) => j.id === jobId);
    expect(job).toBeDefined();
    expect(job?.videoRuleError).toBeDefined();
    expect(job?.videoRuleError).toContain('Video formats require continuous sequential frames');
  });

  it('flags videoRuleError for single_still mode when format is video', () => {
    const store = useQueueStore.getState();
    const jobId = 'test-job-video-still';

    useQueueStore.setState({
      jobs: [
        {
          id: jobId,
          filePath: '/path/to/video.blend',
          fileName: 'video.blend',
          project: 'video',
          enabled: true,
          status: 'Queued',
          selectedScene: 'Scene',
          selectedCamera: 'Camera',
          isVideo: true,
          scenes: [
            {
              name: 'Scene',
              frameStart: 1,
              frameEnd: 100,
              frameStep: 1,
              cameras: [],
              imageSettings: {
                fileFormat: { value: 'FFMPEG' },
              },
            },
          ] as unknown as InspectScene[],
          availableCameras: [],
          outputPathPattern: '//render/video.mp4',
          outputPreview: '/path/to/render/video.mp4',
          logs: [],
          rangeConfig: { mode: 'scene_default' },
          failedFrames: [],
        },
      ],
    });

    store.updateJob(jobId, {
      rangeConfig: { mode: 'single_still', singleStillFrame: 42 },
    });

    const job = useQueueStore.getState().jobs.find((j) => j.id === jobId);
    expect(job).toBeDefined();
    expect(job?.videoRuleError).toBeDefined();
    expect(job?.videoRuleError).toContain(
      'Single still frames cannot be rendered to a video container',
    );
  });

  it('retries failed frames by creating a custom range from failed frame numbers and clearing failed list', () => {
    const store = useQueueStore.getState();
    const jobId = 'test-job-retry';

    useQueueStore.setState({
      jobs: [
        {
          id: jobId,
          filePath: '/path/to/test.blend',
          fileName: 'test.blend',
          project: 'test',
          enabled: true,
          status: 'Failed',
          selectedScene: 'Scene',
          selectedCamera: 'Camera',
          scenes: [
            {
              name: 'Scene',
              frameStart: 1,
              frameEnd: 200,
              frameStep: 1,
              cameras: [],
            },
          ] as unknown as InspectScene[],
          availableCameras: [],
          outputPathPattern: '//render/test_####.png',
          outputPreview: '/path/to/render/test_0001.png',
          logs: [],
          rangeConfig: { mode: 'scene_default' },
          failedFrames: [
            { frame: 114, error: 'Out of memory', timestamp: 123456, attemptCount: 1 },
            { frame: 115, error: 'Out of memory', timestamp: 123457, attemptCount: 1 },
          ],
        },
      ],
    });

    store.retryFailedFrames(jobId);

    const updated = useQueueStore.getState().jobs.find((j) => j.id === jobId);
    expect(updated).toBeDefined();
    expect(updated?.status).toBe('Queued');
    expect(updated?.rangeConfig.mode).toBe('custom');
    expect(updated?.rangeConfig.customExpression).toBe('114, 115');
    expect(updated?.customRangeLiveCount).toBe(2);
    expect(updated?.failedFrames).toEqual([]);
  });

  it('toggles renderMissingOnly for image jobs', () => {
    const store = useQueueStore.getState();
    const jobId = 'test-job-missing';

    useQueueStore.setState({
      jobs: [
        {
          id: jobId,
          filePath: '/path/to/test.blend',
          fileName: 'test.blend',
          project: 'test',
          enabled: true,
          status: 'Queued',
          selectedScene: 'Scene',
          selectedCamera: 'Camera',
          scenes: [],
          availableCameras: [],
          outputPathPattern: '//render/test_####.png',
          outputPreview: '/path/to/render/test_0001.png',
          logs: [],
          rangeConfig: { mode: 'scene_default' },
          failedFrames: [],
          renderMissingOnly: false,
        },
      ],
    });

    store.setRenderMissingOnly(jobId, true);
    let job = useQueueStore.getState().jobs.find((j) => j.id === jobId);
    expect(job?.renderMissingOnly).toBe(true);

    store.setRenderMissingOnly(jobId, false);
    job = useQueueStore.getState().jobs.find((j) => j.id === jobId);
    expect(job?.renderMissingOnly).toBe(false);
  });
});
