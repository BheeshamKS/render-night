import {
  isFormatVideo,
  parseCustomRange,
  RangeParseError,
  resolveFrameRange,
  validateRangeForFormat,
} from '../src/core/ranges/frame-range';
import { filterMissingFrames } from '../src/core/ranges/missing-frames';

import { describe, expect, it } from 'vitest';

describe('Custom Frame Range Parser', () => {
  const tableDrivenTests = [
    {
      name: 'dedupes overlapping ranges (spec case: 50-200, 200-300)',
      input: '50-200, 200-300',
      expectedCount: 251,
      expectedFirst: 50,
      expectedLast: 300,
      mustInclude: [50, 199, 200, 201, 300],
    },
    {
      name: 'handles complex multi-ranges with steps (spec case: 1-50, 75, 120-240x2)',
      input: '1-50, 75, 120-240x2',
      expectedCount: 50 + 1 + 61, // 1..50 (50) + 75 (1) + 120..240 step 2 (61) = 112
      expectedFirst: 1,
      expectedLast: 240,
      mustInclude: [1, 50, 75, 120, 122, 240],
      mustNotInclude: [74, 76, 121, 123],
    },
    {
      name: 'handles reverse ranges and single frames',
      input: '10-1, 15',
      expectedCount: 11,
      expectedFirst: 1,
      expectedLast: 15,
      mustInclude: [1, 5, 10, 15],
    },
    {
      name: 'handles negative frame ranges',
      input: '-10--5, 0, 5-10',
      expectedCount: 6 + 1 + 6, // 13
      expectedFirst: -10,
      expectedLast: 10,
      mustInclude: [-10, -5, 0, 5, 10],
    },
    {
      name: 'sorts arbitrary out-of-order comma lists',
      input: '100, 10, 50, 1',
      expectedCount: 4,
      expectedFirst: 1,
      expectedLast: 100,
      mustInclude: [1, 10, 50, 100],
    },
  ];

  it.each(tableDrivenTests)(
    '$name',
    ({ input, expectedCount, expectedFirst, expectedLast, mustInclude, mustNotInclude }) => {
      const frames = parseCustomRange(input);
      expect(frames.length).toBe(expectedCount);
      expect(frames[0]).toBe(expectedFirst);
      expect(frames[frames.length - 1]).toBe(expectedLast);

      for (const val of mustInclude) {
        expect(frames).toContain(val);
      }
      if (mustNotInclude) {
        for (const val of mustNotInclude) {
          expect(frames).not.toContain(val);
        }
      }

      // Verify sorted ascending
      for (let i = 1; i < frames.length; i++) {
        expect(frames[i]).toBeGreaterThan(frames[i - 1]);
      }
    },
  );

  it('rejects invalid or garbage inputs with descriptive error messages', () => {
    expect(() => parseCustomRange('')).toThrow(RangeParseError);
    expect(() => parseCustomRange('abc')).toThrow(/Invalid frame token/);
    expect(() => parseCustomRange('1-50, , 75')).toThrow(/Empty frame token/);
    expect(() => parseCustomRange('1-10x0')).toThrow(/Step must be a positive integer/);
    expect(() => parseCustomRange('1-10x-2')).toThrow(/Step must be a positive integer/);
    expect(() => parseCustomRange('1-10-20')).toThrow(/Invalid frame token/);
  });
});

describe('Range Mode Resolution & Video Constraints', () => {
  const sceneDefaults = { start: 1, end: 250, step: 1 };

  it('resolves scene_default mode', () => {
    const result = resolveFrameRange({ mode: 'scene_default' }, sceneDefaults);
    expect(result.frames.length).toBe(250);
    expect(result.isContinuous).toBe(true);
    expect(result.totalCount).toBe(250);
  });

  it('resolves simple mode with step', () => {
    const result = resolveFrameRange(
      { mode: 'simple', simple: { start: 1, end: 10, step: 2 } },
      sceneDefaults,
    );
    expect(result.frames).toEqual([1, 3, 5, 7, 9]);
    expect(result.isContinuous).toBe(false); // Step > 1 is not continuous sequential
    expect(result.totalCount).toBe(5);
  });

  it('resolves single_still mode', () => {
    const result = resolveFrameRange({ mode: 'single_still', singleStillFrame: 42 }, sceneDefaults);
    expect(result.frames).toEqual([42]);
    expect(result.totalCount).toBe(1);
    expect(result.isContinuous).toBe(true);
  });

  it('enforces Image-vs-Video formatting rule', () => {
    expect(isFormatVideo('FFMPEG')).toBe(true);
    expect(isFormatVideo('AVI_JPEG')).toBe(true);
    expect(isFormatVideo('PNG')).toBe(false);
    expect(isFormatVideo('OPEN_EXR')).toBe(false);

    const continuousRange = resolveFrameRange(
      { mode: 'simple', simple: { start: 1, end: 100, step: 1 } },
      sceneDefaults,
    );
    const validVideo = validateRangeForFormat(continuousRange, 'FFMPEG');
    expect(validVideo.valid).toBe(true);

    const discontinuousRange = resolveFrameRange(
      { mode: 'custom', customExpression: '1-10, 20-30' },
      sceneDefaults,
    );
    const invalidVideo = validateRangeForFormat(discontinuousRange, 'FFMPEG');
    expect(invalidVideo.valid).toBe(false);
    expect(invalidVideo.reason).toMatch(/Video formats require continuous sequential frames/);

    const stillRange = resolveFrameRange(
      { mode: 'single_still', singleStillFrame: 1 },
      sceneDefaults,
    );
    const invalidStillVideo = validateRangeForFormat(stillRange, 'FFMPEG');
    expect(invalidStillVideo.valid).toBe(false);
  });
});

describe('Missing Frames Scanner', () => {
  it('filters out existing frames and keeps only missing frames', () => {
    const existing = new Set(['/renders/shot_0001.png', '/renders/shot_0002.png']);
    const mockExists = (filePath: string) => existing.has(filePath);

    const { missingFrames, existingFrames } = filterMissingFrames(
      [1, 2, 3, 4, 5],
      '/renders/shot_####.png',
      '/renders',
      mockExists,
    );

    expect(existingFrames).toEqual([1, 2]);
    expect(missingFrames).toEqual([3, 4, 5]);
  });
});
