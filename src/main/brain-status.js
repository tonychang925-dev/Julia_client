function buildBrainHealthUrl(brainEndpoint) {
  return new URL('/internal/v1/voice/health', brainEndpoint).toString();
}

async function getBrainStatus(brainEndpoint, timeoutMs = 2500) {
  const healthUrl = buildBrainHealthUrl(brainEndpoint);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        connected: false,
        endpoint: brainEndpoint,
        healthUrl,
        status: 'offline',
        error: `HTTP ${response.status}`,
        checked_at: new Date().toISOString(),
      };
    }

    const data = await response.json();
    return {
      connected: data?.status === 'ok',
      endpoint: brainEndpoint,
      healthUrl,
      status: data?.status || 'unknown',
      contract_version: data?.contract_version || null,
      julia_core: data?.julia_core || null,
      service_version: data?.service_version || data?.version || null,
      architecture_version: data?.architecture_version || data?.architecture || null,
      build: data?.build || data?.build_id || null,
      commit: data?.commit || data?.git_commit || null,
      checked_at: new Date().toISOString(),
      raw: data && typeof data === 'object' ? data : {},
    };
  } catch (error) {
    return {
      connected: false,
      endpoint: brainEndpoint,
      healthUrl,
      status: 'offline',
      error: error.name === 'AbortError' ? 'timeout' : error.message,
      checked_at: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  buildBrainHealthUrl,
  getBrainStatus,
};
