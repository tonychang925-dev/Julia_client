const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const { brainFetch } = require('../src/main/brain-fetch');

function startServer(handler, host = '127.0.0.1') {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve(server));
  });
}

function stopServer(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

function createHitRecorder(host = '127.0.0.1') {
  const hits = [];
  const server = startServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      hits.push({ method: request.method, url: request.url, body });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
    });
  }, host);
  return { server, hits };
}

test('C1-R2 brainFetch reaches only exact loopback literals and preserves path/query', async () => {
  const recorder = await createHitRecorder();
  const server = await recorder.server;
  try {
    const response = await brainFetch(
      `http://127.0.0.1:${server.address().port}/internal/v1/probe?correlation=r2`
    );
    assert.equal(response.status, 200);
    await response.json();
    assert.deepEqual(recorder.hits.map((hit) => hit.url), [
      '/internal/v1/probe?correlation=r2',
    ]);
  } finally {
    await stopServer(server);
  }
});

test('C1-R2 brainFetch permits exact [::1] literal when IPv6 is available', async () => {
  const recorder = await createHitRecorder('::1');
  const server = await recorder.server;
  try {
    const response = await brainFetch(`http://[::1]:${server.address().port}/ipv6-probe`);
    assert.equal(response.status, 200);
    assert.deepEqual(recorder.hits.map((hit) => hit.url), ['/ipv6-probe']);
  } finally {
    await stopServer(server);
  }
});

test('C1-R2 brainFetch rejects remote and trick URLs before any network request', async () => {
  const recorder = await createHitRecorder();
  const server = await recorder.server;
  const port = server.address().port;
  const rejected = [
    'https://example.com',
    'http://192.168.1.10',
    'http://10.0.0.1',
    'http://172.16.0.1',
    'http://8.8.8.8',
    `http://localhost:${port}`,
    `http://2130706433:${port}`,
    `http://0x7f.0.0.1:${port}`,
    `http://127%2E0%2E0%2E1:${port}`,
    `http://127.0.0.1.evil.com:${port}`,
    `http://user@127.0.0.1:${port}`,
    `http://user:pass@127.0.0.1:${port}`,
    `ws://127.0.0.1:${port}`,
    `file:///etc/passwd`,
    'not a url',
    '',
  ];
  try {
    for (const url of rejected) {
      await assert.rejects(
        () => brainFetch(url),
        (error) => error.code === 'invalid_endpoint'
      );
    }
    assert.deepEqual(recorder.hits, []);
  } finally {
    await stopServer(server);
  }
});

for (const status of [301, 302, 307, 308]) {
  test(`C1-R2 brainFetch direct ${status} redirect is rejected without following`, async () => {
    const targetRecorder = await createHitRecorder();
    const target = await targetRecorder.server;
    const targetUrl = `http://127.0.0.1:${target.address().port}/never-reached`;
    const source = await startServer((_request, response) => {
      response.writeHead(status, { Location: targetUrl });
      response.end();
    });
    try {
      await assert.rejects(
        () => brainFetch(`http://127.0.0.1:${source.address().port}/redirect-source`),
        (error) => error.code === 'redirect_rejected' || error.code === 'network_error'
      );
      assert.deepEqual(targetRecorder.hits, []);
    } finally {
      await stopServer(source);
      await stopServer(target);
    }
  });
}

test('C1-R2 no generic unrestricted fetch primitive or bypass flag exists', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'brain-fetch.js'),
    'utf8'
  );
  assert.match(source, /validateBrainRequestUrl\(url\)/);
  assert.match(source, /redirect: 'error'/);
  assert.doesNotMatch(source, /skipValidation|allowRemote|rawFetch|unsafeBrainFetch|trusted\s*[:=]/);
  assert.equal((source.match(/\bfetch\s*\(/g) || []).length, 1);
});
