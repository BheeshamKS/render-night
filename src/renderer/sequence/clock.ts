import type { PlaybackMode } from './types';

export interface ClockOptions {
  fps: number;
  speed: number;
  loop: boolean;
  startFrame: number;
  endFrame: number;
  inPoint?: number | null;
  outPoint?: number | null;
  mode?: PlaybackMode;
}

/**
 * Pure math function calculating the target frame index from an elapsed time in seconds.
 * Supports positive and negative playback speed (shuttle), looping, and In/Out boundaries.
 */
export function calculateTargetFrame(
  elapsedSeconds: number,
  baseFrame: number,
  options: ClockOptions,
): { frame: number; hasEnded: boolean; wrapped: boolean } {
  const { fps, speed, loop, startFrame, endFrame, inPoint, outPoint } = options;

  const effectiveStart =
    inPoint !== null && inPoint !== undefined && inPoint >= startFrame ? inPoint : startFrame;
  const effectiveEnd =
    outPoint !== null && outPoint !== undefined && outPoint <= endFrame ? outPoint : endFrame;

  if (effectiveStart >= effectiveEnd) {
    return { frame: effectiveStart, hasEnded: true, wrapped: false };
  }

  const rangeLength = effectiveEnd - effectiveStart + 1;
  const rawAdvance = Math.floor(elapsedSeconds * fps * speed);

  if (speed >= 0) {
    const rawTarget = baseFrame + rawAdvance;
    if (rawTarget > effectiveEnd) {
      if (!loop) {
        return { frame: effectiveEnd, hasEnded: true, wrapped: false };
      }
      const overflow = (rawTarget - effectiveStart) % rangeLength;
      return { frame: effectiveStart + overflow, hasEnded: false, wrapped: true };
    }
    if (rawTarget < effectiveStart) {
      return { frame: effectiveStart, hasEnded: false, wrapped: false };
    }
    return { frame: rawTarget, hasEnded: false, wrapped: false };
  } else {
    // Reverse playback (negative speed / reverse shuttle)
    const rawTarget = baseFrame + rawAdvance;
    if (rawTarget < effectiveStart) {
      if (!loop) {
        return { frame: effectiveStart, hasEnded: true, wrapped: false };
      }
      const underflow = (effectiveEnd - rawTarget) % rangeLength;
      return { frame: effectiveEnd - underflow, hasEnded: false, wrapped: true };
    }
    if (rawTarget > effectiveEnd) {
      return { frame: effectiveEnd, hasEnded: false, wrapped: false };
    }
    return { frame: rawTarget, hasEnded: false, wrapped: false };
  }
}

export class SequenceClock {
  private _isPlaying = false;
  private _currentFrame: number;
  private _baseFrame: number;
  private _t0 = 0;
  private _pauseStart = 0;
  private _isPausedForDecode = false;

  public options: ClockOptions;

  constructor(initialFrame: number, options: ClockOptions) {
    this._currentFrame = initialFrame;
    this._baseFrame = initialFrame;
    this.options = { ...options, mode: options.mode || 'realtime' };
  }

  public get isPlaying(): boolean {
    return this._isPlaying;
  }

  public get currentFrame(): number {
    return this._currentFrame;
  }

  public get isPausedForDecode(): boolean {
    return this._isPausedForDecode;
  }

  public play(now: number = performance.now()): void {
    if (this._isPlaying) return;
    this._isPlaying = true;
    this._baseFrame = this._currentFrame;
    this._t0 = now;
    this._isPausedForDecode = false;
  }

  public pause(): void {
    this._isPlaying = false;
    this._isPausedForDecode = false;
  }

  public seek(frame: number, now: number = performance.now()): void {
    const start = this.effectiveStart;
    const end = this.effectiveEnd;
    this._currentFrame = Math.max(start, Math.min(end, frame));
    this._baseFrame = this._currentFrame;
    this._t0 = now;
    this._isPausedForDecode = false;
  }

  public step(delta: number): number {
    this.pause();
    this.seek(this._currentFrame + delta);
    return this._currentFrame;
  }

  public pauseForDecode(now: number = performance.now()): void {
    if (this.options.mode === 'every-frame' && this._isPlaying && !this._isPausedForDecode) {
      this._isPausedForDecode = true;
      this._pauseStart = now;
    }
  }

  public resumeFromDecode(now: number = performance.now()): void {
    if (this._isPausedForDecode) {
      const pausedDuration = now - this._pauseStart;
      this._t0 += pausedDuration;
      this._isPausedForDecode = false;
    }
  }

  public update(now: number = performance.now()): {
    frame: number;
    hasChanged: boolean;
    hasEnded: boolean;
  } {
    if (!this._isPlaying || this._isPausedForDecode) {
      return { frame: this._currentFrame, hasChanged: false, hasEnded: false };
    }

    const elapsedSeconds = Math.max(0, (now - this._t0) / 1000);
    const { frame, hasEnded } = calculateTargetFrame(elapsedSeconds, this._baseFrame, this.options);

    const hasChanged = frame !== this._currentFrame;
    this._currentFrame = frame;

    if (hasEnded) {
      this._isPlaying = false;
    }

    return { frame, hasChanged, hasEnded };
  }

  public get effectiveStart(): number {
    const { inPoint, startFrame } = this.options;
    return inPoint !== null && inPoint !== undefined && inPoint >= startFrame
      ? inPoint
      : startFrame;
  }

  public get effectiveEnd(): number {
    const { outPoint, endFrame } = this.options;
    return outPoint !== null && outPoint !== undefined && outPoint <= endFrame
      ? outPoint
      : endFrame;
  }
}
