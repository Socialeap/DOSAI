import { ipcRenderer } from 'electron';

import { APPLICATION_IPC, type DosaiBridge } from '../contracts/ipc';

export function createRuntimeBridge(): DosaiBridge {
  return Object.freeze({
    runtime: Object.freeze({
      getSnapshot: () => ipcRenderer.invoke(APPLICATION_IPC.getRuntimeSnapshot),
    }),
  });
}
