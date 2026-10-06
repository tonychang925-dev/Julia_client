'use strict';
// #237 P1: live acceptance scripts may only target an explicitly provided, non-production brain.
const PRODUCTION_PORT = 18089;

function assertNotProduction(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch (e) {
    throw new Error(`invalid brain url: ${urlString}`);
  }
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (Number(port) === PRODUCTION_PORT) {
    throw new Error(`refusing to use the production brain (port ${PRODUCTION_PORT}) in a test: ${urlString}`);
  }
}

// The base url comes only from JULIA_TEST_BRAIN_URL (an isolated brain); there is no default.
function resolveTestBrain(env = process.env) {
  const value = env.JULIA_TEST_BRAIN_URL;
  if (!value) return null;
  assertNotProduction(value);
  return value.replace(/\/+$/, '');
}

module.exports = { PRODUCTION_PORT, assertNotProduction, resolveTestBrain };
