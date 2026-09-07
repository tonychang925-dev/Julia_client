const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTextApiUrl, getTextApiUrl } = require('../src/main/text-client');

function withEnv(patch, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('builds OpenAI-style text endpoint from the authoritative Brain endpoint', () => {
  assert.equal(
    buildTextApiUrl('http://127.0.0.1:18090'),
    'http://127.0.0.1:18090/v1/chat/completions'
  );
});

test('forbids JULIA_TEXT_API_URL as an alternate critical authority', () => {
  withEnv({ JULIA_TEXT_API_URL: 'http://127.0.0.1:18089/v1/chat/completions' }, () => {
    assert.throws(
      () => getTextApiUrl({ brainEndpoint: 'http://127.0.0.1:18090' }),
      (error) => error.code === 'JULIA_TEXT_API_URL_FORBIDDEN'
    );
  });
});

test('controlled-e2e text requests resolve to explicit controlled Brain', () => {
  withEnv({
    JULIA_TEXT_API_URL: undefined,
    JULIA_CLIENT_RUNTIME_PROFILE: 'controlled-e2e',
    JULIA_BRAIN_ENDPOINT: 'http://127.0.0.1:18090',
  }, () => {
    assert.equal(
      getTextApiUrl({ brainEndpoint: 'http://127.0.0.1:18089' }),
      'http://127.0.0.1:18090/v1/chat/completions'
    );
  });
});
