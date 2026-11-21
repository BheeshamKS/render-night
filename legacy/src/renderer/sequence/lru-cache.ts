import type { DecodedFrame } from './types';

export const DEFAULT_MEMORY_BUDGET_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB default

/**
 * Calculates default memory budget: min(4 GB, 40% of system RAM when available).
 */
export function getDefaultMemoryBudget(): number {
  if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
    const ramGb = (navigator as { deviceMemory?: number }).deviceMemory || 8;
    const ramBytes = ramGb * 1024 * 1024 * 1024;
    return Math.min(4 * 1024 * 1024 * 1024, Math.round(ramBytes * 0.4));
  }
  return DEFAULT_MEMORY_BUDGET_BYTES;
}

export class SequenceLruCache {
  private _cache: Map<number, DecodedFrame> = new Map();
  private _totalBytes = 0;
  private _budgetBytes: number;

  constructor(budgetBytes: number = getDefaultMemoryBudget()) {
    this._budgetBytes = Math.max(256 * 1024 * 1024, budgetBytes); // At least 256MB
  }

  public get budgetBytes(): number {
    return this._budgetBytes;
  }

  public set budgetBytes(bytes: number) {
    this._budgetBytes = Math.max(256 * 1024 * 1024, bytes);
    this.evictToBudget();
  }

  public get totalBytes(): number {
    return this._totalBytes;
  }

  public get size(): number {
    return this._cache.size;
  }

  public has(frame: number): boolean {
    return this._cache.has(frame);
  }

  public get(frame: number): DecodedFrame | undefined {
    const item = this._cache.get(frame);
    if (!item) return undefined;
    // Re-insert to refresh recency in Map iteration order
    this._cache.delete(frame);
    this._cache.set(frame, item);
    return item;
  }

  public peek(frame: number): DecodedFrame | undefined {
    return this._cache.get(frame);
  }

  public set(frame: number, item: DecodedFrame): void {
    const existing = this._cache.get(frame);
    if (existing) {
      this._totalBytes -= existing.byteSize;
      if (existing.bitmap !== item.bitmap) {
        try {
          existing.bitmap.close();
        } catch {}
      }
      this._cache.delete(frame);
    }

    this._cache.set(frame, item);
    this._totalBytes += item.byteSize;
    this.evictToBudget();
  }

  public delete(frame: number): boolean {
    const existing = this._cache.get(frame);
    if (!existing) return false;

    this._totalBytes -= existing.byteSize;
    try {
      existing.bitmap.close();
    } catch {}
    return this._cache.delete(frame);
  }

  public clear(): void {
    for (const item of this._cache.values()) {
      try {
        item.bitmap.close();
      } catch {}
    }
    this._cache.clear();
    this._totalBytes = 0;
  }

  public evictToBudget(): void {
    while (this._totalBytes > this._budgetBytes && this._cache.size > 0) {
      const oldestKey = this._cache.keys().next().value;
      if (oldestKey === undefined) break;

      const oldestItem = this._cache.get(oldestKey);
      if (oldestItem) {
        this._totalBytes -= oldestItem.byteSize;
        try {
          oldestItem.bitmap.close();
        } catch {}
      }
      this._cache.delete(oldestKey);
    }
  }

  /**
   * Returns the nearest cached frame for instant rendering while dragging or scrubbing.
   */
  public findNearest(targetFrame: number): DecodedFrame | null {
    if (this._cache.size === 0) return null;
    const exact = this._cache.get(targetFrame);
    if (exact) return exact;

    let nearest: DecodedFrame | null = null;
    let minDiff = Infinity;

    for (const [f, item] of this._cache.entries()) {
      const diff = Math.abs(f - targetFrame);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = item;
      }
    }

    return nearest;
  }

  /**
   * Returns an array of all currently cached frame numbers.
   */
  public getCachedFrames(): number[] {
    return Array.from(this._cache.keys());
  }
}
