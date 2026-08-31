const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const {
  getConversationTurnApiTemplate,
  sendTextMessage,
} = require('../src/main/text-client');

const ENV_KEY = 'JULIA_TEXT_API_URL';

function withEnvironment(name, value, run) {
  const hadKey = Object.prototype.hasOwnProperty.call(process.env, name);
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return run().finally(() => {
    if (!hadKey) delete process.env[name];
    else process.env[name] = previous;
  });
}

function startBrainCompatibleServer() {
  const hits = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const parsed = JSON.parse(body);
      hits.push({ method: request.method, url: request.url, body: parsed });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        conversation_id: parsed.conversation_id_hint || 'conv-A',
        turn_id: parsed.turn_id,
        content: 'Julia remembers',
        status: 'completed',
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, hits }));
  });
}

function stopServer(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

async function assertSendFailure(endpoint, expectedCode) {
  await assert.rejects(
    () => sendTextMessage({
      conversationId: 'conv-A', turnId: 'turn-env', modality: 'text', input: 'hello',
    }, { brainEndpoint: endpoint }),
    (error) => error.code === expectedCode
  );
}

test('C1-R3 present-but-empty JULIA_TEXT_API_URL is invalid and never falls back', async () => {
  const fallback = await startBrainCompatibleServer();
  try {
    for (const value of ['', ' ', '   ', '\t']) {
      await withEnvironment(ENV_KEY, value, async () => {
        await assertSendFailure(
          `http://127.0.0.1:${fallback.server.address().port}`,
          'invalid_endpoint'
        );
        assert.throws(
          () => getConversationTurnApiTemplate({
            brainEndpoint: `http://127.0.0.1:${fallback.server.address().port}`,
          }),
          (error) => error.code === 'invalid_endpoint'
        );
      });
    }
    assert.deepEqual(fallback.hits, []);
  } finally {
    await stopServer(fallback.server);
  }
});

test('C1-R3 invalid present JULIA_TEXT_API_URL never falls back', async () => {
  const fallback = await startBrainCompatibleServer();
  const port = fallback.server.address().port;
  const overrides = [
    'https://example.com',
    `http://localhost:${port}`,
    'http://192.168.1.10',
    'http://8.8.8.8',
    `http://2130706433:${port}`,
    `http://0x7f.0.0.1:${port}`,
    `http://127%2E0%2E0%2E1:${port}`,
    'http://127.0.0.1.evil.com',
    `http://user@127.0.0.1:${port}`,
    `ws://127.0.0.1:${port}`,
    'file:///etc/passwd',
    '://malformed',
  ];
  try {
    for (const value of overrides) {
      await withEnvironment(ENV_KEY, value, async () => {
        await assertSendFailure(`http://127.0.0.1:${port}`, 'invalid_endpoint');
        assert.throws(
          () => getConversationTurnApiTemplate({ brainEndpoint: `http://127.0.0.1:${port}` }),
          (error) => error.code === 'invalid_endpoint'
        );
      });
    }
    assert.deepEqual(fallback.hits, []);
  } finally {
    await stopServer(fallback.server);
  }
});

test('C1-R3 valid present JULIA_TEXT_API_URL overrides options endpoint', async () => {
  const primary = await startBrainCompatibleServer();
  const secondary = await startBrainCompatibleServer();
  try {
    await withEnvironment(
      ENV_KEY,
      `http://127.0.0.1:${primary.server.address().port}`,
      async () => {
        const result = await sendTextMessage({
          conversationId: 'conv-A', turnId: 'turn-env', modality: 'text', input: 'hello',
        }, { brainEndpoint: `http://127.0.0.1:${secondary.server.address().port}` });
        assert.equal(result.content, 'Julia remembers');
        assert.equal(primary.hits.length, 1);
        assert.equal(primary.hits[0].url, '/internal/v1/conversations/conv-A/turns');
        assert.deepEqual(secondary.hits, []);
        assert.equal(
          getConversationTurnApiTemplate({
            brainEndpoint: `http://127.0.0.1:${secondary.server.address().port}`,
          }),
          `http://127.0.0.1:${primary.server.address().port}/internal/v1/conversations/%7Bconversation_id%7D/turns`
        );
      }
    );
  } finally {
    await stopServer(primary.server);
    await stopServer(secondary.server);
  }
});

test('C1-R3 absent JULIA_TEXT_API_URL uses options endpoint by explicit deletion', async () => {
  const fallback = await startBrainCompatibleServer();
  try {
    await withEnvironment(ENV_KEY, undefined, async () => {
      assert.equal(Object.prototype.hasOwnProperty.call(process.env, ENV_KEY), false);
      const result = await sendTextMessage({
        conversationId: 'conv-A', turnId: 'turn-env', modality: 'text', input: 'hello',
      }, { brainEndpoint: `http://127.0.0.1:${fallback.server.address().port}` });
      assert.equal(result.content, 'Julia remembers');
      assert.equal(fallback.hits.length, 1);
      assert.equal(fallback.hits[0].url, '/internal/v1/conversations/conv-A/turns');
      assert.equal(
        getConversationTurnApiTemplate({
          brainEndpoint: `http://127.0.0.1:${fallback.server.address().port}`,
        }),
        `http://127.0.0.1:${fallback.server.address().port}/internal/v1/conversations/%7Bconversation_id%7D/turns`
      );
    });
  } finally {
    await stopServer(fallback.server);
  }
});

test('C1-R3 text endpoint selection no longer uses env truthiness or env-or-fallback', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'text-client.js'),
    'utf8'
  );
  assert.doesNotMatch(source, /if\s*\(\s*process\.env\.JULIA_TEXT_API_URL\s*\)/);
  assert.doesNotMatch(source, /process\.env\.JULIA_TEXT_API_URL\s*\|\|/);
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(\s*process\.env,\s*'JULIA_TEXT_API_URL'/);
});
