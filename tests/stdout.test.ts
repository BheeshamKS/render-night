import { parseStdoutLine } from '../src/core/render/stdout-parser';

import { describe, expect, it } from 'vitest';

describe('Stdout Parser', () => {
  it('parses RN_EVENT line', () => {
    const line = 'RN_EVENT {"type":"frame_start","frame":1,"scene":"Scene"}';
    const result = parseStdoutLine(line);
    expect(result.kind).toBe('event');
    expect(result.event).toEqual({ type: 'frame_start', frame: 1, scene: 'Scene' });
  });
});
