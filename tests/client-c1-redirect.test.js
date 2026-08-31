const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { getBrainStatus } = require('../src/main/brain-status');
const {
  createConversationViaCore,
  deleteConversationViaCore,
  getConversationDetail,
  getConversationMessages,
  listConversationsViaCore,
  renameConversationViaCore,
  sendTextMessage,
  streamTextMessage,
} = require('../src/main/text-client');

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

async function assertFailure(promise, code) {
  const error = await promise.then(
    () => assert.fail(`Expected failure with code ${code}`),
    (caught) => caught
  );
  assert.equal(error.code, code);
  return error;
}

async function withRedirectPair(status) {
  const targetHits = [];
  const target = await startServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      targetHits.push({ method: request.method, url: request.url, body });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
    });
  });
  const targetUrl = `http://127.0.0.1:${target.address().port}/redirect-target`;
  const sourceHits = [];
  const source = await startServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      sourceHits.push({ method: request.method, url: request.url, body });
      response.writeHead(status, { Location: targetUrl });
      response.end();
    });
  });
  return {
    source,
    target,
    sourceHits,
    targetHits,
    endpoint: `http://127.0.0.1:${source.address().port}`,
    async close() {
      await stopServer(source);
      await stopServer(target);
    },
  };
}

function postBodyContains(bodies, needle) {
  return bodies.some((body) => body.includes(needle));
}

for (const status of [301, 302, 307, 308]) {
  test(`C1-R1 ${status} redirect is rejected on every Brain surface and target receives zero requests`, async () => {
    const pair = await withRedirectPair(status);
    try {
      const health = await getBrainStatus(pair.endpoint);
      assert.equal(health.connected, false);
      assert.equal(health.status, 'offline');
      assert.equal(health.code, 'redirect_rejected');

      await assertFailure(listConversationsViaCore({ brainEndpoint: pair.endpoint }), 'redirect_rejected');
      await assertFailure(getConversationDetail('conv-A', { brainEndpoint: pair.endpoint }), 'redirect_rejected');
      await assertFailure(getConversationMessages('conv-A', { brainEndpoint: pair.endpoint }), 'redirect_rejected');
      await assertFailure(createConversationViaCore('Redirected', { brainEndpoint: pair.endpoint }), 'redirect_rejected');
      await assertFailure(renameConversationViaCore('conv-A', 'Redirected', { brainEndpoint: pair.endpoint }), 'redirect_rejected');
      await assertFailure(deleteConversationViaCore('conv-A', { brainEndpoint: pair.endpoint }), 'redirect_rejected');
      await assertFailure(sendTextMessage({
        conversationId: 'conv-A', turnId: 'turn-redirect', input: 'secret-post-body',
      }, { brainEndpoint: pair.endpoint }), 'redirect_rejected');
      await assertFailure(streamTextMessage({
        conversationId: 'conv-A', turnId: 'turn-redirect-stream', input: 'secret-stream-body',
      }, {}, { brainEndpoint: pair.endpoint }), 'redirect_rejected');

      assert.deepEqual(pair.targetHits, []);
      assert.ok(pair.sourceHits.length >= 9);
      const postBodies = pair.sourceHits
        .filter((hit) => hit.method === 'POST')
        .map((hit) => hit.body);
      assert.ok(postBodies.length >= 3);
      assert.ok(postBodyContains(postBodies, 'turn-redirect'));
      assert.ok(postBodyContains(postBodies, 'turn-redirect-stream'));
      assert.equal(pair.sourceHits.some((hit) => hit.url.includes('/redirect-target')), false);
    } finally {
      await pair.close();
    }
  });
}
