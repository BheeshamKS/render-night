import { previewTokens } from '../render/token-expander';
import type { InspectScene } from '../schemas/inspect';
import type { CrashPolicy, OverrideMap } from '../schemas/override';
import type { FrameRangeConfig } from '../schemas/queue-state';

function generateUuid(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface JobToolsTarget {
  id: string;
  filePath: string;
  fileName: string;
  project: string;
  enabled: boolean;
  status: unknown;
  savedWithVersion?: string;
  blenderOverrideId?: string;
  selectedScene: string;
  selectedCamera: string;
  scenes: InspectScene[];
  availableCameras: string[];
  outputPathPattern: string;
  outputPreview: string;
  rangeConfig: FrameRangeConfig;
  customRangeLiveCount?: number;
  renderMissingOnly?: boolean;
  crashPolicy?: CrashPolicy;
  overrides?: OverrideMap;
  presets?: string[];
  preRenderHook?: string;
  isVideo?: boolean;
  logs?: unknown[];
  failedFrames?: unknown[];
  completedFrames?: number;
  totalFrames?: number;
  error?: string;
  inspectError?: string;
  deviceReport?: unknown;
  overridesReport?: unknown;
}

/**
 * Duplicate a job, generating a fresh ID and resetting all runtime progress/logs.
 */
export function duplicateJob<T extends JobToolsTarget>(job: T): T {
  const newId = generateUuid();
  return {
    ...job,
    id: newId,
    status: 'Queued',
    logs: [],
    completedFrames: 0,
    totalFrames: undefined,
    error: undefined,
    inspectError: undefined,
    deviceReport: undefined,
    overridesReport: undefined,
    failedFrames: [],
    overrides: job.overrides ? { ...job.overrides } : {},
    presets: job.presets ? [...job.presets] : [],
  };
}

/**
 * Expand a job into N jobs, one for each camera discovered in the job.
 * If 0 or 1 camera is found, returns a duplicated copy of the job.
 */
export function expandAllCameras<T extends JobToolsTarget>(job: T): T[] {
  const cameras =
    job.availableCameras && job.availableCameras.length > 0 ? job.availableCameras : [];
  if (cameras.length <= 1) {
    const dup = duplicateJob(job);
    if (cameras.length === 1) {
      dup.selectedCamera = cameras[0];
      dup.outputPreview = previewTokens(job.outputPathPattern, {
        project: job.project,
        scene: job.selectedScene,
        camera: cameras[0],
      });
    }
    return [dup];
  }

  return cameras.map((cameraName) => {
    const dup = duplicateJob(job);
    const outputPreview = previewTokens(job.outputPathPattern, {
      project: job.project,
      scene: job.selectedScene,
      camera: cameraName,
    });

    return {
      ...dup,
      selectedCamera: cameraName,
      outputPreview,
    };
  });
}

/**
 * Expand a job into N jobs, one for each scene discovered in the .blend file.
 * If 0 or 1 scene is found, returns a duplicated copy of the job.
 */
export function expandAllScenes<T extends JobToolsTarget>(job: T): T[] {
  const scenes = job.scenes && job.scenes.length > 0 ? job.scenes : [];
  if (scenes.length <= 1) {
    const dup = duplicateJob(job);
    if (scenes.length === 1) {
      dup.selectedScene = scenes[0].name;
    }
    return [dup];
  }

  return scenes.map((sc) => {
    const dup = duplicateJob(job);
    const sceneCameras = sc.cameras && sc.cameras.length > 0 ? sc.cameras : job.availableCameras;
    const selectedCamera =
      sc.activeCamera || (sceneCameras.length > 0 ? sceneCameras[0] : '') || job.selectedCamera;

    const outputPreview = previewTokens(job.outputPathPattern, {
      project: job.project,
      scene: sc.name,
      camera: selectedCamera,
    });

    return {
      ...dup,
      selectedScene: sc.name,
      selectedCamera,
      availableCameras: sceneCameras,
      outputPreview,
    };
  });
}
