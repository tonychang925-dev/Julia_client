const DEFAULT_WEB_VOICE_URL = 'http://localhost:7860';

function isLoopbackHost(hostname) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
}

function isLoopbackHttpUrl(url) {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  return parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname);
}

function isAllowedWebVoiceUrl(url) {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  if (parsed.protocol === 'https:') return true;
  if (isLoopbackHttpUrl(parsed)) return true;
  return false;
}

function getWebVoiceUrl() {
  const raw = process.env.JULIA_WEB_VOICE_URL || DEFAULT_WEB_VOICE_URL;
  const url = new URL(raw);
  if (!isAllowedWebVoiceUrl(url)) {
    throw new Error(
      `JULIA_WEB_VOICE_URL must be loopback http:// or https://, got: ${raw}`
    );
  }
  return url.toString();
}

function isAllowedLocalDevCertUrl(url) {
  const parsed = new URL(url);
  return parsed.protocol === 'https:' && isLoopbackHost(parsed.hostname);
}

module.exports = {
  DEFAULT_WEB_VOICE_URL,
  getWebVoiceUrl,
  isAllowedWebVoiceUrl,
  isAllowedLocalDevCertUrl,
  isLoopbackHost,
  isLoopbackHttpUrl,
};
