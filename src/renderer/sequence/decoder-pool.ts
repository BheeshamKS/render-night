import type { DecodedFrame, DecodeTask } from './types';

const WORKER_CODE = `
self.onmessage = async (e) => {
  const { id, frame, url, targetWidth, targetHeight } = e.data;
  const t0 = performance.now();
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error('HTTP ' + resp.status + ' fetching frame ' + frame);
    }
    const blob = await resp.blob();
    const opts = (targetWidth && targetHeight && targetWidth > 0 && targetHeight > 0)
      ? { resizeWidth: Math.round(targetWidth), resizeHeight: Math.round(targetHeight), resizeQuality: 'medium' }
      : undefined;

    const bitmap = await createImageBitmap(blob, opts);
    const decodeMs = performance.now() - t0;
    const byteSize = bitmap.width * bitmap.height * 4;

    self.postMessage({
      id,
      frame,
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      byteSize,
      decodeMs,
      success: true,
    }, [bitmap]);
  } catch (err) {
    self.postMessage({
      id,
      frame,
      error: err instanceof Error ? err.message : String(err),
      success: false,
    });
  }
};
`;

interface WorkerSlot {
  worker: Worker | null;
  currentTask: DecodeTask | null;
}

export class DecoderPool {
  private _slots: WorkerSlot[] = [];
  private _queue: DecodeTask[] = [];
  private _inFlightFrames: Set<number> = new Set();
  private _workerBlobUrl: string | null = null;
  private _onFrameDecoded: (frame: DecodedFrame) => void;
  private _onFrameError: (frame: number, error: string) => void;
  private _isTerminated = false;

  constructor(
    poolSize = 3,
    onFrameDecoded: (frame: DecodedFrame) => void = () => {},
    onFrameError: (frame: number, error: string) => void = () => {},
  ) {
    this._onFrameDecoded = onFrameDecoded;
    this._onFrameError = onFrameError;

    const count = Math.max(1, Math.min(4, poolSize));

    if (
      typeof Worker !== 'undefined' &&
      typeof Blob !== 'undefined' &&
      typeof URL !== 'undefined'
    ) {
      try {
        const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
        this._workerBlobUrl = URL.createObjectURL(blob);

        for (let i = 0; i < count; i++) {
          const w = new Worker(this._workerBlobUrl);
          const slot: WorkerSlot = { worker: w, currentTask: null };

          w.onmessage = (e: MessageEvent) => {
            const data = e.data;
            this._handleWorkerMessage(slot, data);
          };

          w.onerror = (err) => {
            if (slot.currentTask) {
              const f = slot.currentTask.frame;
              this._inFlightFrames.delete(f);
              slot.currentTask = null;
              this._onFrameError(f, String(err));
            }
            this._dispatchNext();
          };

          this._slots.push(slot);
        }
      } catch {
        // Fallback if worker construction fails
      }
    }
  }

  public isInFlight(frame: number): boolean {
    return this._inFlightFrames.has(frame);
  }

  public get inFlightCount(): number {
    return this._inFlightFrames.size;
  }

  public enqueue(task: DecodeTask): void {
    if (this._isTerminated) return;
    if (this._inFlightFrames.has(task.frame)) return;

    // Remove any existing queued task for this frame
    this._queue = this._queue.filter((t) => t.frame !== task.frame);

    // Insert task sorted by priority descending
    const idx = this._queue.findIndex((t) => t.priority < task.priority);
    if (idx === -1) {
      this._queue.push(task);
    } else {
      this._queue.splice(idx, 0, task);
    }

    this._dispatchNext();
  }

  public cancelStale(validFrames: Set<number>): void {
    this._queue = this._queue.filter((t) => validFrames.has(t.frame));
  }

  public clearQueue(): void {
    this._queue = [];
  }

  private _dispatchNext(): void {
    if (this._isTerminated || this._queue.length === 0) return;

    const idleSlot = this._slots.find((s) => s.worker && s.currentTask === null);
    if (!idleSlot || !idleSlot.worker) return;

    const task = this._queue.shift();
    if (!task) return;

    idleSlot.currentTask = task;
    this._inFlightFrames.add(task.frame);

    idleSlot.worker.postMessage({
      id: task.id,
      frame: task.frame,
      url: task.url,
      targetWidth: task.targetWidth,
      targetHeight: task.targetHeight,
    });
  }

  private _handleWorkerMessage(
    slot: WorkerSlot,
    data: {
      id: string;
      frame: number;
      bitmap?: ImageBitmap;
      width?: number;
      height?: number;
      byteSize?: number;
      decodeMs?: number;
      success: boolean;
      error?: string;
    },
  ): void {
    const task = slot.currentTask;
    slot.currentTask = null;

    if (task) {
      this._inFlightFrames.delete(task.frame);
    }

    if (data.success && data.bitmap && data.width && data.height) {
      this._onFrameDecoded({
        frame: data.frame,
        bitmap: data.bitmap,
        width: data.width,
        height: data.height,
        byteSize: data.byteSize || data.width * data.height * 4,
        decodeMs: data.decodeMs || 0,
      });
    } else {
      this._onFrameError(data.frame, data.error || 'Decode failed');
    }

    this._dispatchNext();
  }

  public terminate(): void {
    this._isTerminated = true;
    this._queue = [];
    this._inFlightFrames.clear();

    for (const slot of this._slots) {
      if (slot.worker) {
        slot.worker.terminate();
        slot.worker = null;
      }
    }
    this._slots = [];

    if (this._workerBlobUrl && typeof URL !== 'undefined') {
      try {
        URL.revokeObjectURL(this._workerBlobUrl);
      } catch {}
      this._workerBlobUrl = null;
    }
  }
}
