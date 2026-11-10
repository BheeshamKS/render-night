import { parseStdoutLine } from '../src/core/render/stdout-parser';

import { describe, expect, it } from 'vitest';

describe('Stdout Parser', () => {
  it('parses RN_EVENT line', () => {
    const line = 'RN_EVENT {"type":"frame_start","frame":1,"scene":"Scene"}';
    const result = parseStdoutLine(line);
    expect(result.kind).toBe('event');
    expect(result.event).toEqual({ type: 'frame_start', frame: 1, scene: 'Scene' });
  });

  it('parses native Blender Cycles render line with Fra, Mem, Time, Remaining, and Samples', () => {
    const line =
      'Fra:1 Mem:24.50M (Peak 25.10M) | Time:00:00.52 | Remaining:00:05.12 | Mem:12.30M, Peak:14.20M | Scene, ViewLayer | Rendered 32/128 Samples';
    const result = parseStdoutLine(line);
    expect(result.kind).toBe('progress');
    expect(result.progress).toEqual({
      frame: 1,
      memory: '24.50M',
      time: '00:00.52',
      remaining: '00:05.12',
      samples: { current: 32, total: 128 },
    });
  });

  it('parses native Cycles sample alternative format: Sample 10/100', () => {
    const line = 'Fra:42 Mem:100.2M | Time:00:02.10 | Sample 10/100';
    const result = parseStdoutLine(line);
    expect(result.kind).toBe('progress');
    expect(result.progress?.frame).toBe(42);
    expect(result.progress?.samples).toEqual({ current: 10, total: 100 });
  });

  it('parses native Saved line with quoted and unquoted paths', () => {
    const line1 = 'Saved: "/path/to/render_0001.png"';
    const result1 = parseStdoutLine(line1);
    expect(result1.kind).toBe('saved');
    expect(result1.savedPath).toBe('/path/to/render_0001.png');

    const line2 = "Saved: '/path/to/render_0002.png'";
    const result2 = parseStdoutLine(line2);
    expect(result2.kind).toBe('saved');
    expect(result2.savedPath).toBe('/path/to/render_0002.png');
  });

  it('passes regular text as kind text', () => {
    const line = 'Blender quit';
    const result = parseStdoutLine(line);
    expect(result.kind).toBe('text');
    expect(result.text).toBe('Blender quit');
  });
});
