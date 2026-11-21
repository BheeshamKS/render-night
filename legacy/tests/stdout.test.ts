import { parseStdoutLine, StdoutParseError } from '../src/core/render/stdout-parser';

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
      peakMemory: '25.10M',
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

  it('parses real recorded Blender 4.2 Cycles OptiX output sample', () => {
    const line =
      'Fra:10 Mem:312.45M (Peak 450.80M) | Time:00:03.45 | Remaining:00:15.20 | Mem:280.10M, Peak:350.20M | Scene, ViewLayer | Rendered 512/512 Samples';
    const result = parseStdoutLine(line);
    expect(result.kind).toBe('progress');
    expect(result.progress?.frame).toBe(10);
    expect(result.progress?.memory).toBe('312.45M');
    expect(result.progress?.peakMemory).toBe('450.80M');
    expect(result.progress?.time).toBe('00:03.45');
    expect(result.progress?.remaining).toBe('00:15.20');
    expect(result.progress?.samples).toEqual({ current: 512, total: 512 });
  });

  it('parses real recorded Blender 4.2 EEVEE-Next output sample', () => {
    const line = 'Fra:25 Mem:124.50M (Peak 180.20M) | Time:00:00.35 | Syncing Scene';
    const result = parseStdoutLine(line);
    expect(result.kind).toBe('progress');
    expect(result.progress?.frame).toBe(25);
    expect(result.progress?.memory).toBe('124.50M');
    expect(result.progress?.peakMemory).toBe('180.20M');
    expect(result.progress?.time).toBe('00:00.35');
  });

  it('passes regular text as kind text', () => {
    const line = 'Blender quit';
    const result = parseStdoutLine(line);
    expect(result.kind).toBe('text');
    expect(result.text).toBe('Blender quit');
  });

  it('handles remaining time in HH:MM:SS format and carriage returns', () => {
    const line =
      'Fra:50 Mem:1024.00M (Peak 1500.00M) | Time:00:15.30 | Remaining:01:45:20.10 | Sample 256/512\r\n';
    const result = parseStdoutLine(line);
    expect(result.kind).toBe('progress');
    expect(result.progress?.frame).toBe(50);
    expect(result.progress?.remaining).toBe('01:45:20.10');
    expect(result.progress?.samples).toEqual({ current: 256, total: 512 });
  });

  it('handles unquoted Saved path lines', () => {
    const line = 'Saved: /var/renders/shot_0005.exr';
    const result = parseStdoutLine(line);
    expect(result.kind).toBe('saved');
    expect(result.savedPath).toBe('/var/renders/shot_0005.exr');
  });

  it('handles malformed RN_EVENT JSON safely by throwing StdoutParseError', () => {
    const line = 'RN_EVENT { not valid json }';
    expect(() => parseStdoutLine(line)).toThrow(StdoutParseError);
  });
});
