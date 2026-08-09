const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('juliaElectronV2', {
  mode: 'clean-shell',
  ownsMediaPipeline: false,
  sendTextMessage: (text) => ipcRenderer.invoke('julia:text:send', { text })
});
