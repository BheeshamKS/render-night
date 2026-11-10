import { discoverAllBlenders, validateCustomBlender } from '../core/blender/discovery';
import { readBlendHeader } from '../core/blender/header-reader';
import { inspectBlend, type InspectOptions } from '../core/blender/inspector';
import { HistoryStore, type HistoryFilter } from '../core/history';
import { QueuePersistence } from '../core/persistence/queue-persistence';
import { SessionLockManager } from '../core/persistence/session-lock';
import { executeOsPostAction } from '../core/post-actions/post-action-executor';
import { type PowerSaveBlockerDriver, SleepBlockerManager } from '../core/power/sleep-blocker';
import { PreflightChecker, type PreflightJobInput, type PreflightOptions } from '../core/preflight';
import { PresetStore, type SavePresetInput } from '../core/presets';
import { QueueEngine, type QueueEngineJob } from '../core/queue/queue-engine';
import type { PersistedQueueState, PostAction } from '../core/schemas/queue-state';

import { app, dialog, ipcMain, powerSaveBlocker, shell, type BrowserWindow } from 'electron';

import { spawn } from 'node:child_process';
import * as path from 'node:path';

let globalQueueEngine: QueueEngine | null = null;

export function isQueueActive(): boolean {
  if (!globalQueueEngine) return false;
  const state = globalQueueEngine.getState();
  return state === 'running' || state === 'paused';
}

export async function stopQueueCleanly(): Promise<void> {
  if (globalQueueEngine) {
    await globalQueueEngine.stop();
  }
}

export function registerIpcHandlers(mainWindowProvider: () => BrowserWindow | null): void {
  // 1. Sleep Blocker, Session Lock, History Store & Persistence
  const electronSleepDriver: PowerSaveBlockerDriver = {
    start: (type) => powerSaveBlocker.start(type),
    stop: (id) => powerSaveBlocker.stop(id),
    isStarted: (id) => powerSaveBlocker.isStarted(id),
  };
  const sleepBlocker = new SleepBlockerManager(electronSleepDriver);

  const userDataDir = app.getPath('userData');
  const logsDir = path.join(userDataDir, 'logs');
  const runtimeDir = path.join(userDataDir, 'runtime');
  const locksDir = path.join(userDataDir, 'locks');
  const historyDir = path.join(userDataDir, 'history');

  const sessionLock = new SessionLockManager(locksDir);

  const persistence = new QueuePersistence(path.join(userDataDir, 'state'), 'queue-state.json');

  const historyStore = new HistoryStore({
    historyDir,
  });

  const presetStore = new PresetStore(path.join(userDataDir, 'presets', 'presets.json'));

  const runnerScriptPath = app.isPackaged
    ? path.join(process.resourcesPath, 'python', 'render_runner.py')
    : path.resolve(__dirname, '../../resources/python/render_runner.py');

  const queueEngine = new QueueEngine({
    logsDir,
    runtimeDir,
    runnerScriptPath,
    sleepBlocker,
    sessionLock,
    historyStore,
  });
  globalQueueEngine = queueEngine;

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
  queueEngine.on('job:history', (entry) => {
    sendEvent({ type: 'job:history', entry });
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

  ipcMain.handle(
    'blender:openGui',
    async (_event, executable: string | string[], filePath: string) => {
      let bin: string;
      let spawnArgs: string[];
      if (Array.isArray(executable)) {
        bin = executable[0];
        spawnArgs = [...executable.slice(1), filePath];
      } else {
        bin = executable;
        spawnArgs = [filePath];
      }

      const child = spawn(bin, spawnArgs, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return true;
    },
  );

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

  ipcMain.handle(
    'queue:preflight',
    async (_event, jobs: PreflightJobInput[], options?: PreflightOptions) => {
      const checker = new PreflightChecker();
      return checker.checkAll(jobs, options);
    },
  );

  // 4. Persistence & Crash Restore handlers
  ipcMain.handle('persistence:checkUncleanShutdown', async () => {
    const { isUnclean, lockData } = await sessionLock.checkUncleanShutdown();
    let orphanedPids: number[] = [];
    if (isUnclean && lockData?.workerPids && lockData.workerPids.length > 0) {
      orphanedPids = await sessionLock.cleanupOrphanedPids(lockData.workerPids);
    }
    await sessionLock.acquireLock();
    return { isUnclean, orphanedPids };
  });

  ipcMain.handle('persistence:loadSavedQueue', async () => {
    return persistence.load();
  });

  ipcMain.handle('persistence:saveQueue', async (_event, state: PersistedQueueState) => {
    await persistence.save(state);
  });

  ipcMain.handle('persistence:clearLock', async () => {
    await sessionLock.releaseLock();
  });

  // 5. Post-Action & OS Power execution
  ipcMain.handle('postAction:execute', async (_event, action: PostAction) => {
    if (action === 'close_app') {
      app.quit();
      return { success: true };
    }
    return executeOsPostAction(action, process.platform);
  });

  // 6. Sound handler
  ipcMain.handle('sound:getSoundPath', async () => {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'sounds', 'todung.wav')
      : path.resolve(__dirname, '../../resources/sounds/todung.wav');
  });

  // 7. History handlers
  ipcMain.handle('history:getEntries', async (_event, filter?: HistoryFilter) => {
    return historyStore.getEntries(filter);
  });

  ipcMain.handle('history:deleteEntry', async (_event, id: string) => {
    return historyStore.deleteEntry(id);
  });

  ipcMain.handle('history:clear', async () => {
    await historyStore.clear();
  });

  // 8. Sleep Blocker for Scheduling
  ipcMain.handle('power:acquireSleepBlock', async () => {
    return powerSaveBlocker.start('prevent-app-suspension');
  });

  ipcMain.handle('power:releaseSleepBlock', async (_event, id: number) => {
    if (powerSaveBlocker.isStarted(id)) {
      powerSaveBlocker.stop(id);
    }
  });

  // 9. Presets handlers
  ipcMain.handle('presets:load', async () => {
    return presetStore.loadPresets();
  });

  ipcMain.handle('presets:save', async (_event, input: SavePresetInput) => {
    return presetStore.savePreset(input);
  });

  ipcMain.handle('presets:rename', async (_event, id: string, newName: string) => {
    return presetStore.renamePreset(id, newName);
  });

  ipcMain.handle('presets:delete', async (_event, id: string) => {
    return presetStore.deletePreset(id);
  });

  ipcMain.handle('presets:export', async (_event, ids?: string[]) => {
    return presetStore.exportPresetsJson(ids);
  });

  ipcMain.handle('presets:import', async (_event, jsonStr: string) => {
    return presetStore.importPresetsJson(jsonStr);
  });

  // 10. Dialog & shell handlers
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
