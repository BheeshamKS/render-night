import { parseRange } from '../src/core/render/range-parser';

import { describe, expect, it } from 'vitest';

describe('Range Parser', () => {
  it('parses basic range', () => {
    expect(parseRange('1-10')).toEqual({ start: 1, end: 10, step: 1 });
  });
  it('parses range with step', () => {
    expect(parseRange('1-10x2')).toEqual({ start: 1, end: 10, step: 2 });
  });
  it('parses single frame', () => {
    expect(parseRange('5')).toEqual({ start: 5, end: 5, step: 1 });
  });
});
