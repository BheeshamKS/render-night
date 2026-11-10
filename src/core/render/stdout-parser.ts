import { RN_EVENT_PREFIX, runnerEventSchema, type RunnerEvent } from '../schemas';

export interface StdoutProgress {
  frame?: number;
  memory?: string;
  time?: string;
  remaining?: string;
  samples?: {
    current: number;
    total: number;
  };
}

export interface StdoutContext {
  currentFrame?: number;
  currentScene?: string;
}

export interface ParsedLine {
  kind: 'event' | 'progress' | 'saved' | 'text';
  event?: RunnerEvent;
  progress?: StdoutProgress;
  savedPath?: string;
  text?: string;
  raw: string;
}

export class StdoutParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StdoutParseError';
  }
}

const FRA_RE = /Fra:(\d+)/;
const MEM_RE = /Mem:([0-9.]+[KkMmGgTt]?[Bb]?)/;
const TIME_RE = /Time:([0-9:.]+)/;
const REM_RE = /Remaining:([0-9:.]+)/;
const SAMPLES_RE1 = /Rendered\s*(\d+)\/(\d+)\s*Samples/i;
const SAMPLES_RE2 = /Sample\s*(\d+)\/(\d+)/i;
const SAVED_RE = /^Saved:\s*['"]?([^'"]+)['"]?\s*$/;

/**
 * Parse a single line of Blender stdout.
 */
export function parseStdoutLine(line: string, _ctx: StdoutContext = {}): ParsedLine {
  const raw = line;
  const trimmed = line.trim();

  if (!trimmed) return { kind: 'text', text: '', raw };

  // 1. Structured RN_EVENT lines
  if (trimmed.startsWith(RN_EVENT_PREFIX)) {
    const jsonStr = trimmed.slice(RN_EVENT_PREFIX.length).trim();
    if (!jsonStr) {
      return { kind: 'text', text: raw, raw };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new StdoutParseError(`Invalid ${RN_EVENT_PREFIX} JSON: ${jsonStr.slice(0, 120)}...`);
    }
    const result = runnerEventSchema.safeParse(parsed);
    if (!result.success) {
      throw new StdoutParseError(`Invalid ${RN_EVENT_PREFIX} payload: ${result.error.message}`);
    }
    return { kind: 'event', event: result.data, raw };
  }

  // 2. Saved line
  const savedMatch = trimmed.match(SAVED_RE);
  if (savedMatch) {
    return {
      kind: 'saved',
      savedPath: savedMatch[1].trim(),
      raw,
    };
  }

  // 3. Native progress line (Fra:, Mem:, Time:, Remaining:, Sample x/y)
  const fraMatch = trimmed.match(FRA_RE);
  const memMatch = trimmed.match(MEM_RE);
  const timeMatch = trimmed.match(TIME_RE);
  const remMatch = trimmed.match(REM_RE);
  const samplesMatch = trimmed.match(SAMPLES_RE1) || trimmed.match(SAMPLES_RE2);

  if (fraMatch || memMatch || timeMatch || remMatch || samplesMatch) {
    const progress: StdoutProgress = {};
    if (fraMatch) progress.frame = Number.parseInt(fraMatch[1], 10);
    if (memMatch) progress.memory = memMatch[1];
    if (timeMatch) progress.time = timeMatch[1];
    if (remMatch) progress.remaining = remMatch[1];
    if (samplesMatch) {
      progress.samples = {
        current: Number.parseInt(samplesMatch[1], 10),
        total: Number.parseInt(samplesMatch[2], 10),
      };
    }
    return {
      kind: 'progress',
      progress,
      raw,
    };
  }

  return { kind: 'text', text: trimmed, raw };
}

/**
 * Parse a stream of Blender stdout lines, tracking context between lines.
 */
export function parseStdoutStream(lines: string[]): ParsedLine[] {
  const ctx: StdoutContext = {};
  const out: ParsedLine[] = [];
  for (const line of lines) {
    const parsed = parseStdoutLine(line, ctx);
    if (parsed.kind === 'progress' && parsed.progress?.frame !== undefined) {
      ctx.currentFrame = parsed.progress.frame;
    } else if (parsed.kind === 'event' && parsed.event?.type === 'frame_start') {
      ctx.currentFrame = parsed.event.frame;
    }
    out.push(parsed);
  }
  return out;
}
