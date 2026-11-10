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
import type {
  FailedFrame,
  FrameRangeConfig,
  Job,
  PersistedQueueState,
  PostAction,
} from '../../core/schemas/queue-state';
import type { DeviceReport, OverridesReport } from '../../core/schemas/runner-event';
import { playTodungSound } from '../utils/soundPlayer';

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

export interface SoundSettingsState {
  volume: number;
  isMuted: boolean;
  playOnFailure: boolean;
}

export interface ScheduleConfigState {
  enabled: boolean;
  time: string;
  blockSleep: boolean;
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

  // Persistence & Post-Actions & Finish Sound & History & Scheduling
  soundSettings: SoundSettingsState;
  postAction: PostAction;
  postActionArmed: boolean;
  postActionCountdown: number | null;
  isRestoredSession: boolean;
  scheduleConfig: ScheduleConfigState;
  activeSleepBlockId: number | null;

  showCrashRestoreBanner: boolean;
  showPostActionModal: boolean;
  showSoundModal: boolean;
  showHistoryModal: boolean;
  showScheduleModal: boolean;

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

  // Persistence, Sound & Modal controls
  setPostAction: (action: PostAction) => void;
  startPostActionCountdown: () => void;
  cancelPostActionCountdown: () => void;
  executePostActionImmediately: () => Promise<void>;
  setSoundSettings: (settings: Partial<SoundSettingsState>) => void;
  setShowSoundModal: (val: boolean) => void;
  setShowHistoryModal: (val: boolean) => void;
  setShowScheduleModal: (val: boolean) => void;
  setSchedule: (config: ScheduleConfigState) => Promise<void>;
  cancelSchedule: () => Promise<void>;
  resumeFromCrash: () => Promise<void>;
  dismissCrashBanner: () => Promise<void>;
  autoSaveState: () => Promise<void>;
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

function toPersistedJob(qj: QueueJob): Job {
  const statusMap: Record<JobStatus, Job['status']> = {
    Queued: 'pending',
    Inspecting: 'pending',
    Rendering: 'active',
    Completed: 'done',
    Failed: 'failed',
    Skipped: 'canceled',
  };
  const scene = qj.scenes?.find((s) => s.name === qj.selectedScene);
  return {
    id: qj.id,
    blendPath: qj.filePath,
    name: qj.fileName,
    status: statusMap[qj.status] || 'pending',
    range: {
      start: scene?.frameStart ?? 1,
      end: scene?.frameEnd ?? 250,
      step: scene?.frameStep ?? 1,
    },
    rangeConfig: qj.rangeConfig,
    crashPolicy: qj.crashPolicy,
    renderMissingOnly: qj.renderMissingOnly ?? false,
    failedFrames: qj.failedFrames || [],
    overrides: {},
    presets: [],
    outputDir: qj.outputPathPattern,
    outputPattern: qj.outputPathPattern,
    device: qj.deviceReport?.mode,
    engine: qj.deviceReport?.engine,
    createdAt: Date.now(),
    error: qj.error,
    progress:
      qj.completedFrames && qj.totalFrames
        ? Math.round((qj.completedFrames / qj.totalFrames) * 100)
        : 0,
    inspect: qj.inspectData,
  };
}

function fromPersistedJob(pj: Job): QueueJob {
  const uiStatusMap: Record<Job['status'], JobStatus> = {
    pending: 'Queued',
    active: 'Queued',
    paused: 'Queued',
    done: 'Completed',
    failed: 'Failed',
    canceled: 'Skipped',
  };
  const inspectData = pj.inspect as InspectOutput | undefined;
  const scenes = inspectData?.scenes || [];
  const activeScene = scenes.find((s) => s.name === inspectData?.activeScene) || scenes[0];
  const sceneName = activeScene?.name || 'Scene';
  const cameras = activeScene?.cameras || [];
  const cameraName = activeScene?.activeCamera || cameras[0] || '';
  const pattern = pj.outputPattern || '//render/{project}/{scene}_{camera}_####.png';
  const project = getProjectName(pj.name);

  return {
    id: pj.id,
    filePath: pj.blendPath,
    fileName: pj.name,
    project,
    enabled: true,
    status: uiStatusMap[pj.status] || 'Queued',
    selectedScene: sceneName,
    selectedCamera: cameraName,
    scenes,
    availableCameras: cameras,
    outputPathPattern: pattern,
    outputPreview: computePreview(pattern, project, sceneName, cameraName),
    inspectData,
    logs: [],
    rangeConfig: pj.rangeConfig || { mode: 'scene_default' },
    renderMissingOnly: pj.renderMissingOnly,
    crashPolicy: pj.crashPolicy,
    failedFrames: pj.failedFrames || [],
  };
}

let timerInterval: NodeJS.Timeout | null = null;
let postActionInterval: NodeJS.Timeout | null = null;
let scheduleCheckInterval: NodeJS.Timeout | null = null;

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

  soundSettings: {
    volume: 100,
    isMuted: false,
    playOnFailure: false,
  },
  postAction: 'none',
  postActionArmed: false,
  postActionCountdown: null,
  isRestoredSession: false,
  scheduleConfig: {
    enabled: false,
    time: '23:00',
    blockSleep: true,
  },
  activeSleepBlockId: null,

  showCrashRestoreBanner: false,
  showPostActionModal: false,
  showSoundModal: false,
  showHistoryModal: false,
  showScheduleModal: false,

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
    get().autoSaveState();

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
    get().autoSaveState();
  },

  removeJob: (id: string) => {
    set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) }));
    get().autoSaveState();
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
    get().autoSaveState();
  },

  setJobRangeConfig: (id: string, config: FrameRangeConfig) => {
    get().updateJob(id, { rangeConfig: config });
  },

  setRenderMissingOnly: (id: string, enabled: boolean) => {
    get().updateJob(id, { renderMissingOnly: enabled });
  },

  setJobCrashPolicy: (id: string, policy: Partial<CrashPolicy>) => {
    const job = get().jobs.find((j) => j.id === id);
    if (job) {
      const mergedPolicy: CrashPolicy = {
        maxRetries: policy.maxRetries ?? job.crashPolicy?.maxRetries ?? 2,
        fallbackToCpu: policy.fallbackToCpu ?? job.crashPolicy?.fallbackToCpu ?? true,
        skipOnFailure: policy.skipOnFailure ?? job.crashPolicy?.skipOnFailure ?? true,
        maxConsecutiveCrashes:
          policy.maxConsecutiveCrashes ?? job.crashPolicy?.maxConsecutiveCrashes ?? 3,
      };
      get().updateJob(id, { crashPolicy: mergedPolicy });
    }
  },

  retryFailedFrames: (id: string) => {
    const job = get().jobs.find((j) => j.id === id);
    if (!job || !job.failedFrames || job.failedFrames.length === 0) return;

    const framesToRetry = job.failedFrames.map((f) => f.frame).sort((a, b) => a - b);
    const customExpression = framesToRetry.join(', ');

    get().updateJob(id, {
      status: 'Queued',
      rangeConfig: {
        mode: 'custom',
        customExpression,
      },
      failedFrames: [],
    });

    get().addLog(
      `Job ${job.fileName}: Re-queued ${framesToRetry.length} failed frame(s): ${customExpression}`,
    );
  },

  moveJob: (id: string, direction: 'up' | 'down') => {
    const jobs = [...get().jobs];
    const index = jobs.findIndex((j) => j.id === id);
    if (index === -1) return;
    if (direction === 'up' && index > 0) {
      const temp = jobs[index - 1];
      jobs[index - 1] = jobs[index];
      jobs[index] = temp;
      set({ jobs });
      get().autoSaveState();
    } else if (direction === 'down' && index < jobs.length - 1) {
      const temp = jobs[index + 1];
      jobs[index + 1] = jobs[index];
      jobs[index] = temp;
      set({ jobs });
      get().autoSaveState();
    }
  },

  reorderJobs: (fromIndex: number, toIndex: number) => {
    const jobs = [...get().jobs];
    if (
      fromIndex < 0 ||
      fromIndex >= jobs.length ||
      toIndex < 0 ||
      toIndex >= jobs.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const [movedJob] = jobs.splice(fromIndex, 1);
    jobs.splice(toIndex, 0, movedJob);
    set({ jobs });
    get().autoSaveState();
  },

  startQueue: async () => {
    const jobs = get().jobs.filter((j) => j.enabled && j.status !== 'Completed');
    if (jobs.length === 0) {
      get().addLog('No eligible jobs to start.');
      return;
    }

    // Cancel any active schedule since queue is starting now
    if (get().scheduleConfig.enabled) {
      get().cancelSchedule();
    }

    // HARD SAFETY RULE: When queue is manually started in a live session, post-action is ARMED
    set({ postActionArmed: true });

    const blenders = get().blenders;
    const globalBlender = blenders.find((b) => b.id === get().selectedBlenderId) || blenders[0];
    const isolatedMode = get().isolatedMode;
    const autoExec = get().autoExec;

    const engineJobs: QueueEngineJob[] = jobs.map((job) => {
      const b = job.blenderOverrideId
        ? blenders.find((item) => item.id === job.blenderOverrideId) || globalBlender
        : globalBlender;
      const executable = b ? b.executable : 'blender';

      const scene = job.scenes.find((s) => s.name === job.selectedScene);
      const sceneDefaults = {
        start: scene?.frameStart ?? 1,
        end: scene?.frameEnd ?? 250,
        step: scene?.frameStep ?? 1,
      };

      const resolved = resolveFrameRange(job.rangeConfig, sceneDefaults);
      const frames = resolved.frames;

      const outputPattern = job.outputPreview;
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

  setPostAction: (action: PostAction) => {
    set({ postAction: action });
    get().autoSaveState();
  },

  startPostActionCountdown: () => {
    if (postActionInterval) clearInterval(postActionInterval);
    set({ showPostActionModal: true, postActionCountdown: 60 });

    postActionInterval = setInterval(() => {
      const current = get().postActionCountdown;
      if (current === null || current <= 1) {
        if (postActionInterval) {
          clearInterval(postActionInterval);
          postActionInterval = null;
        }
        set({ postActionCountdown: 0, showPostActionModal: false });
        get().executePostActionImmediately();
      } else {
        set({ postActionCountdown: current - 1 });
      }
    }, 1000);
  },

  cancelPostActionCountdown: () => {
    if (postActionInterval) {
      clearInterval(postActionInterval);
      postActionInterval = null;
    }
    set({ showPostActionModal: false, postActionCountdown: null, postActionArmed: false });
    get().addLog('Post-queue action countdown cancelled by user.');
  },

  executePostActionImmediately: async () => {
    if (postActionInterval) {
      clearInterval(postActionInterval);
      postActionInterval = null;
    }
    const action = get().postAction;
    set({ showPostActionModal: false, postActionCountdown: null, postActionArmed: false });
    if (action !== 'none' && typeof window !== 'undefined' && window.rnApi) {
      get().addLog(`Executing post-queue action: ${action}`);
      await window.rnApi.executePostAction(action);
    }
  },

  setSoundSettings: (updates: Partial<SoundSettingsState>) => {
    set((state) => ({ soundSettings: { ...state.soundSettings, ...updates } }));
    get().autoSaveState();
  },

  setShowSoundModal: (val: boolean) => set({ showSoundModal: val }),
  setShowHistoryModal: (val: boolean) => set({ showHistoryModal: val }),
  setShowScheduleModal: (val: boolean) => set({ showScheduleModal: val }),

  setSchedule: async (config: ScheduleConfigState) => {
    if (config.enabled && config.blockSleep && typeof window !== 'undefined' && window.rnApi) {
      const blockId = await window.rnApi.acquireSleepBlock();
      set({ activeSleepBlockId: blockId });
    } else if (
      !config.enabled &&
      get().activeSleepBlockId !== null &&
      typeof window !== 'undefined' &&
      window.rnApi
    ) {
      await window.rnApi.releaseSleepBlock(get().activeSleepBlockId!);
      set({ activeSleepBlockId: null });
    }
    set({ scheduleConfig: config });
    get().addLog(`One-shot schedule set: start queue at ${config.time}`);
    get().autoSaveState();
  },

  cancelSchedule: async () => {
    if (get().activeSleepBlockId !== null && typeof window !== 'undefined' && window.rnApi) {
      await window.rnApi.releaseSleepBlock(get().activeSleepBlockId!);
    }
    set({
      scheduleConfig: { enabled: false, time: get().scheduleConfig.time, blockSleep: false },
      activeSleepBlockId: null,
    });
    get().addLog('Queue schedule cancelled.');
    get().autoSaveState();
  },

  resumeFromCrash: async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      const saved = await window.rnApi.loadSavedQueue();
      if (saved && saved.jobs && saved.jobs.length > 0) {
        const restoredJobs = saved.jobs.map(fromPersistedJob);
        const targetJob = restoredJobs.find((j) => j.status === 'Queued');
        if (targetJob) {
          targetJob.renderMissingOnly = true;
        }
        set({
          jobs: restoredJobs,
          showCrashRestoreBanner: false,
          isRestoredSession: true,
          postAction: saved.settings?.postAction || 'none',
          postActionArmed: false, // HARD SAFETY RULE: disarmed on restore!
        });
        get().addLog('Resumed queue from previous session. Post-queue power action disarmed.');
      } else {
        set({ showCrashRestoreBanner: false });
      }
      await window.rnApi.clearUncleanShutdownLock();
    }
  },

  dismissCrashBanner: async () => {
    set({ showCrashRestoreBanner: false });
    if (typeof window !== 'undefined' && window.rnApi) {
      await window.rnApi.clearUncleanShutdownLock();
    }
  },

  autoSaveState: async () => {
    if (typeof window !== 'undefined' && typeof window.rnApi?.saveQueue === 'function') {
      const { jobs, postAction, soundSettings, scheduleConfig } = get();
      const persistedState: PersistedQueueState = {
        version: 1,
        jobs: jobs.map(toPersistedJob),
        settings: {
          concurrentJobs: 1,
          stopOnFailure: false,
          closeAppOnCompletion: false,
          closeAppOnCompletionMode: 'last',
          soundOnCompletion: !soundSettings.isMuted,
          soundOnFailure: soundSettings.playOnFailure,
          powerMode: 'none',
          pauseOnBattery: false,
          resumeOnAc: false,
          maxConcurrentFrames: 1,
          postAction,
          sound: {
            enabled: !soundSettings.isMuted,
            volume: soundSettings.volume,
            playOnFailure: soundSettings.playOnFailure,
          },
          schedule: scheduleConfig.enabled
            ? {
                enabled: true,
                targetTime: scheduleConfig.time,
                blockSleepWhileWaiting: scheduleConfig.blockSleep,
              }
            : undefined,
        },
      };
      await window.rnApi.saveQueue(persistedState).catch(() => {});
    }
  },

  initIpcListeners: () => {
    if (typeof window === 'undefined' || !window.rnApi) {
      return () => {};
    }

    // Check unclean shutdown on startup
    window.rnApi
      .checkUncleanShutdown()
      .then(({ isUnclean }) => {
        if (isUnclean) {
          set({ showCrashRestoreBanner: true });
        }
      })
      .catch(() => {});

    // Scheduler tick check
    if (scheduleCheckInterval) clearInterval(scheduleCheckInterval);
    scheduleCheckInterval = setInterval(() => {
      const { scheduleConfig, queueState, startQueue } = get();
      if (scheduleConfig.enabled && scheduleConfig.time && queueState === 'idle') {
        const now = new Date();
        const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(
          now.getMinutes(),
        ).padStart(2, '0')}`;
        if (currentHHMM === scheduleConfig.time) {
          get().setSchedule({ enabled: false, time: scheduleConfig.time, blockSleep: false });
          startQueue();
        }
      }
    }, 1000);

    const unsub = window.rnApi.onQueueEvent((event) => {
      switch (event.type) {
        case 'queue:state': {
          const prevState = get().queueState;
          set({
            queueState: event.state,
            activeJobId: event.activeJobId || null,
          });
          if (event.state === 'idle' && timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
          }
          // Graceful queue completion check for post-queue action
          if (prevState === 'running' && event.state === 'idle') {
            const { postAction, postActionArmed } = get();
            if (postAction !== 'none' && postActionArmed) {
              get().startPostActionCountdown();
            }
          }
          break;
        }

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
              currentFrame:
                event.frame !== undefined ? event.frame : state.monitorStats.currentFrame,
              sampleCurrent:
                event.sampleCurrent !== undefined
                  ? event.sampleCurrent
                  : state.monitorStats.sampleCurrent,
              sampleTotal:
                event.sampleTotal !== undefined
                  ? event.sampleTotal
                  : state.monitorStats.sampleTotal,
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

          // Play finish sound "to-DUNG"
          const { soundSettings } = get();
          playTodungSound(soundSettings.volume / 100, soundSettings.isMuted);
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

          // Play finish sound if playOnFailure is enabled
          const { soundSettings } = get();
          if (soundSettings.playOnFailure) {
            playTodungSound(soundSettings.volume / 100, soundSettings.isMuted);
          }
          break;
        }
      }
    });

    return () => {
      unsub();
      if (scheduleCheckInterval) {
        clearInterval(scheduleCheckInterval);
        scheduleCheckInterval = null;
      }
      if (postActionInterval) {
        clearInterval(postActionInterval);
        postActionInterval = null;
      }
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    };
  },
}));
