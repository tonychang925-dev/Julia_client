const path = require('path');
const { BrowserWindow } = require('electron');

function createMainWindow(webVoiceUrl) {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    title: 'Julia Desktop V2',
    backgroundColor: '#0f1115',
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

  if (process.env.JULIA_DIRECT_VOICE === '1') {
    win.loadURL(webVoiceUrl);
  } else {
    const shellPath = path.join(__dirname, '..', 'renderer', 'shell', 'index.html');
    win.loadFile(shellPath, {
      query: {
        voiceUrl: webVoiceUrl
      }
    });
  }

  return win;
}

module.exports = { createMainWindow };
