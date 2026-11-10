import type { FrameRangeConfig, FrameRangeMode, SimpleRange } from '../schemas/queue-state';

export class RangeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RangeParseError';
  }
}

export interface ResolvedFrameRange {
  mode: FrameRangeMode;
  frames: number[];
  totalCount: number;
  isContinuous: boolean;
  summary: string;
  error?: string;
}

const VIDEO_FORMATS = new Set([
  'FFMPEG',
  'AVI_JPEG',
  'AVI_RAW',
  'THEORA',
  'QUICKTIME',
  'H264',
  'MPEG',
  'MP4',
  'MKV',
]);

/**
 * Check whether a Blender file format string represents a video container.
 */
export function isFormatVideo(format?: string): boolean {
  if (!format) return false;
  return VIDEO_FORMATS.has(format.toUpperCase().trim());
}

export const isVideoFormat = isFormatVideo;

/**
 * Parse an arbitrary custom frame expression into a deduplicated, ascending-sorted list of frame numbers.
 * Examples:
 *   "50-200, 200-300"       -> [50..300] (200 included only once)
 *   "1-50, 75, 120-240x2"   -> [1..50, 75, 120, 122, ..., 240]
 *   "-10--5, 0, 5"          -> [-10, -9, -8, -7, -6, -5, 0, 5]
 */
export function parseCustomRange(expression: string): number[] {
  if (typeof expression !== 'string') {
    throw new RangeParseError('Frame expression must be a string');
  }

  const trimmed = expression.trim();
  if (!trimmed) {
    throw new RangeParseError('Empty frame expression');
  }

  const rawSegments = trimmed.split(',');
  const frameSet = new Set<number>();

  for (const rawSeg of rawSegments) {
    const seg = rawSeg.trim();
    if (!seg) {
      throw new RangeParseError('Empty frame token in expression');
    }

    // 1. Check for step suffix 'x<step>'
    let base = seg;
    let step = 1;
    const xIdx = seg.toLowerCase().lastIndexOf('x');
    if (xIdx !== -1) {
      base = seg.slice(0, xIdx).trim();
      const stepStr = seg.slice(xIdx + 1).trim();
      const parsedStep = Number(stepStr);
      if (!Number.isInteger(parsedStep) || parsedStep <= 0) {
        throw new RangeParseError(`Step must be a positive integer in "${seg}"`);
      }
      step = parsedStep;
    }

    // 2. Check if range (<start>-<end>) taking care of negative numbers
    // Regex matches <int>-<int> where numbers can start with optional +/-
    const rangeMatch = base.match(/^([+-]?\d+)\s*-\s*([+-]?\d+)$/);
    if (rangeMatch) {
      const a = Number.parseInt(rangeMatch[1], 10);
      const b = Number.parseInt(rangeMatch[2], 10);
      const start = Math.min(a, b);
      const end = Math.max(a, b);

      for (let f = start; f <= end; f += step) {
        frameSet.add(f);
      }
      continue;
    }

    // 3. Single frame number
    const singleMatch = base.match(/^([+-]?\d+)$/);
    if (singleMatch) {
      const f = Number.parseInt(singleMatch[1], 10);
      frameSet.add(f);
      continue;
    }

    throw new RangeParseError(`Invalid frame token: "${seg}"`);
  }

  return Array.from(frameSet).sort((a, b) => a - b);
}

/**
 * Resolve any FrameRangeConfig against scene defaults into concrete frame array and metrics.
 */
export function resolveFrameRange(
  config: FrameRangeConfig,
  sceneDefaults: { start: number; end: number; step?: number },
): ResolvedFrameRange {
  const mode = config.mode || 'scene_default';
  let frames: number[] = [];

  switch (mode) {
    case 'scene_default': {
      const start = sceneDefaults.start;
      const end = sceneDefaults.end;
      const step = Math.max(1, sceneDefaults.step || 1);
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      for (let f = low; f <= high; f += step) {
        frames.push(f);
      }
      break;
    }

    case 'simple': {
      const simple: SimpleRange = config.simple || {
        start: sceneDefaults.start,
        end: sceneDefaults.end,
        step: sceneDefaults.step || 1,
      };
      const step = Math.max(1, simple.step || 1);
      const low = Math.min(simple.start, simple.end);
      const high = Math.max(simple.start, simple.end);
      for (let f = low; f <= high; f += step) {
        frames.push(f);
      }
      break;
    }

    case 'single_still': {
      const f =
        config.singleStillFrame !== undefined ? config.singleStillFrame : sceneDefaults.start;
      frames = [f];
      break;
    }

    case 'custom': {
      try {
        frames = parseCustomRange(
          config.customExpression || `${sceneDefaults.start}-${sceneDefaults.end}`,
        );
      } catch (err) {
        return {
          mode,
          frames: [],
          totalCount: 0,
          isContinuous: false,
          summary: '0 frames',
          error: (err as Error).message,
        };
      }
      break;
    }
  }

  const totalCount = frames.length;
  let isContinuous = true;
  if (totalCount > 1) {
    for (let i = 1; i < totalCount; i++) {
      if (frames[i] !== frames[i - 1] + 1) {
        isContinuous = false;
        break;
      }
    }
  }

  const summary =
    totalCount === 0
      ? '0 frames'
      : totalCount === 1
        ? `Frame ${frames[0]}`
        : `${totalCount} frames (${frames[0]}..${frames[totalCount - 1]})`;

  return {
    mode,
    frames,
    totalCount,
    isContinuous,
    summary,
  };
}

/**
 * Validate that the resolved range conforms to the target render format rules.
 */
export function validateRangeForFormat(
  range: ResolvedFrameRange,
  format?: string,
): { valid: boolean; reason?: string } {
  if (isFormatVideo(format)) {
    if (range.totalCount === 0) {
      return {
        valid: false,
        reason: 'Video formats require at least 2 sequential frames to encode an animation.',
      };
    }
    if (range.mode === 'single_still' || range.totalCount === 1) {
      return {
        valid: false,
        reason:
          'Single still frames cannot be rendered to a video container. Switch format to an image format or select a continuous frame range.',
      };
    }
    if (!range.isContinuous) {
      return {
        valid: false,
        reason:
          'Video formats require continuous sequential frames. Custom discontinuous ranges and stepped skipping are only supported for image formats.',
      };
    }
  }

  return { valid: true };
}
