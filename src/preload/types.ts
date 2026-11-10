import type { BlenderInstallation } from '../core/blender/discovery';
import type { BlendHeaderInfo } from '../core/blender/header-reader';
import type { InspectOptions } from '../core/blender/inspector';
import type { InspectOutput } from '../core/schemas/inspect';

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
  selectBlendFiles(): Promise<string[]>;
  selectDirectory(defaultPath?: string): Promise<string | null>;
  openPath(targetPath: string): Promise<void>;
}

declare global {
  interface Window {
    rnApi: RenderNightApi;
  }
}
