const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dosaiProject', {
  view: () => ipcRenderer.invoke('coordination:view'),
  run: (...args) => ipcRenderer.invoke('coordination:run', ...args),
  stop: () => ipcRenderer.invoke('coordination:stop'),
  subscribe: observer => {
    ipcRenderer.on('coordination:update', (_event, record) => observer(record));
  },
});
