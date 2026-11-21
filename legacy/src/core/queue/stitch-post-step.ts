import { SequenceStitcher, type StitchOptions } from '../ffmpeg/converter';
import type { ImageSequenceInfo } from '../schemas/sequence';
import { detectSequence } from '../sequence/sequence-detector';

import * as path from 'node:path';

export interface PostStepJobContext {
  jobId: string;
  isVideo: boolean;
  stitchToMp4?: boolean;
  outputDir: string;
  outputPattern?: string;
  fps?: number;
  stitchConfig?: Partial<StitchOptions>;
}

export interface PostStepDeps {
  detectSequenceFn?: (dir: string) => Promise<ImageSequenceInfo | null>;
  stitchFn?: (options: StitchOptions) => Promise<string>;
}

export async function executeJobPostStepStitch(
  job: PostStepJobContext,
  deps: PostStepDeps = {},
): Promise<string | null> {
  // Only execute for non-video jobs that have stitchToMp4 enabled
  if (!job.stitchToMp4 || job.isVideo) {
    return null;
  }

  const detector = deps.detectSequenceFn || detectSequence;
  const seq = await detector(job.outputPattern || job.outputDir);
  if (!seq || seq.totalFrames === 0) {
    return null;
  }

  const baseName = seq.baseName.replace(/[_\-.]$/, '');
  const defaultOutputPath = path.join(seq.directory, `${baseName || 'sequence'}_stitched.mp4`);

  const stitchOptions: StitchOptions = {
    inputPattern: seq.pattern,
    startFrame: seq.startFrame,
    totalFrames: seq.totalFrames,
    fps: job.fps || 24,
    outputFormat: 'mp4_h264',
    outputPath: defaultOutputPath,
    ...job.stitchConfig,
  };

  if (deps.stitchFn) {
    return deps.stitchFn(stitchOptions);
  }

  const stitcher = new SequenceStitcher(stitchOptions);
  return stitcher.start();
}
