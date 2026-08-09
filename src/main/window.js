const path = require('path');
const { BrowserWindow, screen } = require('electron');

function isVisibleOnAnyDisplay(bounds) {
  if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return false;
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      bounds.x < area.x + area.width &&
      bounds.x + Math.min(bounds.width || 900, 200) > area.x &&
      bounds.y < area.y + area.height &&
      bounds.y + Math.min(bounds.height || 640, 200) > area.y
    );
  });
}

function createMainWindow(webVoiceUrl, options = {}) {
  const state = options.windowRestore ? options.windowState : null;
  const restoredBounds = state && isVisibleOnAnyDisplay(state) ? {
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
  } : {};

  const win = new BrowserWindow({
    width: restoredBounds.width || 1200,
    height: restoredBounds.height || 820,
    x: restoredBounds.x,
    y: restoredBounds.y,
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
  win.once('ready-to-show', () => {
    if (state?.maximized) win.maximize();
  });

  if (process.env.JULIA_DIRECT_VOICE === '1') {
    win.loadURL(webVoiceUrl);
  } else {
    const shellPath = path.join(__dirname, '..', 'renderer', 'shell', 'index.html');
    win.loadFile(shellPath, {
      query: {
        voiceUrl: webVoiceUrl,
        defaultMode: options.defaultMode || 'text',
      }
    });
  }

  return win;
}

module.exports = { createMainWindow };
