import { getFfmpegPath } from '../src/core/ffmpeg/discovery';

import { describe, expect, it } from 'vitest';

describe('FFmpeg Discovery', () => {
  it('discovers ffmpeg from system or ffmpeg-static fallback', async () => {
    const result = await getFfmpegPath();
    expect(result).not.toBeNull();
    expect(result?.path).toBeTruthy();
    expect(['system', 'bundled', 'custom']).toContain(result?.source);
    if (result?.version) {
      expect(typeof result.version).toBe('string');
    }
  });

  it('validates custom ffmpeg path', async () => {
    const invalid = await getFfmpegPath('/non/existent/path/to/ffmpeg');
    expect(invalid).toBeNull();
  });

  it('accepts a valid custom ffmpeg path', async () => {
    const defaultResult = await getFfmpegPath();
    expect(defaultResult).not.toBeNull();
    if (defaultResult) {
      const customResult = await getFfmpegPath(defaultResult.path);
      expect(customResult).not.toBeNull();
      expect(customResult?.path).toBe(defaultResult.path);
      expect(customResult?.source).toBe('custom');
    }
  });
});
