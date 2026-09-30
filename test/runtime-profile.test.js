const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBrainEndpoint,
  resolveBrainEndpoint,
} = require('../src/main/runtime-profile');

test('normalizes explicit Brain endpoints without inventing a default', () => {
  assert.equal(normalizeBrainEndpoint('http://127.0.0.1:18090/'), 'http://127.0.0.1:18090');
  assert.equal(normalizeBrainEndpoint(''), null);
});

test('fails closed when no Brain endpoint is configured', () => {
  assert.throws(
    () => resolveBrainEndpoint(null, {}),
    (error) => error.code === 'JULIA_BRAIN_ENDPOINT_NOT_CONFIGURED'
  );
});

test('desktop profile may resolve an explicitly persisted endpoint', () => {
  assert.deepEqual(resolveBrainEndpoint('http://127.0.0.1:18090', {}), {
    profile: 'desktop',
    endpoint: 'http://127.0.0.1:18090',
    source: 'settings',
  });
});

test('controlled-e2e requires an explicit environment authority', () => {
  assert.throws(
    () => resolveBrainEndpoint('http://127.0.0.1:18090', {
      JULIA_CLIENT_RUNTIME_PROFILE: 'controlled-e2e',
    }),
    (error) => error.code === 'JULIA_CONTROLLED_BRAIN_ENDPOINT_NOT_EXPLICIT'
  );
});

test('controlled-e2e rejects Normal Brain 18089', () => {
  assert.throws(
    () => resolveBrainEndpoint(null, {
      JULIA_CLIENT_RUNTIME_PROFILE: 'controlled-e2e',
      JULIA_BRAIN_ENDPOINT: 'http://127.0.0.1:18089',
    }),
    (error) => error.code === 'JULIA_CONTROLLED_E2E_NORMAL_BRAIN_FORBIDDEN'
  );
});

test('controlled-e2e accepts explicit controlled Brain 18090', () => {
  assert.deepEqual(resolveBrainEndpoint('http://127.0.0.1:18089', {
    JULIA_CLIENT_RUNTIME_PROFILE: 'controlled-e2e',
    JULIA_BRAIN_ENDPOINT: 'http://127.0.0.1:18090',
  }), {
    profile: 'controlled-e2e',
    endpoint: 'http://127.0.0.1:18090',
    source: 'environment',
  });
});
