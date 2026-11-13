import type { ImageSequenceInfo } from '../../core/schemas/sequence';
import { toRnMediaUrl } from '../utils/url';
import { SequenceClock } from './clock';
import { DecoderPool } from './decoder-pool';
import { getDefaultMemoryBudget, SequenceLruCache } from './lru-cache';
import { getPrioritizedDecodeList } from './read-ahead';
import type { DecodedFrame, PlaybackMode, PlayerStats } from './types';

export interface PlayerEngineOptions {
  sequence: ImageSequenceInfo;
  fps?: number;
  speed?: number;
  loop?: boolean;
  inPoint?: number | null;
  outPoint?: number | null;
  mode?: PlaybackMode;
  memoryBudgetBytes?: number;
  onFrameChange?: (frame: number) => void;
  onStatsChange?: (stats: PlayerStats) => void;
}

export class SequencePlayerEngine {
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;

  public sequence: ImageSequenceInfo;
  public clock: SequenceClock;
  public cache: SequenceLruCache;
  public pool: DecoderPool;

  private _rafId: number | null = null;
  private _isRunning = false;

  // Render state & caching
  private _lastDrawnFrame = -1;
  private _lastReadyFrame: DecodedFrame | null = null;

  // View transform
  public zoom = 1;
  public panX = 0;
  public panY = 0;
  public fitActual = false;

  // Stats tracking
  private _renderedFrames = 0;
  private _droppedFrames = 0;
  private _lastStatTime = 0;
  private _framesInWindow = 0;
  private _achievedFps = 0;
  private _lastDecodeMs = 0;
  private _statThrottleMs = 100; // 10 Hz UI updates
  private _lastStatEmit = 0;

  private _onFrameChange?: (frame: number) => void;
  private _onStatsChange?: (stats: PlayerStats) => void;

  // Display size cache
  private _displayWidth = 0;
  private _displayHeight = 0;
  private _dpr = 1;

  constructor(options: PlayerEngineOptions) {
    this.sequence = options.sequence;
    this._onFrameChange = options.onFrameChange;
    this._onStatsChange = options.onStatsChange;

    const fps = options.fps || 24;
    const speed = options.speed || 1;
    const loop = options.loop !== undefined ? options.loop : true;

    this.clock = new SequenceClock(this.sequence.startFrame, {
      fps,
      speed,
      loop,
      startFrame: this.sequence.startFrame,
      endFrame: this.sequence.endFrame,
      inPoint: options.inPoint,
      outPoint: options.outPoint,
      mode: options.mode || 'realtime',
    });

    const budget = options.memoryBudgetBytes || getDefaultMemoryBudget();
    this.cache = new SequenceLruCache(budget);

    // Initialize decoder pool (2 to 4 workers)
    const concurrency =
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 4;
    const workerCount = Math.max(2, Math.min(4, concurrency - 1));

    this.pool = new DecoderPool(
      workerCount,
      (decoded) => this._onFrameDecoded(decoded),
      (frame, err) => this._onFrameError(frame, err),
    );

    this._lastStatTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  public attachCanvas(canvas: HTMLCanvasElement): void {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.resizeToDisplay();
    this.drawCurrentFrame();
  }

  public detachCanvas(): void {
    this.pause();
    this._canvas = null;
    this._ctx = null;
  }

  public resizeToDisplay(): void {
    if (!this._canvas) return;
    const rect = this._canvas.getBoundingClientRect();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));

    if (this._canvas.width !== w || this._canvas.height !== h) {
      this._canvas.width = w;
      this._canvas.height = h;
      this._displayWidth = rect.width;
      this._displayHeight = rect.height;
      this._dpr = dpr;
      this._lastDrawnFrame = -1; // Force redraw
      this.drawCurrentFrame();
    }
  }

  public play(): void {
    this.clock.play();
    this._startLoop();
  }

  public pause(): void {
    this.clock.pause();
    this._stopLoop();
    this._emitStats();
  }

  public togglePlay(): boolean {
    if (this.clock.isPlaying) {
      this.pause();
      return false;
    } else {
      this.play();
      return true;
    }
  }

  public seek(frame: number): void {
    this.clock.seek(frame);
    this._onFrameChange?.(this.clock.currentFrame);
    this._scheduleReadAhead();
    this.drawCurrentFrame();
  }

  public step(delta: number): void {
    const f = this.clock.step(delta);
    this._onFrameChange?.(f);
    this._scheduleReadAhead();
    this.drawCurrentFrame();
  }

  public scrubTo(frame: number): void {
    this.clock.seek(frame);
    this._onFrameChange?.(this.clock.currentFrame);

    // Instant response: if target is cached, draw it!
    const target = this.cache.get(frame);
    if (target) {
      this._renderBitmap(target.bitmap);
      this._lastReadyFrame = target;
      this._lastDrawnFrame = frame;
    } else {
      // Show nearest cached frame immediately (< 1 ms), then upgrade when target arrives
      const nearest = this.cache.findNearest(frame);
      if (nearest) {
        this._renderBitmap(nearest.bitmap);
      }
    }

    this._scheduleReadAhead();
  }

  public setMode(mode: PlaybackMode): void {
    this.clock.options.mode = mode;
  }

  public setFps(fps: number): void {
    this.clock.options.fps = fps;
  }

  public setSpeed(speed: number): void {
    this.clock.options.speed = speed;
  }

  public setLoop(loop: boolean): void {
    this.clock.options.loop = loop;
  }

  public setInOut(inPoint: number | null, outPoint: number | null): void {
    this.clock.options.inPoint = inPoint;
    this.clock.options.outPoint = outPoint;
  }

  private _startLoop(): void {
    if (this._isRunning) return;
    this._isRunning = true;

    const tick = (now: number) => {
      if (!this._isRunning) return;

      this._updatePlayback(now);
      this._rafId = requestAnimationFrame(tick);
    };

    this._rafId = requestAnimationFrame(tick);
  }

  private _stopLoop(): void {
    this._isRunning = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  private _updatePlayback(now: number): void {
    const { frame, hasChanged, hasEnded } = this.clock.update(now);

    if (hasEnded) {
      this.pause();
      return;
    }

    if (hasChanged) {
      this._onFrameChange?.(frame);
    }

    // Measure achieved FPS over rolling window
    if (now - this._lastStatTime >= 1000) {
      this._achievedFps = (this._framesInWindow * 1000) / (now - this._lastStatTime);
      this._framesInWindow = 0;
      this._lastStatTime = now;
    }

    const cached = this.cache.get(frame);

    if (cached) {
      if (this.clock.isPausedForDecode) {
        this.clock.resumeFromDecode(now);
      }

      if (this._lastDrawnFrame !== frame) {
        this._renderBitmap(cached.bitmap);
        this._lastDrawnFrame = frame;
        this._lastReadyFrame = cached;
        this._renderedFrames++;
        this._framesInWindow++;
      }
    } else {
      // Frame not ready in cache
      if (this.clock.options.mode === 'every-frame') {
        this.clock.pauseForDecode(now);
      } else {
        // Realtime mode: hold last ready frame and count drop
        if (hasChanged) {
          this._droppedFrames++;
          if (this._lastReadyFrame) {
            this._renderBitmap(this._lastReadyFrame.bitmap);
          }
        }
      }
    }

    this._scheduleReadAhead();

    // Throttled stats emission for UI
    if (now - this._lastStatEmit >= this._statThrottleMs) {
      this._emitStats();
      this._lastStatEmit = now;
    }
  }

  public drawCurrentFrame(): void {
    const f = this.clock.currentFrame;
    const cached = this.cache.get(f) || this.cache.findNearest(f);
    if (cached) {
      this._renderBitmap(cached.bitmap);
      this._lastDrawnFrame = f;
      this._lastReadyFrame = cached;
    } else {
      this._renderBlank();
    }
  }

  private _scheduleReadAhead(): void {
    const current = this.clock.currentFrame;
    const dir = this.clock.options.speed >= 0 ? 1 : -1;
    const lookAhead = Math.round(this.clock.options.fps * 2); // 2 seconds ahead

    const neededFrames = getPrioritizedDecodeList(
      current,
      dir,
      this.clock.effectiveStart,
      this.clock.effectiveEnd,
      this.clock.options.loop,
      lookAhead,
      (f) => this.cache.has(f),
      (f) => this.pool.isInFlight(f),
    );

    // Cancel queued jobs outside the active read-ahead window
    const activeSet = new Set(neededFrames);
    activeSet.add(current);
    this.pool.cancelStale(activeSet);

    // Target dimensions for downscale (if image is larger than display * dpr)
    const targetW = this._displayWidth > 0 ? Math.round(this._displayWidth * this._dpr) : undefined;
    const targetH =
      this._displayHeight > 0 ? Math.round(this._displayHeight * this._dpr) : undefined;

    for (let i = 0; i < neededFrames.length; i++) {
      const f = neededFrames[i];
      const filePath = this.sequence.filePaths[f];
      if (!filePath) continue;

      this.pool.enqueue({
        id: `decode_${f}_${Date.now()}`,
        frame: f,
        url: toRnMediaUrl(filePath),
        filePath,
        targetWidth: targetW,
        targetHeight: targetH,
        priority: 1000 - i, // Closer frames get higher priority
      });
    }
  }

  private _onFrameDecoded(decoded: DecodedFrame): void {
    this.cache.set(decoded.frame, decoded);
    this._lastDecodeMs = decoded.decodeMs;

    // If waiting for this frame or currently seeking to it, draw it immediately!
    if (
      this.clock.currentFrame === decoded.frame ||
      (this.clock.isPausedForDecode && this.clock.currentFrame === decoded.frame)
    ) {
      if (this.clock.isPausedForDecode) {
        this.clock.resumeFromDecode();
      }
      this._renderBitmap(decoded.bitmap);
      this._lastDrawnFrame = decoded.frame;
      this._lastReadyFrame = decoded;
    }
  }

  private _onFrameError(frame: number, _error: string): void {
    // If every-frame was waiting for this frame, resume so it doesn't freeze forever
    if (this.clock.isPausedForDecode && this.clock.currentFrame === frame) {
      this.clock.resumeFromDecode();
    }
  }

  private _renderBitmap(bitmap: ImageBitmap): void {
    if (!this._ctx || !this._canvas) return;
    const ctx = this._ctx;
    const cw = this._canvas.width;
    const ch = this._canvas.height;

    ctx.save();
    // Dark background
    ctx.fillStyle = '#0f0f10';
    ctx.fillRect(0, 0, cw, ch);

    // Checkerboard for alpha
    this._drawCheckerboard(ctx, cw, ch);

    const bw = bitmap.width;
    const bh = bitmap.height;

    let destW: number;
    let destH: number;

    if (this.fitActual) {
      destW = bw * this.zoom;
      destH = bh * this.zoom;
    } else {
      const scale = Math.min(cw / bw, ch / bh) * this.zoom;
      destW = bw * scale;
      destH = bh * scale;
    }

    const destX = (cw - destW) / 2 + this.panX * this._dpr;
    const destY = (ch - destH) / 2 + this.panY * this._dpr;

    ctx.drawImage(bitmap, destX, destY, destW, destH);
    ctx.restore();
  }

  private _drawCheckerboard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const size = 16 * this._dpr;
    ctx.fillStyle = '#141416';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1c1c1f';
    for (let y = 0; y < h; y += size) {
      for (let x = (y / size) % 2 === 0 ? 0 : size; x < w; x += size * 2) {
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  private _renderBlank(): void {
    if (!this._ctx || !this._canvas) return;
    this._ctx.fillStyle = '#0f0f10';
    this._ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
  }

  private _emitStats(): void {
    const stats: PlayerStats = {
      achievedFps: Number(this._achievedFps.toFixed(1)),
      targetFps: this.clock.options.fps * this.clock.options.speed,
      droppedFrames: this._droppedFrames,
      renderedFrames: this._renderedFrames,
      decodeMs: Number(this._lastDecodeMs.toFixed(1)),
      cacheMb: Math.round(this.cache.totalBytes / (1024 * 1024)),
      budgetMb: Math.round(this.cache.budgetBytes / (1024 * 1024)),
      cachedFramesCount: this.cache.size,
      totalFrames: this.sequence.totalFrames,
      mode: 'Cache',
    };

    this._onStatsChange?.(stats);

    // Expose stats globally on window for benchmark scripts
    if (typeof window !== 'undefined') {
      (window as unknown as { __playerEngineStats?: unknown }).__playerEngineStats = stats;
    }
  }

  public getStats(): PlayerStats {
    return {
      achievedFps: Number(this._achievedFps.toFixed(1)),
      targetFps: this.clock.options.fps * this.clock.options.speed,
      droppedFrames: this._droppedFrames,
      renderedFrames: this._renderedFrames,
      decodeMs: Number(this._lastDecodeMs.toFixed(1)),
      cacheMb: Math.round(this.cache.totalBytes / (1024 * 1024)),
      budgetMb: Math.round(this.cache.budgetBytes / (1024 * 1024)),
      cachedFramesCount: this.cache.size,
      totalFrames: this.sequence.totalFrames,
      mode: 'Cache',
    };
  }

  public destroy(): void {
    this.pause();
    this.pool.terminate();
    this.cache.clear();
    this._lastReadyFrame = null;
    this._canvas = null;
    this._ctx = null;
  }
}
