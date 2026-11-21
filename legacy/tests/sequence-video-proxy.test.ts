import { getVideoProxyCacheKey } from '../src/core/sequence/video-proxy';
import { isHeavySequence } from '../src/renderer/sequence/proxy-manager';

import { describe, expect, it } from 'vitest';

describe('Sequence Video Proxy & Cache Key', () => {
  it('generates a deterministic proxy key based on directory, frame range, and mtime', () => {
    const key1 = getVideoProxyCacheKey('/renders/shot_01', 1, 100, 1600000000);
    const key2 = getVideoProxyCacheKey('/renders/shot_01', 1, 100, 1600000000);
    expect(key1).toBe(key2);
    expect(key1.startsWith('proxy_seq_')).toBe(true);
    expect(key1.endsWith('.mp4')).toBe(true);

    // Changing mtime produces a different key
    const keyDiffMtime = getVideoProxyCacheKey('/renders/shot_01', 1, 100, 1600000001);
    expect(keyDiffMtime).not.toBe(key1);

    // Changing frame range produces a different key
    const keyDiffRange = getVideoProxyCacheKey('/renders/shot_01', 1, 250, 1600000000);
    expect(keyDiffRange).not.toBe(key1);
  });

  it('correctly identifies heavy sequences (EXR, HDR, DPX, TIFF and >2560px width)', () => {
    const baseSeq = {
      directory: '/renders',
      baseName: 'shot_',
      extension: 'png',
      pattern: '/renders/shot_%04d.png',
      padding: 4,
      startFrame: 1,
      endFrame: 100,
      totalFrames: 100,
      frames: [1],
      filePaths: {},
      missingFrames: [],
      isNativeFormat: true,
    };

    // Standard 1080p PNG is not heavy
    expect(isHeavySequence(baseSeq, 1920)).toBe(false);

    // 4K PNG (>2560 px) is heavy
    expect(isHeavySequence(baseSeq, 3840)).toBe(true);

    // EXR is heavy
    expect(isHeavySequence({ ...baseSeq, extension: 'exr', isNativeFormat: false })).toBe(true);

    // TIFF is heavy
    expect(isHeavySequence({ ...baseSeq, extension: 'tif', isNativeFormat: false })).toBe(true);
  });
});
