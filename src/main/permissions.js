const { session, systemPreferences } = require('electron');
const { isAllowedWebVoiceUrl } = require('./config');

function isTrustedWebVoiceOrigin(origin, webVoiceUrl) {
  try {
    const candidate = new URL(origin);
    const allowed = new URL(webVoiceUrl);
    return candidate.origin === allowed.origin && isAllowedWebVoiceUrl(candidate);
  } catch {
    return false;
  }
}

function isTrustedPermissionRequest(webContents, origin, details, webVoiceUrl) {
  const candidates = [
    origin,
    details?.requestingUrl,
    details?.securityOrigin,
    details?.embeddingOrigin,
    webContents?.getURL?.(),
  ].filter(Boolean);

  return candidates.some((candidate) => isTrustedWebVoiceOrigin(candidate, webVoiceUrl));
}

async function installPermissions(webVoiceUrl) {
  const ses = session.defaultSession;

  ses.setPermissionCheckHandler((webContents, permission, origin, details) => {
    if (permission !== 'media') return false;
    if (details?.mediaType === 'video') return false;
    return isTrustedPermissionRequest(webContents, origin, details, webVoiceUrl);
  });

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission !== 'media' || details?.mediaTypes?.includes('video')) {
      callback(false);
      return;
    }
    callback(isTrustedPermissionRequest(webContents, undefined, details, webVoiceUrl));
  });

  const before = systemPreferences.getMediaAccessStatus('microphone');
  const granted = before === 'granted' ? true : await systemPreferences.askForMediaAccess('microphone');
  console.log('[V2_MIC_PERMISSION]', { before, granted });
}

module.exports = { installPermissions, isTrustedWebVoiceOrigin };
