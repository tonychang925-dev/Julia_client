const { app, globalShortcut, ipcMain, Menu, nativeImage, Tray } = require('electron');
const { getWebVoiceUrl, isAllowedLocalDevCertUrl } = require('./config');
const { installPermissions } = require('./permissions');
const { createMainWindow } = require('./window');
const { sendTextMessage, streamTextMessage, getTextApiUrl } = require('./text-client');
const { createConversationStore } = require('./conversation-store');
const { createSettingsStore } = require('./settings-store');
const { getBrainStatus } = require('./brain-status');

let mainWindow = null;
let conversationStore = null;
let settingsStore = null;
let tray = null;
let isQuitting = false;

function getConversationStore() {
  if (!conversationStore) {
    throw new Error('Conversation store is not ready');
  }
  return conversationStore;
}

function getSettingsStore() {
  if (!settingsStore) {
    throw new Error('Settings store is not ready');
  }
  return settingsStore;
}

function getSettings() {
  return getSettingsStore().getSettings();
}

function getTextClientOptions() {
  return {
    brainEndpoint: getSettings().brainEndpoint,
  };
}

function getWindowState(win) {
  const bounds = win.getBounds();
  return {
    ...bounds,
    maximized: win.isMaximized(),
  };
}

function persistWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  getSettingsStore().updateWindowState(getWindowState(mainWindow));
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    const webVoiceUrl = getWebVoiceUrl();
    mainWindow = createMainWindow(webVoiceUrl, getSettings());
    attachWindowLifecycle(mainWindow);
  }
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function hideMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    persistWindowState();
    mainWindow.hide();
  }
}

function toggleMainWindow() {
  if (mainWindow?.isVisible()) hideMainWindow();
  else showMainWindow();
}

function createTrayImage() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="9" fill="#b78cff"/>
      <text x="16" y="22" text-anchor="middle" font-family="Arial" font-size="19" font-weight="700" fill="#10141d">J</text>
    </svg>
  `;
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  image.setTemplateImage(process.platform === 'darwin');
  return image;
}

function updateTray() {
  const settings = getSettings();
  if (!settings.trayEnabled) {
    tray?.destroy();
    tray = null;
    return;
  }

  if (!tray) {
    tray = new Tray(createTrayImage());
    tray.setToolTip('Julia Desktop V2');
    tray.on('click', toggleMainWindow);
  }

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Julia', click: showMainWindow },
    { label: 'Hide Julia', click: hideMainWindow },
    { type: 'separator' },
    {
      label: 'Quit Julia',
      click: () => {
        isQuitting = true;
        persistWindowState();
        app.quit();
      },
    },
  ]));
}

function registerGlobalShortcut() {
  globalShortcut.unregisterAll();
  const settings = getSettings();
  if (!settings.globalShortcut) return;

  const ok = globalShortcut.register(settings.globalShortcut, toggleMainWindow);
  if (!ok) {
    console.warn('[V2_GLOBAL_SHORTCUT_REGISTER_FAILED]', settings.globalShortcut);
  }
}

function applyDesktopSettings() {
  const settings = getSettings();
  if (app.isPackaged) {
    app.setLoginItemSettings?.({
      openAtLogin: settings.launchAtLogin,
    });
  }
  updateTray();
  registerGlobalShortcut();
}

function attachWindowLifecycle(win) {
  win.on('close', (event) => {
    persistWindowState();
    const settings = getSettings();
    if (!isQuitting && settings.closeBehavior === 'tray' && settings.trayEnabled) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.on('resize', persistWindowState);
  win.on('move', persistWindowState);
}

ipcMain.handle('julia:text:send', async (_event, input) => {
  return sendTextMessage(input, getTextClientOptions());
});

ipcMain.handle('julia:text:stream', async (event, input) => {
  const requestId = String(input?.requestId || '');

  try {
    const result = await streamTextMessage(
      input,
      {
        onDelta: (delta, content) => {
          event.sender.send('julia:text:stream-event', {
            requestId,
            type: 'delta',
            delta,
            content,
          });
        },
      },
      getTextClientOptions()
    );

    event.sender.send('julia:text:stream-event', {
      requestId,
      type: 'done',
      content: result.content,
    });

    return result;
  } catch (error) {
    event.sender.send('julia:text:stream-event', {
      requestId,
      type: 'error',
      error: error.message,
    });
    throw error;
  }
});

ipcMain.handle('julia:conversation:list', async () => {
  return getConversationStore().listConversations();
});

ipcMain.handle('julia:conversation:current', async () => {
  return getConversationStore().getCurrentConversation();
});

ipcMain.handle('julia:conversation:create', async (_event, input) => {
  return getConversationStore().createConversation(input?.title || 'New Conversation');
});

ipcMain.handle('julia:conversation:open', async (_event, input) => {
  return getConversationStore().setCurrentConversation(input?.conversationId);
});

ipcMain.handle('julia:conversation:add-message', async (_event, input) => {
  return getConversationStore().addMessage(input?.conversationId, input?.message || {});
});

ipcMain.handle('julia:conversation:rename', async (_event, input) => {
  return getConversationStore().renameConversation(input?.conversationId, input?.title);
});

ipcMain.handle('julia:conversation:delete', async (_event, input) => {
  return getConversationStore().deleteConversation(input?.conversationId);
});

ipcMain.handle('julia:conversation:search', async (_event, input) => {
  return getConversationStore().searchConversations(input?.query);
});

ipcMain.handle('julia:settings:get', async () => {
  return getSettings();
});

ipcMain.handle('julia:settings:update', async (_event, input) => {
  const settings = getSettingsStore().updateSettings(input || {});
  applyDesktopSettings();
  return settings;
});

ipcMain.handle('julia:brain:status', async () => {
  return getBrainStatus(getSettings().brainEndpoint);
});

ipcMain.handle('julia:app:show', async () => {
  showMainWindow();
  return { visible: true };
});

ipcMain.handle('julia:app:hide', async () => {
  hideMainWindow();
  return { visible: false };
});

app.whenReady().then(async () => {
  const webVoiceUrl = getWebVoiceUrl();
  console.log('[V2_WEB_VOICE_URL]', webVoiceUrl);
  settingsStore = createSettingsStore(app.getPath('userData'));
  settingsStore.load();
  console.log('[V2_SETTINGS_STORE]', settingsStore.filePath);
  console.log('[V2_TEXT_API_URL]', getTextApiUrl(getTextClientOptions()));
  conversationStore = createConversationStore(app.getPath('userData'));
  conversationStore.load();
  console.log('[V2_CONVERSATION_STORE]', conversationStore.filePath);
  applyDesktopSettings();

  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    const allowLocalDev = process.env.JULIA_ALLOW_INSECURE_LOCALHOST_CERT === '1';
    if (allowLocalDev && isAllowedLocalDevCertUrl(url)) {
      console.warn('[V2_CERT_LOCAL_DIAGNOSTIC_ALLOWED]', { url, error, issuer: certificate?.issuerName });
      event.preventDefault();
      callback(true);
      return;
    }
    callback(false);
  });

  await installPermissions(webVoiceUrl);
  mainWindow = createMainWindow(webVoiceUrl, getSettings());
  attachWindowLifecycle(mainWindow);
});

app.on('window-all-closed', () => {
  const shouldQuit = isQuitting || getSettings().closeBehavior === 'quit' || process.platform !== 'darwin';
  if (shouldQuit) app.quit();
});

app.on('activate', () => {
  showMainWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  persistWindowState();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
