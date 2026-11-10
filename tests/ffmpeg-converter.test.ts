import { buildFfmpegArgs } from '../src/core/ffmpeg/converter';

import { describe, expect, it } from 'vitest';

describe('FFmpeg Sequence Converter', () => {
  it('constructs correct arguments for MP4 H.264', () => {
    const args = buildFfmpegArgs({
      inputPattern: '/renders/shot_%04d.png',
      startFrame: 1,
      fps: 24,
      outputFormat: 'mp4_h264',
      outputPath: '/renders/output.mp4',
    });

    expect(args).toContain('-framerate');
    expect(args).toContain('24');
    expect(args).toContain('-start_number');
    expect(args).toContain('1');
    expect(args).toContain('libx264');
    expect(args).toContain('yuv420p');
    expect(args).toContain('/renders/output.mp4');
  });

  it('constructs correct arguments for ProRes with audio', () => {
    const args = buildFfmpegArgs({
      inputPattern: '/renders/shot_%04d.png',
      fps: 30,
      outputFormat: 'prores',
      audioPath: '/sound/bg.wav',
      outputPath: '/renders/output.mov',
    });

    expect(args).toContain('prores_ks');
    expect(args).toContain('/sound/bg.wav');
    expect(args).toContain('-shortest');
    expect(args).toContain('/renders/output.mov');
  });

  it('constructs correct arguments for WebM and H.265 with resolution and crop', () => {
    const webmArgs = buildFfmpegArgs({
      inputPattern: '/renders/shot_%04d.png',
      fps: 60,
      outputFormat: 'webm',
      resolution: { width: 1280, height: 720 },
      outputPath: '/renders/output.webm',
    });
    expect(webmArgs).toContain('libvpx-vp9');
    expect(webmArgs.some((a) => a.includes('scale='))).toBe(true);

    const h265Args = buildFfmpegArgs({
      inputPattern: '/renders/shot_%04d.png',
      fps: 24,
      outputFormat: 'mp4_h265',
      crop: { width: 1920, height: 800, x: 0, y: 140 },
      outputPath: '/renders/cinematic.mp4',
    });
    expect(h265Args).toContain('libx265');
    expect(h265Args).toContain('hvc1');
    expect(h265Args.some((a) => a.includes('crop='))).toBe(true);
  });
});
