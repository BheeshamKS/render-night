import { discoverAllBlenders, validateCustomBlender } from '../core/blender/discovery';
import { readBlendHeader } from '../core/blender/header-reader';
import { inspectBlend, type InspectOptions } from '../core/blender/inspector';
import { SequenceStitcher, type StitchOptions } from '../core/ffmpeg/converter';
import { getFfmpegPath } from '../core/ffmpeg/discovery';
import { HistoryStore, type HistoryFilter } from '../core/history';
import { QueuePersistence } from '../core/persistence/queue-persistence';
import { SessionLockManager } from '../core/persistence/session-lock';
import { executeOsPostAction } from '../core/post-actions/post-action-executor';
import { type PowerSaveBlockerDriver, SleepBlockerManager } from '../core/power/sleep-blocker';
import { PreflightChecker, type PreflightJobInput, type PreflightOptions } from '../core/preflight';
import { PresetStore, type SavePresetInput } from '../core/presets';
import { QueueEngine, type QueueEngineJob } from '../core/queue/queue-engine';
import { resolveOutputPath } from '../core/render/output-path-resolver';
import {
  type PersistedQueueState,
  type PostAction,
  queueStateSchema,
} from '../core/schemas/queue-state';
import type { ImageSequenceInfo } from '../core/schemas/sequence';
import { readImageAsDataUrl } from '../core/sequence/image-reader';
import { generateFrameProxy } from '../core/sequence/proxy-generator';
import { detectSequence } from '../core/sequence/sequence-detector';
import { clearVideoProxyCache, generateVideoProxy } from '../core/sequence/video-proxy';

import { app, dialog, ipcMain, powerSaveBlocker, shell, type BrowserWindow } from 'electron';

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

let globalQueueEngine: QueueEngine | null = null;
let activeStitcher: SequenceStitcher | null = null;

function buildSanitizedDesktopEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.LD_LIBRARY_PATH;
  delete env.LD_PRELOAD;
  delete env.APPIMAGE;
  delete env.APPDIR;
  delete env.ARGV0;
  return env;
}

/**
 * Opens a folder or reveals a file in the host file manager without blocking Electron's main thread.
 * On Linux, spawns `xdg-open` detached so KDE/GTK portals and MIME lookups never freeze the window.
 */
async function openPathNonBlocking(targetPath: string, blendFilePath?: string): Promise<void> {
  if (!targetPath || typeof targetPath !== 'string') return;
  const resolved = resolveOutputPath(targetPath, blendFilePath, { fallbackToBlendDir: true });
  if (!resolved) return;

  const trimmed = resolved.replace(/[/\\]+$/, '') || resolved;
  let existingPath = '';
  let isFile = false;

  if (fs.existsSync(resolved)) {
    existingPath = resolved;
    isFile = fs.statSync(resolved).isFile();
  } else if (fs.existsSync(trimmed)) {
    existingPath = trimmed;
    isFile = fs.statSync(trimmed).isFile();
  } else {
    let cur = path.dirname(trimmed);
    for (let i = 0; i < 4; i++) {
      if (fs.existsSync(cur)) {
        existingPath = cur;
        isFile = fs.statSync(cur).isFile();
        break;
      }
      const next = path.dirname(cur);
      if (next === cur) break;
      cur = next;
    }
  }

  if (!existingPath) return;

  if (process.platform === 'win32') {
    const winPath = path.win32.normalize(existingPath);
    const args = isFile ? [`/select,${winPath}`] : [winPath];
    try {
      const child = spawn('explorer.exe', args, {
        detached: true,
        stdio: 'ignore',
      });
      child.on('error', () => {
        if (isFile) {
          try {
            shell.showItemInFolder(existingPath);
          } catch {
            void shell.openPath(path.dirname(existingPath)).catch(() => {});
          }
        } else {
          void shell.openPath(existingPath).catch(() => {});
        }
      });
      child.unref();
      return;
    } catch {
      if (isFile) {
        try {
          shell.showItemInFolder(existingPath);
        } catch {
          void shell.openPath(path.dirname(existingPath)).catch(() => {});
        }
      } else {
        void shell.openPath(existingPath).catch(() => {});
      }
      return;
    }
  }

  if (process.platform === 'darwin') {
    const args = isFile ? ['-R', existingPath] : [existingPath];
    try {
      const child = spawn('open', args, {
        detached: true,
        stdio: 'ignore',
      });
      child.on('error', () => {
        void shell.openPath(existingPath).catch(() => {});
      });
      child.unref();
      return;
    } catch {
      void shell.openPath(existingPath).catch(() => {});
      return;
    }
  }

  if (process.platform === 'linux') {
    const targetToOpen = isFile ? path.dirname(existingPath) : existingPath;
    const child = spawn('xdg-open', [targetToOpen], {
      detached: true,
      stdio: 'ignore',
      env: buildSanitizedDesktopEnv(),
    });
    child.on('error', () => {
      // Fallback only if xdg-open binary is unavailable
      void shell.openPath(targetToOpen).catch(() => {});
    });
    child.unref();
    return;
  }

  if (isFile) {
    try {
      shell.showItemInFolder(existingPath);
      return;
    } catch {
      existingPath = path.dirname(existingPath);
    }
  }

  await Promise.race([
    shell.openPath(existingPath),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

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
    await openPathNonBlocking(target);
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
    let safeDefault: string | undefined;
    if (defaultPath && typeof defaultPath === 'string') {
      const resolved = resolveOutputPath(defaultPath);
      if (resolved && fs.existsSync(resolved)) {
        safeDefault = fs.statSync(resolved).isFile() ? path.dirname(resolved) : resolved;
      }
    }
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Select Output Directory',
          defaultPath: safeDefault,
          properties: ['openDirectory', 'createDirectory'],
        })
      : await dialog.showOpenDialog({
          title: 'Select Output Directory',
          defaultPath: safeDefault,
          properties: ['openDirectory', 'createDirectory'],
        });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:selectBlenderExecutable', async () => {
    const win = mainWindowProvider();
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const filters = isWin
      ? [
          { name: 'Blender Executable (blender.exe)', extensions: ['exe'] },
          { name: 'All Files', extensions: ['*'] },
        ]
      : isMac
        ? [
            { name: 'Blender Application / Binary', extensions: ['app', '*'] },
            { name: 'All Files', extensions: ['*'] },
          ]
        : [{ name: 'All Files', extensions: ['*'] }];

    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Select Blender Executable',
          properties: ['openFile'],
          filters,
        })
      : await dialog.showOpenDialog({
          title: 'Select Blender Executable',
          properties: ['openFile'],
          filters,
        });

    if (result.canceled || result.filePaths.length === 0) return null;
    let selected = result.filePaths[0];
    if (isMac && selected.endsWith('.app')) {
      const inner = path.join(selected, 'Contents', 'MacOS', 'Blender');
      if (fs.existsSync(inner)) {
        selected = inner;
      }
    }
    return selected;
  });

  ipcMain.handle('shell:openPath', async (_event, targetPath: string, blendFilePath?: string) => {
    try {
      await openPathNonBlocking(targetPath, blendFilePath);
    } catch {
      // ignore
    }
  });

  // Image Sequence Tools & FFmpeg
  ipcMain.handle('sequence:detect', async (_event, dirOrPath: string, blendFilePath?: string) => {
    return detectSequence(dirOrPath, blendFilePath);
  });

  ipcMain.handle('sequence:readImageDataUrl', async (_event, filePath: string) => {
    return readImageAsDataUrl(filePath);
  });

  ipcMain.handle('sequence:generateProxy', async (_event, sourcePath: string) => {
    const cacheDir = path.join(app.getPath('userData'), 'cache', 'proxies');
    return generateFrameProxy(sourcePath, cacheDir);
  });

  ipcMain.handle('sequence:getVideoProxy', async (_event, sequence: ImageSequenceInfo) => {
    const cacheDir = path.join(app.getPath('userData'), 'cache', 'video-proxies');
    const ffmpegInfo = await getFfmpegPath();
    const ffmpegBin = ffmpegInfo?.path || 'ffmpeg';
    const win = mainWindowProvider();
    return generateVideoProxy(sequence, cacheDir, ffmpegBin, (progress) => {
      win?.webContents.send('sequence:videoProxyProgress', {
        directory: sequence.directory,
        progress,
      });
    });
  });

  ipcMain.handle('sequence:clearVideoProxies', async () => {
    const cacheDir = path.join(app.getPath('userData'), 'cache', 'video-proxies');
    return clearVideoProxyCache(cacheDir);
  });

  ipcMain.handle('sequence:stitch', async (_event, options: StitchOptions) => {
    activeStitcher = new SequenceStitcher(options);
    try {
      const win = mainWindowProvider();
      const result = await activeStitcher.start((progress) => {
        win?.webContents.send('sequence:stitchProgress', progress);
      });
      return result;
    } finally {
      activeStitcher = null;
    }
  });

  ipcMain.handle('sequence:cancelStitch', async () => {
    if (activeStitcher) {
      await activeStitcher.cancel();
      activeStitcher = null;
    }
  });

  ipcMain.handle('dialog:selectAudioFile', async () => {
    const win = mainWindowProvider();
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Select Audio File',
          properties: ['openFile'],
          filters: [
            {
              name: 'Audio Files',
              extensions: ['wav', 'mp3', 'aac', 'flac', 'ogg', 'm4a', 'aiff'],
            },
            { name: 'All Files', extensions: ['*'] },
          ],
        })
      : await dialog.showOpenDialog({
          title: 'Select Audio File',
          properties: ['openFile'],
          filters: [
            {
              name: 'Audio Files',
              extensions: ['wav', 'mp3', 'aac', 'flac', 'ogg', 'm4a', 'aiff'],
            },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:selectSaveVideoPath', async (_event, defaultName?: string) => {
    const win = mainWindowProvider();
    const result = win
      ? await dialog.showSaveDialog(win, {
          title: 'Export Video',
          defaultPath: defaultName || 'output.mp4',
          filters: [
            { name: 'MP4 Video', extensions: ['mp4'] },
            { name: 'WebM Video', extensions: ['webm'] },
            { name: 'Apple ProRes / QuickTime', extensions: ['mov'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        })
      : await dialog.showSaveDialog({
          title: 'Export Video',
          defaultPath: defaultName || 'output.mp4',
          filters: [
            { name: 'MP4 Video', extensions: ['mp4'] },
            { name: 'WebM Video', extensions: ['webm'] },
            { name: 'Apple ProRes / QuickTime', extensions: ['mov'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('ffmpeg:getInfo', async () => {
    return getFfmpegPath();
  });

  ipcMain.handle('dialog:exportQueueToFile', async (_event, state: PersistedQueueState) => {
    const win = mainWindowProvider();
    const result = win
      ? await dialog.showSaveDialog(win, {
          title: 'Export Render Queue',
          defaultPath: 'render-queue.json',
          filters: [
            { name: 'Render Night Queue (*.json, *.rnqueue)', extensions: ['json', 'rnqueue'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        })
      : await dialog.showSaveDialog({
          title: 'Export Render Queue',
          defaultPath: 'render-queue.json',
          filters: [
            { name: 'Render Night Queue (*.json, *.rnqueue)', extensions: ['json', 'rnqueue'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    try {
      const json = JSON.stringify(state, null, 2);
      await fs.promises.writeFile(result.filePath, json, 'utf-8');
      return { success: true, filePath: result.filePath };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('dialog:importQueueFromFile', async () => {
    const win = mainWindowProvider();
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Import Render Queue',
          properties: ['openFile'],
          filters: [
            { name: 'Render Night Queue (*.json, *.rnqueue)', extensions: ['json', 'rnqueue'] },
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        })
      : await dialog.showOpenDialog({
          title: 'Import Render Queue',
          properties: ['openFile'],
          filters: [
            { name: 'Render Night Queue (*.json, *.rnqueue)', extensions: ['json', 'rnqueue'] },
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    try {
      const filePath = result.filePaths[0];
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      const validated = queueStateSchema.safeParse(parsed);
      if (validated.success) {
        return { success: true, state: validated.data };
      }

      // Support legacy or CLI queue format { jobs: [...] }
      if (Array.isArray(parsed?.jobs)) {
        const fallbackState: PersistedQueueState = {
          version: typeof parsed.version === 'number' ? parsed.version : 1,
          jobs: parsed.jobs,
          settings: parsed.settings || {
            concurrentJobs: 1,
            stopOnFailure: false,
            closeAppOnCompletion: false,
            closeAppOnCompletionMode: 'last',
            soundOnCompletion: true,
            soundOnFailure: true,
            powerMode: 'none',
            pauseOnBattery: false,
            resumeOnAc: false,
            maxConcurrentFrames: 1,
            postAction: 'none',
            sound: { enabled: true, volume: 100, playOnFailure: false },
          },
        };
        return { success: true, state: fallbackState };
      }

      return {
        success: false,
        error: `Invalid queue format: ${validated.error.issues.map((i) => i.message).join(', ')}`,
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });
}
