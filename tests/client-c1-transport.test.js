const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  normalizeBrainEndpointUrl,
} = require('../src/main/endpoint-policy');
const { SettingsStore } = require('../src/main/settings-store');
const {
  buildConversationTurnApiUrl,
  getConversationTurnApiTemplate,
  sendTextMessage,
  streamTextMessage,
} = require('../src/main/text-client');
const { getBrainStatus } = require('../src/main/brain-status');

function withEnvironment(name, value, run) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return run().finally(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

function assertPolicyReject(value) {
  assert.throws(
    () => normalizeBrainEndpointUrl(value),
    (error) => error.code === 'invalid_endpoint'
  );
}

async function assertFailure(promise, code, predicate = () => true) {
  const error = await promise.then(
    () => assert.fail(`Expected failure with code ${code}`),
    (caught) => caught
  );
  assert.equal(error.code, code);
  assert.ok(predicate(error), `Predicate failed for ${code}: ${error.message}`);
  return error;
}

function startServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function stopServer(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

test('C1-EP accepts only explicit loopback literals', () => {
  assert.equal(
    normalizeBrainEndpointUrl('http://127.0.0.1:18089'),
    'http://127.0.0.1:18089'
  );
  assert.equal(
    normalizeBrainEndpointUrl('http://[::1]:18089'),
    'http://[::1]:18089'
  );
  assert.equal(
    normalizeBrainEndpointUrl('https://127.0.0.1:8443/base'),
    'https://127.0.0.1:8443/base'
  );
});

test('C1-EP rejects localhost, remote networks, public hosts, and tricks', () => {
  const rejected = [
    'http://localhost:18089',
    'http://192.168.1.10:18089',
    'http://10.0.0.5:18089',
    'http://172.16.0.1:18089',
    'http://172.31.255.255:18089',
    'http://8.8.8.8:80',
    'http://example.com',
    'http://evil.example/redirect',
    'http://user@127.0.0.1:18089',
    'http://user:pass@127.0.0.1:18089',
    'http://127.0.0.1.evil.com',
    'http://127%2E0%2E0%2E1:18089',
    'http://0x7f.0.0.1',
    'http://2130706433',
    'http://[0000:0000:0000:0000:0000:0000:0000:0001]:18089',
    'file:///etc/passwd',
    'ftp://127.0.0.1',
    'ws://127.0.0.1:18089',
    'javascript:alert(1)',
    'data:text/plain,hello',
    'not a url',
    '',
  ];
  for (const value of rejected) assertPolicyReject(value);
});

test('C1-EP settings reject remote endpoints without silent fallback', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-c1-settings-'));
  try {
    const store = new SettingsStore(dir);
    store.load();
    assert.throws(
      () => store.updateSettings({ brainEndpoint: 'http://192.168.1.10:18089' }),
      (error) => error.code === 'invalid_endpoint'
    );
    assert.equal(store.getSettings().brainEndpoint, 'http://127.0.0.1:18089');
    assert.equal(
      JSON.parse(fs.readFileSync(store.filePath, 'utf8')).brainEndpoint,
      'http://127.0.0.1:18089'
    );

    const poisoned = new SettingsStore(dir, 'poisoned-settings.json');
    fs.writeFileSync(poisoned.filePath, JSON.stringify({
      brainEndpoint: 'http://example.com',
    }));
    assert.throws(
      () => poisoned.load(),
      (error) => error.code === 'invalid_endpoint' && /example\.com/.test(error.message)
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('C1-EP JULIA_TEXT_API_URL obeys the same policy', async () => {
  await withEnvironment('JULIA_TEXT_API_URL', 'http://127.0.0.1:19089', async () => {
    assert.equal(
      getConversationTurnApiTemplate({ brainEndpoint: 'http://127.0.0.1:18089' }),
      'http://127.0.0.1:19089/internal/v1/conversations/%7Bconversation_id%7D/turns'
    );
  });

  await withEnvironment('JULIA_TEXT_API_URL', 'http://example.com', async () => {
    assert.throws(
      () => getConversationTurnApiTemplate({ brainEndpoint: 'http://127.0.0.1:18089' }),
      (error) => error.code === 'invalid_endpoint'
    );
    let requests = 0;
    const server = await startServer(() => { requests += 1; });
    try {
      await assertFailure(
        sendTextMessage({
          conversationId: 'conv-A', turnId: 'turn-1', input: 'hello',
        }, { brainEndpoint: `http://127.0.0.1:${server.address().port}` }),
        'invalid_endpoint'
      );
      assert.equal(requests, 0);
    } finally {
      await stopServer(server);
    }
  });

  await withEnvironment('JULIA_TEXT_API_URL', 'http://[::ffff:127.0.0.1]:19089', async () => {
    assert.throws(
      () => getConversationTurnApiTemplate({}),
      (error) => error.code === 'invalid_endpoint'
    );
  });

  await withEnvironment('JULIA_TEXT_API_URL', '://malformed', async () => {
    assert.throws(
      () => getConversationTurnApiTemplate({}),
      (error) => error.code === 'invalid_endpoint'
    );
  });
});

test('C1-EP brain health rejects remote endpoints', async () => {
  await assertFailure(
    getBrainStatus('http://example.com'),
    'invalid_endpoint'
  );
});

test('C1-TO non-stream request times out when the server never responds', async () => {
  const server = await startServer(() => {});
  try {
    await assertFailure(
      sendTextMessage({
        conversationId: 'conv-A', turnId: 'turn-timeout', input: 'hello',
      }, {
        brainEndpoint: `http://127.0.0.1:${server.address().port}`,
        timeoutMs: 120,
      }),
      'request_timeout'
    );
  } finally {
    await stopServer(server);
  }
});

test('C1-TO stream times out after headers stall', async () => {
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.flushHeaders();
  });
  try {
    await assertFailure(
      streamTextMessage({
        conversationId: 'conv-A', turnId: 'turn-headers-stall', input: 'hello',
      }, {}, {
        brainEndpoint: `http://127.0.0.1:${server.address().port}`,
        streamIdleTimeoutMs: 120,
      }),
      'request_timeout',
      (error) => error.phase === 'stream_idle'
    );
  } finally {
    await stopServer(server);
  }
});

test('C1-TO non-stream request times out after headers then body stall', async () => {
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.flushHeaders();
  });
  try {
    await assertFailure(
      sendTextMessage({
        conversationId: 'conv-A', turnId: 'turn-body-stall', input: 'hello',
      }, {
        brainEndpoint: `http://127.0.0.1:${server.address().port}`,
        timeoutMs: 120,
      }),
      'request_timeout'
    );
  } finally {
    await stopServer(server);
  }
});

test('C1-TO stream times out after first delta then stall', async () => {
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n\n');
  });
  const deltas = [];
  try {
    await assertFailure(
      streamTextMessage({
        conversationId: 'conv-A', turnId: 'turn-delta-stall', input: 'hello',
      }, { onDelta: (delta) => deltas.push(delta) }, {
        brainEndpoint: `http://127.0.0.1:${server.address().port}`,
        streamIdleTimeoutMs: 120,
      }),
      'request_timeout',
      (error) => error.phase === 'stream_idle'
    );
    assert.deepEqual(deltas, ['partial']);
  } finally {
    await stopServer(server);
  }
});

test('C1-TO connection refused is a network error', async () => {
  await assertFailure(
    sendTextMessage({
      conversationId: 'conv-A', turnId: 'turn-refused', input: 'hello',
    }, { brainEndpoint: 'http://127.0.0.1:1' }),
    'network_error'
  );
});

test('C1-TO HTTP 500 is an HTTP error, not completion', async () => {
  const server = await startServer((_request, response) => {
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'provider_down' }));
  });
  try {
    await assertFailure(
      sendTextMessage({
        conversationId: 'conv-A', turnId: 'turn-http', input: 'hello',
      }, { brainEndpoint: `http://127.0.0.1:${server.address().port}` }),
      'http_error',
      (error) => error.status === 500
    );
  } finally {
    await stopServer(server);
  }
});

test('C1-TO SSE semantic error stays a semantic error', async () => {
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(
      'data: {"choices":[{"delta":{"content":"turn failed"},"finish_reason":"error"}]}\n\n'
      + 'data: [DONE]\n\n'
    );
  });
  try {
    await assertFailure(
      streamTextMessage({
        conversationId: 'conv-A', turnId: 'turn-sse-error', input: 'hello',
      }, {}, { brainEndpoint: `http://127.0.0.1:${server.address().port}` }),
      'stream_semantic_error'
    );
  } finally {
    await stopServer(server);
  }
});

test('C1-TO missing SSE completion marker is a protocol error', async () => {
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(
      'data: {"choices":[{"delta":{"content":"no marker"},"finish_reason":null}]}\n\n'
    );
  });
  try {
    await assertFailure(
      streamTextMessage({
        conversationId: 'conv-A', turnId: 'turn-no-done', input: 'hello',
      }, {}, { brainEndpoint: `http://127.0.0.1:${server.address().port}` }),
      'stream_protocol_error'
    );
  } finally {
    await stopServer(server);
  }
});

test('C1-TO external abort is distinct from timeout', async () => {
  const controller = new AbortController();
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n\n');
  });
  setTimeout(() => controller.abort(), 60);
  try {
    await assertFailure(
      streamTextMessage({
        conversationId: 'conv-A', turnId: 'turn-abort', input: 'hello',
      }, {}, {
        brainEndpoint: `http://127.0.0.1:${server.address().port}`,
        signal: controller.signal,
      }),
      'request_aborted'
    );
  } finally {
    await stopServer(server);
  }
});

test('C1-SSE preserves ordered deltas, completion, and correlation with tightened timeouts', async () => {
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(
      'data: {"choices":[{"delta":{"content":"Julia "},"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"delta":{"content":"continues"},"finish_reason":null}]}\n\n'
      + 'data: [DONE]\n\n'
    );
  });
  const deltas = [];
  try {
    const result = await streamTextMessage({
      conversationId: 'conv-A', turnId: 'turn-sse-ok', input: 'continue',
    }, { onDelta: (delta) => deltas.push(delta) }, {
      brainEndpoint: `http://127.0.0.1:${server.address().port}`,
      connectTimeoutMs: 5000,
      streamIdleTimeoutMs: 5000,
      streamTotalTimeoutMs: 10000,
    });
    assert.deepEqual(deltas, ['Julia ', 'continues']);
    assert.equal(result.conversation_id, 'conv-A');
    assert.equal(result.turn_id, 'turn-sse-ok');
    assert.equal(result.content, 'Julia continues');
    assert.equal(result.status, 'completed');
  } finally {
    await stopServer(server);
  }
});
