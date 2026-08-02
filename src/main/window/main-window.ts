import { BrowserWindow } from 'electron';
import { join } from 'node:path';

import { resolveDevelopmentRendererUrl } from '../development/renderer-url';
import { isTrustedRendererUrl, PRODUCTION_RENDERER_URL } from '../security/application-policy';

export async function createMainWindow(isPackaged: boolean): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    backgroundColor: '#11100f',
    height: 760,
    minHeight: 640,
    minWidth: 920,
    show: false,
    title: 'DOSAI',
    width: 1180,
    webPreferences: {
      contextIsolation: true,
      devTools: !isPackaged,
      enableWebSQL: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      nodeIntegration: false,
      allowRunningInsecureContent: false,
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      spellcheck: false,
      webviewTag: false,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (details) => {
    if (!isTrustedRendererUrl(details.url, isPackaged)) {
      details.preventDefault();
    }
  });
  mainWindow.webContents.on('will-frame-navigate', (details) => {
    if (!details.isMainFrame || !isTrustedRendererUrl(details.url, isPackaged)) {
      details.preventDefault();
    }
  });
  mainWindow.webContents.on('will-redirect', (details) => {
    if (!details.isMainFrame || !isTrustedRendererUrl(details.url, isPackaged)) {
      details.preventDefault();
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());

  const developmentUrl = resolveDevelopmentRendererUrl(
    process.env.DOSAI_RENDERER_URL,
    isPackaged,
  );
  if (developmentUrl === undefined) {
    await mainWindow.loadURL(PRODUCTION_RENDERER_URL);
  } else {
    await mainWindow.loadURL(developmentUrl);
  }

  return mainWindow;
}
