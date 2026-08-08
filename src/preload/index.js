const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('juliaElectronV2', {
  mode: 'clean-shell',
  ownsMediaPipeline: false
});
