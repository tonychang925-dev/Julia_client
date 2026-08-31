const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_RAW_HOSTS = new Set(['127.0.0.1', '[::1]']);

function createEndpointPolicyError(reason, value) {
  const error = new Error(
    `Invalid Julia Brain endpoint (${reason}): ${String(value ?? '')}`
  );
  error.code = 'invalid_endpoint';
  error.reason = reason;
  return error;
}

function normalizeBrainEndpointUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw createEndpointPolicyError('empty', raw);

  const parsed = validateBrainRequestUrl(raw);
  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '');
}

function validateBrainRequestUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw createEndpointPolicyError('empty', raw);

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw createEndpointPolicyError('malformed_url', raw);
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw createEndpointPolicyError('unsupported_protocol', raw);
  }
  if (parsed.username || parsed.password) {
    throw createEndpointPolicyError('credentials_not_allowed', raw);
  }

  const authority = raw.slice(parsed.protocol.length + 2).split(/[/?#]/, 1)[0];
  const hostWithUserInfo = authority.toLowerCase();
  const hostWithPort = hostWithUserInfo.slice(
    Math.max(0, hostWithUserInfo.lastIndexOf('@') + 1)
  );
  const rawHost = parsed.port
    ? hostWithPort.slice(0, hostWithPort.length - `:${parsed.port}`.length)
    : hostWithPort;
  if (!ALLOWED_RAW_HOSTS.has(rawHost)) {
    throw createEndpointPolicyError('non_loopback_host', raw);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_RAW_HOSTS.has(hostname) && hostname !== '::1') {
    throw createEndpointPolicyError('non_loopback_host', raw);
  }

  return parsed;
}

module.exports = {
  ALLOWED_RAW_HOSTS,
  ALLOWED_PROTOCOLS,
  normalizeBrainEndpointUrl,
  validateBrainRequestUrl,
};
