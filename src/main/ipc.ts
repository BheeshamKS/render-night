import { discoverAllBlenders, validateCustomBlender } from '../core/blender/discovery';
import { readBlendHeader } from '../core/blender/header-reader';
import { inspectBlend, type InspectOptions } from '../core/blender/inspector';
import { type PowerSaveBlockerDriver, SleepBlockerManager } from '../core/power/sleep-blocker';
import { QueueEngine, type QueueEngineJob } from '../core/queue/queue-engine';

import { app, dialog, ipcMain, powerSaveBlocker, shell, type BrowserWindow } from 'electron';

import * as path from 'node:path';

export function registerIpcHandlers(mainWindowProvider: () => BrowserWindow | null): void {
  // 1. Sleep Blocker & Queue Engine initialization
  const electronSleepDriver: PowerSaveBlockerDriver = {
    start: (type) => powerSaveBlocker.start(type),
    stop: (id) => powerSaveBlocker.stop(id),
    isStarted: (id) => powerSaveBlocker.isStarted(id),
  };
  const sleepBlocker = new SleepBlockerManager(electronSleepDriver);

  const logsDir = path.join(app.getPath('userData'), 'logs');
  const runtimeDir = path.join(app.getPath('userData'), 'runtime');
  const runnerScriptPath = app.isPackaged
    ? path.join(process.resourcesPath, 'python', 'render_runner.py')
    : path.resolve(__dirname, '../../resources/python/render_runner.py');

  const queueEngine = new QueueEngine({
    logsDir,
    runtimeDir,
    runnerScriptPath,
    sleepBlocker,
  });

  const sendEvent = (eventPayload: unknown) => {
    const win = mainWindowProvider();
    if (win && !win.isDestroyed()) {
      win.webContents.send('queue:event', eventPayload);
    }
  };

  queueEngine.on('queue:state', (state, activeJobId) => {
    sendEvent({ type: 'queue:state', state, activeJobId });
  });
  queueEngine.on('job:start', (data) => {
    sendEvent({ type: 'job:start', ...data });
  });
  queueEngine.on('job:progress', (data) => {
    sendEvent({ type: 'job:progress', ...data });
  });
  queueEngine.on('frame:start', (data) => {
    sendEvent({ type: 'frame:start', ...data });
  });
  queueEngine.on('frame:done', (data) => {
    sendEvent({ type: 'frame:done', ...data });
  });
  queueEngine.on('frame:failed', (data) => {
    sendEvent({ type: 'frame:failed', ...data });
  });
  queueEngine.on('device:report', (data) => {
    sendEvent({ type: 'device:report', ...data });
  });
  queueEngine.on('overrides:report', (data) => {
    sendEvent({ type: 'overrides:report', ...data });
  });
  queueEngine.on('log', (data) => {
    sendEvent({ type: 'log', ...data });
  });
  queueEngine.on('job:done', (data) => {
    sendEvent({ type: 'job:done', ...data });
  });
  queueEngine.on('job:failed', (data) => {
    sendEvent({ type: 'job:failed', ...data });
  });

  // 2. Blender discovery & inspection handlers
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

  // 3. Queue execution control handlers
  ipcMain.handle('queue:start', async (_event, jobs: QueueEngineJob[]) => {
    queueEngine.start(jobs).catch((err) => {
      sendEvent({
        type: 'job:failed',
        jobId: 'queue',
        error: (err as Error).message,
      });
    });
  });

  ipcMain.handle('queue:pause', async () => {
    await queueEngine.pause();
  });

  ipcMain.handle('queue:resume', async () => {
    await queueEngine.resume();
  });

  ipcMain.handle('queue:stop', async () => {
    await queueEngine.stop();
  });

  ipcMain.handle('queue:getState', async () => {
    return {
      state: queueEngine.getState(),
      activeJobId: queueEngine.getActiveJobId(),
    };
  });

  ipcMain.handle('queue:sampleGpu', async () => {
    return queueEngine.sampleGpu();
  });

  ipcMain.handle('queue:openLogsFolder', async (_event, jobId?: string) => {
    const target = jobId ? path.join(logsDir, jobId) : logsDir;
    await shell.openPath(target);
  });

  // 4. Dialog & shell handlers
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
