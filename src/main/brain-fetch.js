function createTransportError(code, message, options = {}) {
  const error = new Error(message);
  error.code = code;
  if (options.status !== undefined) error.status = options.status;
  if (options.phase) error.phase = options.phase;
  return error;
}

function isRedirectRejection(error) {
  if (error?.code) return false;
  return [error?.message, error?.cause?.message]
    .some((message) => /redirect/i.test(String(message || '')));
}

async function brainFetch(url, init = {}) {
  try {
    return await fetch(url, { ...init, redirect: 'error' });
  } catch (error) {
    if (isRedirectRejection(error)) {
      throw createTransportError(
        'redirect_rejected',
        `Julia Brain redirect was forbidden and rejected: ${url}`
      );
    }
    throw error;
  }
}

module.exports = {
  brainFetch,
  createTransportError,
};
