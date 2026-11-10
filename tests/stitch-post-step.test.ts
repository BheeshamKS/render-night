import { executeJobPostStepStitch } from '../src/core/queue/stitch-post-step';

import { describe, expect, it, vi } from 'vitest';

describe('Stitch to MP4 Post-Step', () => {
  it('triggers post-step stitch when job is completed and stitchToMp4 is enabled for image format', async () => {
    const mockStitch = vi.fn().mockResolvedValue('/renders/shot_stitched.mp4');

    const result = await executeJobPostStepStitch(
      {
        jobId: 'job-1',
        isVideo: false,
        stitchToMp4: true,
        outputDir: '/renders',
        outputPattern: '/renders/shot_%04d.png',
        fps: 24,
      },
      {
        detectSequenceFn: vi.fn().mockResolvedValue({
          directory: '/renders',
          baseName: 'shot_',
          extension: 'png',
          pattern: '/renders/shot_%04d.png',
          startFrame: 1,
          endFrame: 10,
          totalFrames: 10,
          frames: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          filePaths: {},
          missingFrames: [],
          isNativeFormat: true,
        }),
        stitchFn: mockStitch,
      },
    );

    expect(result).toBe('/renders/shot_stitched.mp4');
    expect(mockStitch).toHaveBeenCalledTimes(1);
    expect(mockStitch).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPattern: '/renders/shot_%04d.png',
        fps: 24,
        outputFormat: 'mp4_h264',
        outputPath: '/renders/shot_stitched.mp4',
      }),
    );
  });

  it('skips stitching when stitchToMp4 is false or job is a video format', async () => {
    const mockStitch = vi.fn();

    const res1 = await executeJobPostStepStitch(
      {
        jobId: 'job-2',
        isVideo: false,
        stitchToMp4: false,
        outputDir: '/renders',
      },
      { stitchFn: mockStitch },
    );
    expect(res1).toBeNull();
    expect(mockStitch).not.toHaveBeenCalled();

    const res2 = await executeJobPostStepStitch(
      {
        jobId: 'job-3',
        isVideo: true,
        stitchToMp4: true,
        outputDir: '/renders',
      },
      { stitchFn: mockStitch },
    );
    expect(res2).toBeNull();
    expect(mockStitch).not.toHaveBeenCalled();
  });
});
