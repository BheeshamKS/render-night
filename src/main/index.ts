import { isQueueActive, registerIpcHandlers, stopQueueCleanly } from './ipc';

import { app, BrowserWindow, dialog } from 'electron';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

function getPreloadPath(): string {
  const mjsPath = join(__dirname, '../preload/index.mjs');
  if (existsSync(mjsPath)) return mjsPath;
  return join(__dirname, '../preload/index.js');
}

function getIconPath(): string | undefined {
  const iconPath = join(__dirname, '../../resources/icon.png');
  return existsSync(iconPath) ? iconPath : undefined;
}

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 500,
    show: false,
    title: 'Render Night',
    icon: getIconPath(),
    backgroundColor: '#181818',
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', async (e) => {
    if (isQuitting) return;

    if (isQueueActive()) {
      e.preventDefault();
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'question',
        buttons: ['Cancel', 'Stop render and quit'],
        defaultId: 1,
        cancelId: 0,
        title: 'Render Night',
        message: 'Stop render and quit?',
        detail:
          'A render is currently in progress. Quitting will cleanly stop Blender and save the queue state so you can resume it later.',
      });

      if (choice === 1) {
        isQuitting = true;
        await stopQueueCleanly();
        mainWindow?.destroy();
        app.quit();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  registerIpcHandlers(() => mainWindow);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
