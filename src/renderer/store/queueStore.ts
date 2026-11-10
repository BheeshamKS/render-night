import type { BlenderInstallation } from '../../core/blender/discovery';
import type { QueueEngineJob, QueueState } from '../../core/queue/queue-engine';
import {
  isFormatVideo,
  resolveFrameRange,
  validateRangeForFormat,
} from '../../core/ranges/frame-range';
import type { GpuStatus } from '../../core/render/gpu-monitor';
import { previewTokens } from '../../core/render/token-expander';
import type { InspectOutput, InspectScene } from '../../core/schemas/inspect';
import type { CrashPolicy } from '../../core/schemas/override';
import type { FailedFrame, FrameRangeConfig } from '../../core/schemas/queue-state';
import type { DeviceReport, OverridesReport } from '../../core/schemas/runner-event';

import { create } from 'zustand';

export type JobStatus = 'Queued' | 'Inspecting' | 'Rendering' | 'Completed' | 'Failed' | 'Skipped';

export interface JobLogEntry {
  line: string;
  stream: 'stdout' | 'stderr';
  isError: boolean;
  timestamp: number;
}

export interface QueueJob {
  id: string;
  filePath: string;
  fileName: string;
  project: string;
  enabled: boolean;
  status: JobStatus;
  savedWithVersion?: string;
  blenderOverrideId?: string;
  selectedScene: string;
  selectedCamera: string;
  scenes: InspectScene[];
  availableCameras: string[];
  outputPathPattern: string;
  outputPreview: string;
  inspectData?: InspectOutput;
  inspectError?: string;
  inspectStderrTail?: string;
  deviceReport?: DeviceReport;
  overridesReport?: OverridesReport;
  logs: JobLogEntry[];
  completedFrames?: number;
  totalFrames?: number;
  error?: string;
  isVideo?: boolean;

  // Frame Range & Crash Recovery
  rangeConfig: FrameRangeConfig;
  customRangeLiveCount?: number;
  customRangeError?: string;
  videoRuleError?: string;
  renderMissingOnly?: boolean;
  crashPolicy?: CrashPolicy;
  failedFrames: FailedFrame[];
}

export interface MonitorStats {
  currentFrame: number | null;
  totalFrames: number | null;
  sampleCurrent: number | null;
  sampleTotal: number | null;
  elapsedSeconds: number;
  etaSeconds: number | null;
  peakMemory: string | null;
  lastThumbnailPath: string | null;
  isExr: boolean;
  overallProgress: number;
}

interface QueueStoreState {
  jobs: QueueJob[];
  blenders: BlenderInstallation[];
  selectedBlenderId: string | null;
  isolatedMode: boolean;
  autoExec: boolean;
  isDraggingOver: boolean;
  logs: string[];
  queueState: QueueState;
  activeJobId: string | null;
  gpuStatus: GpuStatus | null;
  monitorStats: MonitorStats;

  // Actions
  loadBlenders: () => Promise<void>;
  setSelectedBlenderId: (id: string) => void;
  setIsolatedMode: (enabled: boolean) => void;
  setAutoExec: (enabled: boolean) => void;
  setIsDraggingOver: (val: boolean) => void;
  addFiles: (filePaths: string[]) => Promise<void>;
  removeJob: (id: string) => void;
  updateJob: (id: string, updates: Partial<QueueJob>) => void;
  setJobRangeConfig: (id: string, config: FrameRangeConfig) => void;
  setRenderMissingOnly: (id: string, enabled: boolean) => void;
  setJobCrashPolicy: (id: string, policy: Partial<CrashPolicy>) => void;
  retryFailedFrames: (id: string) => void;
  moveJob: (id: string, direction: 'up' | 'down') => void;
  reorderJobs: (fromIndex: number, toIndex: number) => void;
  addLog: (msg: string) => void;
  clearLogs: () => void;
  startQueue: () => Promise<void>;
  pauseQueue: () => Promise<void>;
  resumeQueue: () => Promise<void>;
  stopQueue: () => Promise<void>;
  initIpcListeners: () => () => void;
}

function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

function getProjectName(fileName: string): string {
  return fileName.replace(/\.blend$/i, '');
}

function computePreview(pattern: string, project: string, scene: string, camera: string): string {
  return previewTokens(pattern, { project, scene, camera });
}

function computeJobRangeInfo(
  job: Partial<QueueJob>,
  sceneName?: string,
): {
  rangeConfig: FrameRangeConfig;
  liveCount: number;
  isVideo: boolean;
  customError?: string;
  videoRuleError?: string;
} {
  const currentSceneName = sceneName || job.selectedScene || 'Scene';
  const scene = job.scenes?.find((s) => s.name === currentSceneName);
  const sceneDefaults = {
    start: scene?.frameStart ?? 1,
    end: scene?.frameEnd ?? 250,
    step: scene?.frameStep ?? 1,
  };
  const config = job.rangeConfig || { mode: 'scene_default' };
  const resolved = resolveFrameRange(config, sceneDefaults);

  const rawFormat = scene?.imageSettings?.fileFormat?.value;
  const formatVal = typeof rawFormat === 'string' ? rawFormat : undefined;
  const isVideo = isFormatVideo(formatVal);
  const validation = validateRangeForFormat(resolved, formatVal);

  return {
    rangeConfig: config,
    liveCount: resolved.totalCount,
    isVideo,
    customError: resolved.error,
    videoRuleError: validation.valid ? undefined : validation.reason,
  };
}

let timerInterval: NodeJS.Timeout | null = null;

export const useQueueStore = create<QueueStoreState>((set, get) => ({
  jobs: [],
  blenders: [],
  selectedBlenderId: null,
  isolatedMode: false,
  autoExec: false,
  isDraggingOver: false,
  logs: ['[System] Render Night ready. Waiting for jobs...'],
  queueState: 'idle',
  activeJobId: null,
  gpuStatus: null,
  monitorStats: {
    currentFrame: null,
    totalFrames: null,
    sampleCurrent: null,
    sampleTotal: null,
    elapsedSeconds: 0,
    etaSeconds: null,
    peakMemory: null,
    lastThumbnailPath: null,
    isExr: false,
    overallProgress: 0,
  },

  addLog: (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    set((state) => ({ logs: [...state.logs, `[${timestamp}] ${msg}`] }));
  },

  clearLogs: () => set({ logs: [] }),

  loadBlenders: async () => {
    try {
      get().addLog('Probing system for Blender installations...');
      if (typeof window !== 'undefined' && window.rnApi) {
        const blenders = await window.rnApi.discoverBlenders();
        set({
          blenders,
          selectedBlenderId: blenders.length > 0 ? blenders[0].id : null,
        });
        if (blenders.length > 0) {
          get().addLog(
            `Found ${blenders.length} Blender instance(s). Default: Blender ${blenders[0].version}`,
          );
        } else {
          get().addLog('Warning: No Blender installations detected on this system.');
        }
      }
    } catch (err) {
      get().addLog(`Error discovering Blender: ${(err as Error).message}`);
    }
  },

  setSelectedBlenderId: (id: string) => {
    set({ selectedBlenderId: id });
    const b = get().blenders.find((item) => item.id === id);
    if (b) {
      get().addLog(`Global Blender set to ${b.version} (${b.displayPath})`);
    }
  },

  setIsolatedMode: (enabled: boolean) => {
    set({ isolatedMode: enabled });
    get().addLog(`Isolated Mode (${enabled ? 'ON (--factory-startup)' : 'OFF'})`);
  },

  setAutoExec: (enabled: boolean) => {
    set({ autoExec: enabled });
    get().addLog(`Auto-exec scripts (${enabled ? 'ON (--enable-autoexec)' : 'OFF'})`);
  },

  setIsDraggingOver: (val: boolean) => set({ isDraggingOver: val }),

  addFiles: async (filePaths: string[]) => {
    const blendFiles = filePaths.filter((p) => p.toLowerCase().endsWith('.blend'));
    if (blendFiles.length === 0) {
      get().addLog('No .blend files found in selection.');
      return;
    }

    get().addLog(`Adding ${blendFiles.length} file(s) to queue...`);

    const newJobs: QueueJob[] = blendFiles.map((filePath) => {
      const fileName = getFileName(filePath);
      const project = getProjectName(fileName);
      const defaultPattern = '//render/{project}/{scene}_{camera}_####.png';
      return {
        id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        filePath,
        fileName,
        project,
        enabled: true,
        status: 'Inspecting',
        selectedScene: 'Scene',
        selectedCamera: '',
        scenes: [],
        availableCameras: [],
        outputPathPattern: defaultPattern,
        outputPreview: computePreview(defaultPattern, project, 'Scene', ''),
        logs: [],
        rangeConfig: { mode: 'scene_default' },
        failedFrames: [],
        renderMissingOnly: false,
      };
    });

    set((state) => ({ jobs: [...state.jobs, ...newJobs] }));

    const blenders = get().blenders;
    const globalBlender = blenders.find((b) => b.id === get().selectedBlenderId) || blenders[0];
    const isolatedMode = get().isolatedMode;
    const autoExec = get().autoExec;

    for (const job of newJobs) {
      try {
        get().addLog(`Inspecting ${job.fileName}...`);
        const executable = globalBlender ? globalBlender.executable : 'blender';

        let inspectData: InspectOutput | undefined;
        if (typeof window !== 'undefined' && window.rnApi) {
          inspectData = await window.rnApi.inspectBlend(job.filePath, executable, {
            isolatedMode,
            autoExec,
          });
        }

        if (inspectData) {
          const scenes = inspectData.scenes || [];
          const activeScene = scenes.find((s) => s.name === inspectData?.activeScene) || scenes[0];
          const sceneName = activeScene?.name || 'Scene';
          const cameras = activeScene?.cameras || [];
          const cameraName = activeScene?.activeCamera || cameras[0] || '';

          let fileRenderPath = '//render/{project}/{scene}_{camera}_####.png';
          const rnaFilepath = activeScene?.render?.filepath?.value;
          if (typeof rnaFilepath === 'string' && rnaFilepath.trim()) {
            fileRenderPath = rnaFilepath.trim();
          }

          const preview = computePreview(fileRenderPath, job.project, sceneName, cameraName);
          const rawFormat = activeScene?.imageSettings?.fileFormat?.value;
          const formatVal = typeof rawFormat === 'string' ? rawFormat : undefined;
          const isVideo = isFormatVideo(formatVal);
          const sceneDefaults = {
            start: activeScene?.frameStart ?? 1,
            end: activeScene?.frameEnd ?? 250,
            step: activeScene?.frameStep ?? 1,
          };
          const resolved = resolveFrameRange({ mode: 'scene_default' }, sceneDefaults);
          const validation = validateRangeForFormat(resolved, formatVal);

          get().updateJob(job.id, {
            status: 'Queued',
            savedWithVersion: inspectData.savedWithVersion,
            scenes,
            selectedScene: sceneName,
            availableCameras: cameras,
            selectedCamera: cameraName,
            outputPathPattern: fileRenderPath,
            outputPreview: preview,
            inspectData,
            isVideo,
            rangeConfig: { mode: 'scene_default' },
            customRangeLiveCount: resolved.totalCount,
            videoRuleError: validation.valid ? undefined : validation.reason,
          });

          get().addLog(
            `Inspection complete for ${job.fileName} (Blender ${inspectData.savedWithVersion}, Scene: ${sceneName})`,
          );
        } else {
          get().updateJob(job.id, {
            status: 'Queued',
            outputPreview: computePreview(
              job.outputPathPattern,
              job.project,
              job.selectedScene,
              job.selectedCamera,
            ),
          });
        }
      } catch (err) {
        const errorMsg = (err as Error).message || 'Inspection failed';
        const stderrTail = (err as { stderrTail?: string }).stderrTail;
        get().updateJob(job.id, {
          status: 'Failed',
          inspectError: errorMsg,
          inspectStderrTail: stderrTail,
        });
        get().addLog(`Failed to inspect ${job.fileName}: ${errorMsg}`);
      }
    }
  },

  removeJob: (id: string) => {
    set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) }));
  },

  updateJob: (id: string, updates: Partial<QueueJob>) => {
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id !== id) return job;
        const merged = { ...job, ...updates };

        if (updates.selectedScene && updates.selectedScene !== job.selectedScene) {
          const currentScene = merged.scenes.find((s) => s.name === updates.selectedScene);
          if (currentScene) {
            merged.availableCameras = currentScene.cameras || [];
            merged.selectedCamera = currentScene.activeCamera || currentScene.cameras[0] || '';
          }
        }

        merged.outputPreview = computePreview(
          merged.outputPathPattern,
          merged.project,
          merged.selectedScene,
          merged.selectedCamera,
        );

        // Recompute frame range count and validate against format
        const rangeInfo = computeJobRangeInfo(merged, merged.selectedScene);
        merged.isVideo = rangeInfo.isVideo;
        merged.customRangeLiveCount = rangeInfo.liveCount;
        merged.customRangeError = rangeInfo.customError;
        merged.videoRuleError = rangeInfo.videoRuleError;

        return merged;
      }),
    }));
  },

  setJobRangeConfig: (id: string, config: FrameRangeConfig) => {
    get().updateJob(id, { rangeConfig: config });
  },

  setRenderMissingOnly: (id: string, enabled: boolean) => {
    get().updateJob(id, { renderMissingOnly: enabled });
  },

  setJobCrashPolicy: (id: string, policy: Partial<CrashPolicy>) => {
    const job = get().jobs.find((j) => j.id === id);
    if (!job) return;
    const current = job.crashPolicy || {
      maxRetries: 2,
      fallbackToCpu: true,
      skipOnFailure: true,
      maxConsecutiveCrashes: 3,
    };
    get().updateJob(id, { crashPolicy: { ...current, ...policy } });
  },

  retryFailedFrames: (id: string) => {
    const job = get().jobs.find((j) => j.id === id);
    if (!job || !job.failedFrames || job.failedFrames.length === 0) return;

    const framesToRetry = Array.from(new Set(job.failedFrames.map((f) => f.frame))).sort(
      (a, b) => a - b,
    );
    const customExpression = framesToRetry.join(', ');

    get().updateJob(id, {
      status: 'Queued',
      error: undefined,
      rangeConfig: {
        mode: 'custom',
        customExpression,
      },
      failedFrames: [],
    });
    get().addLog(
      `Queueing retry of ${framesToRetry.length} failed frame(s) for ${job.fileName} (${customExpression})`,
    );
  },

  moveJob: (id: string, direction: 'up' | 'down') => {
    const { jobs } = get();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= jobs.length) return;

    const newJobs = [...jobs];
    const [moved] = newJobs.splice(idx, 1);
    newJobs.splice(targetIdx, 0, moved);
    set({ jobs: newJobs });
  },

  reorderJobs: (fromIndex: number, toIndex: number) => {
    const { jobs } = get();
    if (fromIndex < 0 || fromIndex >= jobs.length || toIndex < 0 || toIndex >= jobs.length) {
      return;
    }
    const newJobs = [...jobs];
    const [moved] = newJobs.splice(fromIndex, 1);
    newJobs.splice(toIndex, 0, moved);
    set({ jobs: newJobs });
  },

  startQueue: async () => {
    const { jobs, blenders, selectedBlenderId, isolatedMode, autoExec } = get();
    const eligibleJobs = jobs.filter((j) => j.enabled && j.status !== 'Completed');
    if (eligibleJobs.length === 0) {
      get().addLog('No eligible enabled jobs to start.');
      return;
    }

    // Enforce video rule validation
    const invalidJob = eligibleJobs.find((j) => j.videoRuleError);
    if (invalidJob) {
      get().addLog(
        `Cannot start queue: Job "${invalidJob.fileName}" has an invalid frame range for video format (${invalidJob.videoRuleError})`,
      );
      return;
    }

    const defaultBlender = blenders.find((b) => b.id === selectedBlenderId) || blenders[0];

    const engineJobs: QueueEngineJob[] = eligibleJobs.map((job) => {
      const bInst = job.blenderOverrideId
        ? blenders.find((b) => b.id === job.blenderOverrideId) || defaultBlender
        : defaultBlender;
      const executable = bInst ? bInst.executable : 'blender';

      const scene = job.scenes.find((s) => s.name === job.selectedScene);
      const sceneDefaults = {
        start: scene?.frameStart ?? 1,
        end: scene?.frameEnd ?? 250,
        step: scene?.frameStep ?? 1,
      };

      const resolved = resolveFrameRange(
        job.rangeConfig || { mode: 'scene_default' },
        sceneDefaults,
      );
      const frames = resolved.frames.length > 0 ? resolved.frames : [sceneDefaults.start];

      // Compute directory from pattern
      const outputPattern = job.outputPathPattern;
      const baseDir = job.filePath.replace(/[/\\][^/\\]+$/, '');
      const outputDir = outputPattern.startsWith('//')
        ? outputPattern.replace(/^\/\//, `${baseDir}/`).replace(/[/\\][^/\\]+$/, '')
        : outputPattern.replace(/[/\\][^/\\]+$/, '');

      return {
        id: job.id,
        blendPath: job.filePath,
        executable,
        scene: job.selectedScene,
        camera: job.selectedCamera || undefined,
        frames,
        outputPattern: job.outputPreview,
        outputDir,
        isolatedMode,
        autoExec,
        isVideo: job.isVideo,
        renderMissingOnly: job.renderMissingOnly,
        crashPolicy: job.crashPolicy,
      };
    });

    get().addLog(`Starting queue execution with ${engineJobs.length} job(s)...`);

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (get().queueState === 'running') {
        set((state) => ({
          monitorStats: {
            ...state.monitorStats,
            elapsedSeconds: state.monitorStats.elapsedSeconds + 1,
          },
        }));
      }
    }, 1000);

    if (typeof window !== 'undefined' && window.rnApi) {
      await window.rnApi.startQueue(engineJobs);
    }
  },

  pauseQueue: async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      await window.rnApi.pauseQueue();
      get().addLog('Queue paused.');
    }
  },

  resumeQueue: async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      await window.rnApi.resumeQueue();
      get().addLog('Queue resumed.');
    }
  },

  stopQueue: async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      await window.rnApi.stopQueue();
      get().addLog('Queue stopped.');
    }
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  },

  initIpcListeners: () => {
    if (typeof window === 'undefined' || !window.rnApi) {
      return () => {};
    }

    const unsub = window.rnApi.onQueueEvent((event) => {
      switch (event.type) {
        case 'queue:state':
          set({
            queueState: event.state,
            activeJobId: event.activeJobId || null,
          });
          if (event.state === 'idle' && timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
          }
          break;

        case 'job:start': {
          get().updateJob(event.jobId, {
            status: 'Rendering',
            totalFrames: event.totalFrames,
          });
          set((state) => ({
            monitorStats: {
              ...state.monitorStats,
              totalFrames: event.totalFrames,
            },
          }));
          break;
        }

        case 'job:progress': {
          set((state) => ({
            monitorStats: {
              ...state.monitorStats,
              sampleCurrent: event.sampleCurrent ?? state.monitorStats.sampleCurrent,
              sampleTotal: event.sampleTotal ?? state.monitorStats.sampleTotal,
              peakMemory: event.peakMemory ?? state.monitorStats.peakMemory,
              etaSeconds:
                event.etaSeconds !== undefined ? event.etaSeconds : state.monitorStats.etaSeconds,
            },
          }));
          break;
        }

        case 'frame:start': {
          set((state) => ({
            monitorStats: {
              ...state.monitorStats,
              currentFrame: event.frame,
              totalFrames: event.totalFrames,
              overallProgress:
                event.totalFrames > 0
                  ? Math.round((event.frameIndex / event.totalFrames) * 100)
                  : 0,
            },
          }));
          break;
        }

        case 'frame:done': {
          const isExr = event.saved.toLowerCase().endsWith('.exr');
          set((state) => ({
            monitorStats: {
              ...state.monitorStats,
              currentFrame: event.frame,
              peakMemory: event.peakMemory ?? state.monitorStats.peakMemory,
              lastThumbnailPath: event.saved,
              isExr,
              etaSeconds:
                event.etaSeconds !== undefined ? event.etaSeconds : state.monitorStats.etaSeconds,
            },
          }));
          const job = get().jobs.find((j) => j.id === event.jobId);
          if (job) {
            const completed = (job.completedFrames || 0) + 1;
            get().updateJob(event.jobId, { completedFrames: completed });
          }
          break;
        }

        case 'frame:failed': {
          const job = get().jobs.find((j) => j.id === event.jobId);
          if (job) {
            const existing = job.failedFrames || [];
            if (!existing.some((f) => f.frame === event.frame)) {
              get().updateJob(event.jobId, {
                failedFrames: [
                  ...existing,
                  {
                    frame: event.frame,
                    error: event.error,
                    stderrTail: event.stderrTail,
                    timestamp: Date.now(),
                    attemptCount: 1,
                  },
                ],
              });
            }
          }
          break;
        }

        case 'device:report': {
          get().updateJob(event.jobId, { deviceReport: event.report });
          break;
        }

        case 'overrides:report': {
          get().updateJob(event.jobId, { overridesReport: event.report });
          break;
        }

        case 'log': {
          const job = get().jobs.find((j) => j.id === event.jobId);
          if (job) {
            const entry: JobLogEntry = {
              line: event.line,
              stream: event.stream,
              isError: event.isErrorKeyword,
              timestamp: event.timestamp,
            };
            get().updateJob(event.jobId, {
              logs: [...(job.logs || []).slice(-300), entry],
            });
          }
          break;
        }

        case 'job:done': {
          const job = get().jobs.find((j) => j.id === event.jobId);
          const failures =
            event.failedFramesList && event.failedFramesList.length > 0
              ? event.failedFramesList
              : job?.failedFrames || [];
          const hasFailures = failures.length > 0;

          get().updateJob(event.jobId, {
            status: hasFailures ? 'Failed' : 'Completed',
            failedFrames: failures,
          });
          get().addLog(
            `Job ${event.jobId} ${
              hasFailures
                ? `finished with ${failures.length} failed frame(s)`
                : 'completed successfully.'
            }`,
          );
          break;
        }

        case 'job:failed': {
          const job = get().jobs.find((j) => j.id === event.jobId);
          const failures =
            event.failedFrames && event.failedFrames.length > 0
              ? event.failedFrames
              : job?.failedFrames || [];

          get().updateJob(event.jobId, {
            status: 'Failed',
            error: event.error,
            failedFrames: failures,
          });
          get().addLog(`Job ${event.jobId} failed: ${event.error}`);
          break;
        }
      }
    });

    return unsub;
  },
}));
