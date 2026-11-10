/**
 * Parse a frame range string like "1-10", "1-10x2", "1,3,5,7-9" into a
 * normalized {start, end, step} object. The returned range is inclusive of
 * both start and end.
 *
 * Examples:
 *   "1-10"      → { start: 1, end: 10, step: 1 }
 *   "1-10x2"    → { start: 1, end: 10, step: 2 }
 *   "10-1"      → { start: 1, end: 10, step: 1 }  (swapped)
 *   "5"         → { start: 5, end: 5, step: 1 }
 *   "1,3,5,7-9" → { start: 1, end: 9, step: 1 }  (first segment only, step=1)
 *
 * The parser is tolerant of whitespace and accepts negative numbers.
 */

export interface Range {
  start: number;
  end: number;
  step: number;
}

export class RangeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RangeParseError';
  }
}

const INT_RE = '-?\\d+';

function parseSingleToken(token: string): number {
  const t = token.trim();
  if (!t) throw new RangeParseError('Empty frame token');
  if (!new RegExp(`^${INT_RE}$`).test(t)) {
    throw new RangeParseError(`Invalid frame token: "${token}"`);
  }
  return Number.parseInt(t, 10);
}

function parseStepSuffix(segment: string): { base: string; step: number } {
  const idx = segment.toLowerCase().lastIndexOf('x');
  if (idx === -1) return { base: segment, step: 1 };
  const base = segment.slice(0, idx);
  const stepStr = segment.slice(idx + 1);
  if (!new RegExp(`^${INT_RE}$`).test(stepStr)) {
    throw new RangeParseError(`Invalid step value: "${segment}"`);
  }
  const step = Number.parseInt(stepStr, 10);
  if (step <= 0) throw new RangeParseError(`Step must be positive: ${step}`);
  return { base, step };
}

/**
 * Parse a comma-separated list of ranges into a single Range object.
 * The step is taken from the first segment that has an explicit step.
 * The range is always normalized so that start <= end.
 */
export function parseRange(input: string): Range {
  if (typeof input !== 'string') throw new RangeParseError('Input must be a string');
  const trimmed = input.trim();
  if (!trimmed) throw new RangeParseError('Empty range string');

  const segments = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) throw new RangeParseError('Empty range string');

  let step = 1;
  let firstStart: number | null = null;
  let lastEnd: number | null = null;

  for (const segment of segments) {
    const { base, step: segStep } = parseStepSuffix(segment);
    if (segStep !== 1) {
      if (step !== 1) throw new RangeParseError(`Conflicting step values in "${input}"`);
      step = segStep;
    }

    const dashIdx = base.indexOf('-');
    if (dashIdx === -1) {
      const v = parseSingleToken(base);
      if (firstStart === null) firstStart = v;
      lastEnd = v;
    } else {
      const aStr = base.slice(0, dashIdx);
      const bStr = base.slice(dashIdx + 1);
      if (!aStr.trim() || !bStr.trim()) {
        throw new RangeParseError(`Invalid range segment: "${segment}"`);
      }
      const a = parseSingleToken(aStr);
      const b = parseSingleToken(bStr);
      if (firstStart === null) firstStart = Math.min(a, b);
      lastEnd = Math.max(a, b);
    }
  }

  if (firstStart === null || lastEnd === null) {
    throw new RangeParseError(`Could not parse range: "${input}"`);
  }

  if (step <= 0) throw new RangeParseError(`Step must be positive: ${step}`);
  if (firstStart > lastEnd) {
    return { start: lastEnd, end: firstStart, step };
  }
  return { start: firstStart, end: lastEnd, step };
}

/**
 * Expand a Range into an array of frame numbers.
 */
export function expandRange(range: Range): number[] {
  const frames: number[] = [];
  for (let f = range.start; f <= range.end; f += range.step) {
    frames.push(f);
  }
  return frames;
}

/**
 * Return the number of frames in a range.
 */
export function frameCount(range: Range): number {
  if (range.end < range.start) return 0;
  return Math.floor((range.end - range.start) / range.step) + 1;
}

/**
 * Validate that a range is well-formed and step > 0.
 */
export function validateRange(range: Range): void {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    throw new RangeParseError('Range start/end must be finite numbers');
  }
  if (range.step <= 0) throw new RangeParseError('Range step must be positive');
}
