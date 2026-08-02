import { BrowserWindow, ipcMain } from 'electron';

import { APPLICATION_IPC } from '../../contracts/ipc';
import { createRuntimeSnapshot } from '../runtime/runtime-snapshot';
import { isTrustedIpcSender } from '../security/application-policy';

export function registerApplicationIpc(isPackaged: boolean): void {
  ipcMain.handle(APPLICATION_IPC.getRuntimeSnapshot, (event, ...arguments_) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const frame = event.senderFrame;
    const trusted = isTrustedIpcSender(
      {
        frameUrl: frame?.url,
        isMainFrame: frame !== null && frame === event.sender.mainFrame,
        ownerWebContentsId: owner?.webContents.id,
        senderWebContentsId: event.sender.id,
      },
      isPackaged,
    );

    if (!trusted || arguments_.length !== 0) {
      throw new Error('Rejected untrusted DOSAI IPC request');
    }

    return createRuntimeSnapshot();
  });
}
