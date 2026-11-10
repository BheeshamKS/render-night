import type { BlenderInstallation } from '../core/blender/discovery';
import type { BlendHeaderInfo } from '../core/blender/header-reader';
import type { InspectOptions } from '../core/blender/inspector';
import type { HistoryFilter } from '../core/history';
import type { ImportPresetsResult, SavePresetInput } from '../core/presets';
import type { QueueEngineJob, QueueState } from '../core/queue/queue-engine';
import type { GpuStatus } from '../core/render/gpu-monitor';
import type { HistoryEntry } from '../core/schemas/history';
import type { InspectOutput } from '../core/schemas/inspect';
import type { Preset } from '../core/schemas/preset';
import type { FailedFrame, PersistedQueueState, PostAction } from '../core/schemas/queue-state';
import type { DeviceReport, OverridesReport } from '../core/schemas/runner-event';

export type QueueIpcEvent =
  | { type: 'queue:state'; state: QueueState; activeJobId?: string }
  | {
      type: 'job:start';
      jobId: string;
      totalFrames: number;
      frames: number[];
      scene?: string;
      camera?: string;
      engine?: string;
    }
  | {
      type: 'job:progress';
      jobId: string;
      frame?: number;
      sampleCurrent?: number;
      sampleTotal?: number;
      memory?: string;
      peakMemory?: string;
      time?: string;
      remaining?: string;
      etaSeconds?: number;
    }
  | { type: 'frame:start'; jobId: string; frame: number; frameIndex: number; totalFrames: number }
  | {
      type: 'frame:done';
      jobId: string;
      frame: number;
      saved: string;
      timeSeconds?: number;
      peakMemory?: string;
      etaSeconds?: number;
    }
  | {
      type: 'frame:failed';
      jobId: string;
      frame: number;
      error: string;
      stderrTail?: string;
    }
  | { type: 'device:report'; jobId: string; report: DeviceReport }
  | { type: 'overrides:report'; jobId: string; report: OverridesReport }
  | {
      type: 'log';
      jobId: string;
      stream: 'stdout' | 'stderr';
      line: string;
      isErrorKeyword: boolean;
      timestamp: number;
    }
  | {
      type: 'job:done';
      jobId: string;
      completedFrames: number;
      failedFrames: number;
      durationSeconds?: number;
      failedFramesList?: FailedFrame[];
      historyEntry?: HistoryEntry;
    }
  | {
      type: 'job:failed';
      jobId: string;
      error: string;
      stderrTail?: string;
      failedFrames?: FailedFrame[];
      historyEntry?: HistoryEntry;
    }
  | {
      type: 'job:history';
      entry: HistoryEntry;
    };

export interface RenderNightApi {
  platform: NodeJS.Platform;
  discoverBlenders(customPaths?: string[]): Promise<BlenderInstallation[]>;
  validateCustomBlender(pathOrCommand: string | string[]): Promise<BlenderInstallation>;
  inspectBlend(
    blendPath: string,
    blenderExecutable: string | string[],
    options?: InspectOptions,
  ): Promise<InspectOutput>;
  readHeader(blendPath: string): Promise<BlendHeaderInfo>;
  openInBlender(executable: string | string[], filePath: string): Promise<boolean>;
  selectBlendFiles(): Promise<string[]>;
  selectDirectory(defaultPath?: string): Promise<string | null>;
  openPath(targetPath: string): Promise<void>;

  // Queue controls & events
  startQueue(jobs: QueueEngineJob[]): Promise<void>;
  pauseQueue(): Promise<void>;
  resumeQueue(): Promise<void>;
  stopQueue(): Promise<void>;
  getQueueState(): Promise<{ state: QueueState; activeJobId?: string }>;
  sampleGpu(): Promise<GpuStatus>;
  openLogsFolder(jobId?: string): Promise<void>;
  onQueueEvent(listener: (event: QueueIpcEvent) => void): () => void;

  // Persistence & Crash Restore
  checkUncleanShutdown(): Promise<{ isUnclean: boolean; orphanedPids: number[] }>;
  loadSavedQueue(): Promise<PersistedQueueState | null>;
  saveQueue(state: PersistedQueueState): Promise<void>;
  clearUncleanShutdownLock(): Promise<void>;

  // Post Actions & OS Power
  executePostAction(action: PostAction): Promise<{ success: boolean; error?: string }>;

  // Sound
  getSoundPath(): Promise<string>;

  // History
  getHistory(filter?: HistoryFilter): Promise<HistoryEntry[]>;
  deleteHistoryEntry(id: string): Promise<boolean>;
  clearHistory(): Promise<void>;

  // Scheduling & Sleep Blocker
  acquireSleepBlock(): Promise<number>;
  releaseSleepBlock(id: number): Promise<void>;

  // Presets
  loadPresets(): Promise<Preset[]>;
  savePreset(input: SavePresetInput): Promise<Preset>;
  renamePreset(id: string, newName: string): Promise<Preset | null>;
  deletePreset(id: string): Promise<boolean>;
  exportPresets(ids?: string[]): Promise<string>;
  importPresets(jsonStr: string): Promise<ImportPresetsResult>;
}

declare global {
  interface Window {
    rnApi: RenderNightApi;
  }
}
