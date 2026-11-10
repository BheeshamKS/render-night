import { runnerEventSchema, RN_EVENT_PREFIX, type RunnerEvent } from '../schemas';

/**
 * Parse Blender's native stdout markers and the structured RN_EVENT lines
 * emitted by render_runner.py.
 *
 * Native markers (parsed into structured events):
 *   Fra: <n>/<total>           → frame_start (current frame being rendered)
 *   Mem: <n>                  → ignored (no NR_MEM marker)
 *   Time: <n>                 → ignored (no NR_TIME marker)
 *   Remaining: <n>            → ignored (no NR_TIME marker)
 *   Sample x/y                → ignored (no NR_SAMPLE marker)
 *   Saved: "<path>"           → frame_end (saved output)
 *
 * Structured lines:
 *   RN_EVENT {"type":"..."}    → validated runner event
 */

export interface StdoutContext {
  currentFrame?: number;
  currentScene?: string;
}

export interface ParsedLine {
  kind: 'event' | 'text';
  event?: RunnerEvent;
  text?: string;
  raw: string;
}

export class StdoutParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StdoutParseError';
  }
}

const FRA_RE = /^Fra:\s*(\d+)\/(\d+)\s*$/;
const SAVED_RE = /^Saved:\s*"(.+)"\s*$/;
const SAVED_RE2 = /^Saved:\s*(\S+)\s*$/;

/**
 * Parse a single line of Blender stdout.
 */
export function parseStdoutLine(line: string, ctx: StdoutContext = {}): ParsedLine {
  const raw = line;
  const trimmed = line.trim();

  if (!trimmed) return { kind: 'text', text: '', raw };

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

  const fraMatch = trimmed.match(FRA_RE);
  if (fraMatch) {
    const frame = Number.parseInt(fraMatch[1], 10);
    return {
      kind: 'event',
      event: {
        type: 'frame_start',
        frame,
        scene: ctx.currentScene ?? 'Scene',
      },
      raw,
    };
  }

  const savedMatch = trimmed.match(SAVED_RE) || trimmed.match(SAVED_RE2);
  if (savedMatch) {
    const frame = ctx.currentFrame ?? 0;
    return {
      kind: 'event',
      event: {
        type: 'frame_end',
        frame,
        scene: ctx.currentScene ?? 'Scene',
        saved: savedMatch[1],
      },
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
    if (parsed.kind === 'event' && parsed.event) {
      if (parsed.event.type === 'frame_start') {
        ctx.currentFrame = parsed.event.frame;
      } else if (parsed.event.type === 'frame_end') {
        ctx.currentFrame = undefined;
      }
    }
    out.push(parsed);
  }
  return out;
}
