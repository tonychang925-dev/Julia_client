const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('juliaElectronV2', {
  mode: 'clean-shell',
  ownsMediaPipeline: false,
  sendTextMessage: (text) => ipcRenderer.invoke('julia:text:send', { text }),
  streamTextMessage: (requestId, text) => ipcRenderer.invoke('julia:text:stream', { requestId, text }),
  onTextStreamEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('julia:text:stream-event', handler);
    return () => ipcRenderer.removeListener('julia:text:stream-event', handler);
  }
});
