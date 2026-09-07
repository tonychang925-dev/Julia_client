const CONTROLLED_E2E_PROFILE = 'controlled-e2e';
const DESKTOP_PROFILE = 'desktop';
const NORMAL_BRAIN_PORT = '18089';

function runtimeBindingError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeBrainEndpoint(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw runtimeBindingError(
      'JULIA_BRAIN_ENDPOINT_INVALID',
      'Julia Brain endpoint must be http:// or https://'
    );
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function getClientRuntimeProfile(env = process.env) {
  const profile = String(env.JULIA_CLIENT_RUNTIME_PROFILE || DESKTOP_PROFILE).trim();
  if (![DESKTOP_PROFILE, CONTROLLED_E2E_PROFILE].includes(profile)) {
    throw runtimeBindingError(
      'JULIA_CLIENT_RUNTIME_PROFILE_INVALID',
      `Unsupported Julia client runtime profile: ${profile}`
    );
  }
  return profile;
}

function isLoopbackNormalBrain(endpoint) {
  const parsed = new URL(endpoint);
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname);
  return loopback && parsed.port === NORMAL_BRAIN_PORT;
}

function resolveBrainEndpoint(settingsEndpoint, env = process.env) {
  const profile = getClientRuntimeProfile(env);
  const explicitEndpoint = normalizeBrainEndpoint(env.JULIA_BRAIN_ENDPOINT);
  const persistedEndpoint = normalizeBrainEndpoint(settingsEndpoint);
  const endpoint = explicitEndpoint || persistedEndpoint;

  if (!endpoint) {
    throw runtimeBindingError(
      'JULIA_BRAIN_ENDPOINT_NOT_CONFIGURED',
      'Julia Brain endpoint is not configured'
    );
  }

  if (profile === CONTROLLED_E2E_PROFILE) {
    if (!explicitEndpoint) {
      throw runtimeBindingError(
        'JULIA_CONTROLLED_BRAIN_ENDPOINT_NOT_EXPLICIT',
        'controlled-e2e requires explicit JULIA_BRAIN_ENDPOINT'
      );
    }
    if (isLoopbackNormalBrain(endpoint)) {
      throw runtimeBindingError(
        'JULIA_CONTROLLED_E2E_NORMAL_BRAIN_FORBIDDEN',
        'controlled-e2e must not use Normal Brain 127.0.0.1:18089'
      );
    }
  }

  return {
    profile,
    endpoint,
    source: explicitEndpoint ? 'environment' : 'settings',
  };
}

module.exports = {
  CONTROLLED_E2E_PROFILE,
  DESKTOP_PROFILE,
  getClientRuntimeProfile,
  isLoopbackNormalBrain,
  normalizeBrainEndpoint,
  resolveBrainEndpoint,
};
