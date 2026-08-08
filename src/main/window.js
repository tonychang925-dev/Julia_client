const path = require('path');
const { BrowserWindow } = require('electron');

function createMainWindow(webVoiceUrl) {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    title: 'Julia Voice V2',
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    },
    show: false
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(webVoiceUrl);
  return win;
}

module.exports = { createMainWindow };
