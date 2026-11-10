import { SequenceStitcher } from '../src/core/ffmpeg/converter';
import { getFfmpegPath } from '../src/core/ffmpeg/discovery';
import { detectSequence } from '../src/core/sequence/sequence-detector';

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('E2E Acceptance: Render 10 Mock PNGs, View, and Stitch to MP4', () => {
  it('detects 10 frames and stitches them to an MP4 video file', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-e2e-seq-'));
    const outVideo = path.join(tmp, 'stitched_output.mp4');

    // 1-pixel valid PNG buffer base64
    const validPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    // 1. Write 10 mock PNGs (simulating a 10-frame image render)
    for (let i = 1; i <= 10; i++) {
      fs.writeFileSync(path.join(tmp, `test_${String(i).padStart(4, '0')}.png`), validPng);
    }

    // 2. Detect sequence
    const seq = await detectSequence(tmp);
    expect(seq).not.toBeNull();
    expect(seq?.totalFrames).toBe(10);
    expect(seq?.startFrame).toBe(1);
    expect(seq?.endFrame).toBe(10);
    expect(seq?.missingFrames).toHaveLength(0);
    expect(seq?.isNativeFormat).toBe(true);

    // 3. Resolve FFmpeg
    const ffmpegInfo = await getFfmpegPath();
    expect(ffmpegInfo).not.toBeNull();
    expect(ffmpegInfo?.path).toBeTruthy();

    // 4. Stitch to MP4 at 24 fps
    let progressCallCount = 0;
    const stitcher = new SequenceStitcher({
      inputPattern: path.join(tmp, 'test_%04d.png'),
      startFrame: 1,
      totalFrames: 10,
      fps: 24,
      outputFormat: 'mp4_h264',
      outputPath: outVideo,
      ffmpegExecutable: ffmpegInfo!.path,
    });

    const resultPath = await stitcher.start((progress) => {
      progressCallCount++;
      expect(progress.frame).toBeGreaterThanOrEqual(0);
    });

    expect(progressCallCount).toBeGreaterThan(0);

    // 5. Verify output file exists and is valid video
    expect(resultPath).toBe(outVideo);
    expect(fs.existsSync(outVideo)).toBe(true);
    const stat = fs.statSync(outVideo);
    expect(stat.size).toBeGreaterThan(0);

    // 6. Inspect video stream metadata via FFmpeg -i
    try {
      const { stderr } = await execFileAsync(ffmpegInfo!.path, ['-i', outVideo]);
      expect(stderr).toMatch(/Video:\s+h264/i);
    } catch (err: unknown) {
      // FFmpeg returns exit code 1 when invoked without output file, but outputs media info to stderr
      const errOutput = String((err as { stderr?: string })?.stderr || err);
      expect(errOutput).toMatch(/Video:\s+h264/i);
    }

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
