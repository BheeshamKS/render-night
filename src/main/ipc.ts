import { discoverAllBlenders, validateCustomBlender } from '../core/blender/discovery';
import { readBlendHeader } from '../core/blender/header-reader';
import { inspectBlend, type InspectOptions } from '../core/blender/inspector';

import { dialog, ipcMain, shell, type BrowserWindow } from 'electron';

export function registerIpcHandlers(mainWindowProvider: () => BrowserWindow | null): void {
  ipcMain.handle('blender:discover', async (_event, customPaths?: string[]) => {
    return discoverAllBlenders(customPaths);
  });

  ipcMain.handle('blender:validateCustom', async (_event, pathOrCommand: string | string[]) => {
    return validateCustomBlender(pathOrCommand);
  });

  ipcMain.handle(
    'blender:inspect',
    async (
      _event,
      blendPath: string,
      blenderExecutable: string | string[],
      options?: InspectOptions,
    ) => {
      return inspectBlend(blendPath, blenderExecutable, options);
    },
  );

  ipcMain.handle('blender:readHeader', async (_event, blendPath: string) => {
    return readBlendHeader(blendPath);
  });

  ipcMain.handle('dialog:openBlendFiles', async () => {
    const win = mainWindowProvider();
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Select Blender Files',
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: 'Blender Files', extensions: ['blend'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        })
      : await dialog.showOpenDialog({
          title: 'Select Blender Files',
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: 'Blender Files', extensions: ['blend'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
    if (result.canceled) return [];
    return result.filePaths;
  });

  ipcMain.handle('dialog:selectDirectory', async (_event, defaultPath?: string) => {
    const win = mainWindowProvider();
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Select Output Directory',
          defaultPath,
          properties: ['openDirectory', 'createDirectory'],
        })
      : await dialog.showOpenDialog({
          title: 'Select Output Directory',
          defaultPath,
          properties: ['openDirectory', 'createDirectory'],
        });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
    await shell.openPath(targetPath);
  });
}
