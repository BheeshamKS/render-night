import type { BlenderInstallation } from '../core/blender/discovery';
import type { BlendHeaderInfo } from '../core/blender/header-reader';
import type { InspectOptions } from '../core/blender/inspector';
import type { QueueEngineJob, QueueState } from '../core/queue/queue-engine';
import type { GpuStatus } from '../core/render/gpu-monitor';
import type { InspectOutput } from '../core/schemas/inspect';
import type { QueueIpcEvent, RenderNightApi } from './types';

import { contextBridge, ipcRenderer } from 'electron';

const api: RenderNightApi = {
  platform: process.platform,

  discoverBlenders: (customPaths?: string[]): Promise<BlenderInstallation[]> => {
    return ipcRenderer.invoke('blender:discover', customPaths);
  },

  validateCustomBlender: (pathOrCommand: string | string[]): Promise<BlenderInstallation> => {
    return ipcRenderer.invoke('blender:validateCustom', pathOrCommand);
  },

  inspectBlend: (
    blendPath: string,
    blenderExecutable: string | string[],
    options?: InspectOptions,
  ): Promise<InspectOutput> => {
    return ipcRenderer.invoke('blender:inspect', blendPath, blenderExecutable, options);
  },

  readHeader: (blendPath: string): Promise<BlendHeaderInfo> => {
    return ipcRenderer.invoke('blender:readHeader', blendPath);
  },

  selectBlendFiles: (): Promise<string[]> => {
    return ipcRenderer.invoke('dialog:openBlendFiles');
  },

  selectDirectory: (defaultPath?: string): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:selectDirectory', defaultPath);
  },

  openPath: (targetPath: string): Promise<void> => {
    return ipcRenderer.invoke('shell:openPath', targetPath);
  },

  startQueue: (jobs: QueueEngineJob[]): Promise<void> => {
    return ipcRenderer.invoke('queue:start', jobs);
  },

  pauseQueue: (): Promise<void> => {
    return ipcRenderer.invoke('queue:pause');
  },

  resumeQueue: (): Promise<void> => {
    return ipcRenderer.invoke('queue:resume');
  },

  stopQueue: (): Promise<void> => {
    return ipcRenderer.invoke('queue:stop');
  },

  getQueueState: (): Promise<{ state: QueueState; activeJobId?: string }> => {
    return ipcRenderer.invoke('queue:getState');
  },

  sampleGpu: (): Promise<GpuStatus> => {
    return ipcRenderer.invoke('queue:sampleGpu');
  },

  openLogsFolder: (jobId?: string): Promise<void> => {
    return ipcRenderer.invoke('queue:openLogsFolder', jobId);
  },

  onQueueEvent: (listener: (event: QueueIpcEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: QueueIpcEvent) => {
      listener(payload);
    };
    ipcRenderer.on('queue:event', handler);
    return () => {
      ipcRenderer.removeListener('queue:event', handler);
    };
  },

  checkUncleanShutdown: () => {
    return ipcRenderer.invoke('persistence:checkUncleanShutdown');
  },

  loadSavedQueue: () => {
    return ipcRenderer.invoke('persistence:loadSavedQueue');
  },

  saveQueue: (state) => {
    return ipcRenderer.invoke('persistence:saveQueue', state);
  },

  clearUncleanShutdownLock: () => {
    return ipcRenderer.invoke('persistence:clearLock');
  },

  executePostAction: (action) => {
    return ipcRenderer.invoke('postAction:execute', action);
  },

  getSoundPath: () => {
    return ipcRenderer.invoke('sound:getSoundPath');
  },

  getHistory: (filter) => {
    return ipcRenderer.invoke('history:getEntries', filter);
  },

  deleteHistoryEntry: (id) => {
    return ipcRenderer.invoke('history:deleteEntry', id);
  },

  clearHistory: () => {
    return ipcRenderer.invoke('history:clear');
  },

  acquireSleepBlock: () => {
    return ipcRenderer.invoke('power:acquireSleepBlock');
  },

  releaseSleepBlock: (id) => {
    return ipcRenderer.invoke('power:releaseSleepBlock', id);
  },
};

contextBridge.exposeInMainWorld('rnApi', api);
