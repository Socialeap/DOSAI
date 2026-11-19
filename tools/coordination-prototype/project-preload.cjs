const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dosaiProject', {
  view: () => ipcRenderer.invoke('coordination:view'),
  run: roles => ipcRenderer.invoke('coordination:run', roles),
  stop: () => ipcRenderer.invoke('coordination:stop'),
  subscribe: observer => {
    ipcRenderer.on('coordination:update', (_event, record) => observer(record));
  },
});
