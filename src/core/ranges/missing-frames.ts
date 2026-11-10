import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Filter an array of target frame numbers into missing and existing frames.
 * Useful for the "Render Missing Frames Only" feature.
 */
export function filterMissingFrames(
  frames: number[],
  outputPattern: string,
  outputDir: string,
  existsSyncFn: (filePath: string) => boolean = fs.existsSync,
): { missingFrames: number[]; existingFrames: number[] } {
  const missingFrames: number[] = [];
  const existingFrames: number[] = [];

  for (const frame of frames) {
    let frameFile = `frame_${String(frame).padStart(4, '0')}.png`;

    if (outputPattern) {
      if (outputPattern.includes('#')) {
        frameFile = outputPattern.replace(/#+/g, (m) => String(frame).padStart(m.length, '0'));
      } else {
        frameFile = outputPattern;
      }
    }

    const fullPath = path.isAbsolute(frameFile) ? frameFile : path.join(outputDir, frameFile);

    if (existsSyncFn(fullPath)) {
      existingFrames.push(frame);
    } else {
      missingFrames.push(frame);
    }
  }

  return { missingFrames, existingFrames };
}
