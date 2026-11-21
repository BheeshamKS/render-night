import { isQueueActive, registerIpcHandlers, stopQueueCleanly } from './ipc';

import { app, BrowserWindow, dialog, nativeTheme, net, protocol } from 'electron';

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'rn-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true,
    },
  },
]);

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
  nativeTheme.themeSource = 'dark';

  const initialWidth = process.env.WINDOW_WIDTH ? parseInt(process.env.WINDOW_WIDTH, 10) : 1280;
  const initialHeight = process.env.WINDOW_HEIGHT ? parseInt(process.env.WINDOW_HEIGHT, 10) : 800;

  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Render Night',
    icon: getIconPath(),
    backgroundColor: '#181818',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    titleBarOverlay:
      process.platform === 'win32'
        ? { color: '#181818', symbolColor: '#e6e6e6', height: 32 }
        : undefined,
    webPreferences: {
      preload: getPreloadPath(),
      sandbox: false,
      backgroundThrottling: false,
      webSecurity: false,
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
  protocol.handle('rn-media', (request) => {
    try {
      const url = new URL(request.url);
      const filePath = url.searchParams.get('path');
      if (!filePath || !existsSync(filePath)) {
        return new Response('Not Found', { status: 404 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Internal Server Error', { status: 500 });
    }
  });

  registerIpcHandlers(() => mainWindow);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
