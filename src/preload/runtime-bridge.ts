import { ipcRenderer } from 'electron';

import { APPLICATION_IPC, type DosaiBridge } from '../contracts/ipc';

export function createRuntimeBridge(): DosaiBridge {
  return Object.freeze({
    runtime: Object.freeze({
      getSnapshot: (...arguments_: unknown[]) => {
        if (arguments_.length !== 0) {
          return Promise.reject(new TypeError('runtime.getSnapshot accepts no arguments'));
        }

        return ipcRenderer.invoke(APPLICATION_IPC.getRuntimeSnapshot);
      },
    }),
  });
}
