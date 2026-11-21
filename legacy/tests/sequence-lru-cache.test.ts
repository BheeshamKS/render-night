import { SequenceLruCache } from '../src/renderer/sequence/lru-cache';
import type { DecodedFrame } from '../src/renderer/sequence/types';

import { describe, expect, it, vi } from 'vitest';

function makeMockFrame(frame: number, width = 100, height = 100): DecodedFrame {
  return {
    frame,
    bitmap: {
      width,
      height,
      close: vi.fn(),
    } as unknown as ImageBitmap,
    width,
    height,
    byteSize: width * height * 4, // 40,000 bytes
    decodeMs: 2.5,
  };
}

describe('SequenceLruCache', () => {
  it('stores and retrieves frames by number', () => {
    const cache = new SequenceLruCache(1024 * 1024); // 1 MB
    const f1 = makeMockFrame(1);
    cache.set(1, f1);

    expect(cache.has(1)).toBe(true);
    expect(cache.get(1)).toBe(f1);
    expect(cache.size).toBe(1);
    expect(cache.totalBytes).toBe(40000);
  });

  it('evicts oldest frames when total bytes exceed budget and calls bitmap.close()', () => {
    // Budget fits exactly 2 frames (40,000 * 2 = 80,000 bytes)
    // Note constructor clamps to min 256MB unless we set budgetBytes directly for test
    const cache = new SequenceLruCache(256 * 1024 * 1024);
    // Explicitly set smaller budget for test
    // @ts-expect-error override budget for micro-test
    cache._budgetBytes = 85000;

    const f1 = makeMockFrame(1);
    const f2 = makeMockFrame(2);
    const f3 = makeMockFrame(3);

    cache.set(1, f1);
    cache.set(2, f2);
    expect(cache.size).toBe(2);

    // Adding 3rd frame forces eviction of oldest (frame 1)
    cache.set(3, f3);
    expect(cache.has(1)).toBe(false);
    expect(cache.has(2)).toBe(true);
    expect(cache.has(3)).toBe(true);
    expect(f1.bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('refreshes recency on get() so recently accessed items are not evicted first', () => {
    const cache = new SequenceLruCache(256 * 1024 * 1024);
    // @ts-expect-error override budget for micro-test
    cache._budgetBytes = 85000;

    const f1 = makeMockFrame(1);
    const f2 = makeMockFrame(2);
    const f3 = makeMockFrame(3);

    cache.set(1, f1);
    cache.set(2, f2);

    // Access f1 -> makes f1 most recent, f2 becomes oldest
    cache.get(1);

    // Adding f3 should evict f2, NOT f1
    cache.set(3, f3);
    expect(cache.has(2)).toBe(false);
    expect(cache.has(1)).toBe(true);
    expect(cache.has(3)).toBe(true);
    expect(f2.bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('clear() closes all bitmaps and resets total bytes', () => {
    const cache = new SequenceLruCache();
    const f1 = makeMockFrame(1);
    const f2 = makeMockFrame(2);

    cache.set(1, f1);
    cache.set(2, f2);
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.totalBytes).toBe(0);
    expect(f1.bitmap.close).toHaveBeenCalledTimes(1);
    expect(f2.bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('findNearest returns the closest cached frame', () => {
    const cache = new SequenceLruCache();
    const f10 = makeMockFrame(10);
    const f30 = makeMockFrame(30);

    cache.set(10, f10);
    cache.set(30, f30);

    // Frame 12 is closer to 10
    expect(cache.findNearest(12)).toBe(f10);

    // Frame 28 is closer to 30
    expect(cache.findNearest(28)).toBe(f30);

    // Exact match
    expect(cache.findNearest(30)).toBe(f30);
  });
});
