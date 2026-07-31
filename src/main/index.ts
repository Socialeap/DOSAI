import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

import { registerApplicationIpc } from './ipc/register-application-ipc';
import { installApplicationProtocol, registerApplicationScheme } from './security/application-protocol';
import { configureDefaultSession } from './security/session-policy';
import { createMainWindow } from './window/main-window';

app.setName('DOSAI');
registerApplicationScheme();

void app.whenReady().then(async () => {
  installApplicationProtocol(join(__dirname, '../renderer'));
  configureDefaultSession(app.isPackaged);
  registerApplicationIpc(app.isPackaged);
  await createMainWindow(app.isPackaged);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow(app.isPackaged);
    }
  });
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
