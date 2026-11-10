import type { BlenderInstallation } from '../../core/blender/discovery';
import { previewTokens } from '../../core/render/token-expander';
import type { InspectOutput, InspectScene } from '../../core/schemas/inspect';

import { create } from 'zustand';

export type JobStatus = 'Queued' | 'Inspecting' | 'Rendering' | 'Completed' | 'Failed' | 'Skipped';

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
}

interface QueueStoreState {
  jobs: QueueJob[];
  blenders: BlenderInstallation[];
  selectedBlenderId: string | null;
  isolatedMode: boolean;
  autoExec: boolean;
  isDraggingOver: boolean;
  logs: string[];

  // Actions
  loadBlenders: () => Promise<void>;
  setSelectedBlenderId: (id: string) => void;
  setIsolatedMode: (enabled: boolean) => void;
  setAutoExec: (enabled: boolean) => void;
  setIsDraggingOver: (val: boolean) => void;
  addFiles: (filePaths: string[]) => Promise<void>;
  removeJob: (id: string) => void;
  updateJob: (id: string, updates: Partial<QueueJob>) => void;
  moveJob: (id: string, direction: 'up' | 'down') => void;
  reorderJobs: (fromIndex: number, toIndex: number) => void;
  addLog: (msg: string) => void;
  clearLogs: () => void;
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

export const useQueueStore = create<QueueStoreState>((set, get) => ({
  jobs: [],
  blenders: [],
  selectedBlenderId: null,
  isolatedMode: false,
  autoExec: false,
  isDraggingOver: false,
  logs: ['[System] Render Night ready. Waiting for jobs...'],

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
      };
    });

    set((state) => ({ jobs: [...state.jobs, ...newJobs] }));

    // Auto-run inspection for each new job
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

          // File's default render path if present
          let fileRenderPath = '//render/{project}/{scene}_{camera}_####.png';
          const rnaFilepath = activeScene?.render?.filepath?.value;
          if (typeof rnaFilepath === 'string' && rnaFilepath.trim()) {
            fileRenderPath = rnaFilepath.trim();
          }

          const preview = computePreview(fileRenderPath, job.project, sceneName, cameraName);

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
          });

          get().addLog(
            `Inspection complete for ${job.fileName} (Blender ${inspectData.savedWithVersion}, Scene: ${sceneName})`,
          );
        } else {
          // Fallback if window.rnApi is unavailable (e.g. headless tests)
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

        // When scene changes, update available cameras and default active camera
        if (updates.selectedScene && updates.selectedScene !== job.selectedScene) {
          const currentScene = merged.scenes.find((s) => s.name === updates.selectedScene);
          if (currentScene) {
            merged.availableCameras = currentScene.cameras || [];
            merged.selectedCamera = currentScene.activeCamera || currentScene.cameras[0] || '';
          }
        }

        // Recompute preview
        merged.outputPreview = computePreview(
          merged.outputPathPattern,
          merged.project,
          merged.selectedScene,
          merged.selectedCamera,
        );

        return merged;
      }),
    }));
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
}));
