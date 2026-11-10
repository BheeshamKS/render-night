import type { BlenderInstallation } from '../core/blender/discovery';
import type { BlendHeaderInfo } from '../core/blender/header-reader';
import type { InspectOptions } from '../core/blender/inspector';
import type { InspectOutput } from '../core/schemas/inspect';
import type { RenderNightApi } from './types';

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
};

contextBridge.exposeInMainWorld('rnApi', api);
