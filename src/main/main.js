const { app, ipcMain } = require('electron');
const { getWebVoiceUrl, isAllowedLocalDevCertUrl } = require('./config');
const { installPermissions } = require('./permissions');
const { createMainWindow } = require('./window');
const { sendTextMessage, getTextApiUrl } = require('./text-client');

let mainWindow = null;


ipcMain.handle('julia:text:send', async (_event, input) => {
  return sendTextMessage(input);
});

app.whenReady().then(async () => {
  const webVoiceUrl = getWebVoiceUrl();
  console.log('[V2_WEB_VOICE_URL]', webVoiceUrl);
  console.log('[V2_TEXT_API_URL]', getTextApiUrl());

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
  mainWindow = createMainWindow(webVoiceUrl);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) {
    const webVoiceUrl = getWebVoiceUrl();
    mainWindow = createMainWindow(webVoiceUrl);
  }
});
