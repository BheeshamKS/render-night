import { getPrioritizedDecodeList, isJobStale } from '../src/renderer/sequence/read-ahead';

import { describe, expect, it } from 'vitest';

describe('Sequence Read-Ahead Prioritisation', () => {
  it('places current frame first, forward frames next, and reverse cushion last', () => {
    const cached = new Set<number>();
    const inFlight = new Set<number>();

    const list = getPrioritizedDecodeList(
      10, // currentFrame
      1, // forward
      1, // startFrame
      50, // endFrame
      true, // loop
      5, // lookAheadCount
      (f) => cached.has(f),
      (f) => inFlight.has(f),
    );

    // Expected:
    // [10] (current)
    // [11, 12, 13, 14, 15] (forward lookahead)
    // [9, 8] (reverse cushion)
    expect(list[0]).toBe(10);
    expect(list.slice(1, 6)).toEqual([11, 12, 13, 14, 15]);
    expect(list.slice(6)).toEqual([9, 8]);
  });

  it('skips frames that are already cached or in flight', () => {
    const cached = new Set<number>([10, 12]);
    const inFlight = new Set<number>([11]);

    const list = getPrioritizedDecodeList(
      10,
      1,
      1,
      50,
      true,
      4,
      (f) => cached.has(f),
      (f) => inFlight.has(f),
    );

    // 10 is cached -> skipped
    // 11 is in-flight -> skipped
    // 12 is cached -> skipped
    // Next should be 13, 14
    expect(list.includes(10)).toBe(false);
    expect(list.includes(11)).toBe(false);
    expect(list.includes(12)).toBe(false);
    expect(list[0]).toBe(13);
    expect(list[1]).toBe(14);
  });

  it('wraps around to start when looping at end of sequence', () => {
    const cached = new Set<number>();
    const inFlight = new Set<number>();

    const list = getPrioritizedDecodeList(
      48,
      1,
      1,
      50,
      true,
      5,
      (f) => cached.has(f),
      (f) => inFlight.has(f),
    );

    // 48, 49, 50, then wraps to 1, 2, 3
    expect(list.slice(0, 3)).toEqual([48, 49, 50]);
    expect(list.slice(3, 6)).toEqual([1, 2, 3]);
  });

  it('isJobStale detects frames outside the active window', () => {
    // Current frame 10, radius 15
    // Frame 20 is distance 10 <= 15 -> not stale
    expect(isJobStale(20, 10, 1, 100, true, 15)).toBe(false);

    // Frame 50 is distance 40 > 15 -> stale
    expect(isJobStale(50, 10, 1, 100, true, 15)).toBe(true);
  });
});
