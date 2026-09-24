const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { streamTextMessage } = require('../src/main/text-client');

const repositoryRoot = path.join(__dirname, '..');

function startServer(handler) {
  return new Promise((resolve) => {
    const server = require('node:http').createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function sseFrame(data) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function exerciseStream(frames, expectedCode = null) {
  let requestBody;
  const server = await startServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requestBody = JSON.parse(body);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(frames.join(''));
    });
  });

  const input = {
    conversationId: 'conv-client-owned',
    turnId: 'turn-renderer-visible',
    text: 'hello',
  };
  const options = { brainEndpoint: `http://127.0.0.1:${server.address().port}` };

  try {
    if (expectedCode) {
      await assert.rejects(
        () => streamTextMessage(input, {}, options),
        (error) => error.code === expectedCode
      );
      return requestBody;
    }
    const result = await streamTextMessage(input, {}, options);
    return { requestBody, result };
  } finally {
    server.close();
  }
}

test('T1 correct conversation and turn echo passes', async () => {
  const { requestBody, result } = await exerciseStream([
    sseFrame({
      conversation_id: 'conv-client-owned',
      turn_id: 'turn-renderer-visible',
      choices: [{ delta: { content: 'Hi' } }],
    }),
    'data: [DONE]\n\n',
  ]);

  assert.equal(requestBody.conversation_id, 'conv-client-owned');
  assert.equal(requestBody.turn_id, 'turn-renderer-visible');
  assert.equal(result.conversation_id, 'conv-client-owned');
  assert.equal(result.turn_id, 'turn-renderer-visible');
  assert.equal(result.content, 'Hi');
});

test('T2 missing conversation echo fails closed', async () => {
  await exerciseStream([
    sseFrame({
      turn_id: 'turn-renderer-visible',
      choices: [{ delta: { content: 'Hi' } }],
    }),
    'data: [DONE]\n\n',
  ], 'missing_conversation_echo');
});

test('T3 missing turn echo fails closed', async () => {
  await exerciseStream([
    sseFrame({
      conversation_id: 'conv-client-owned',
      choices: [{ delta: { content: 'Hi' } }],
    }),
    'data: [DONE]\n\n',
  ], 'missing_turn_echo');
});

test('T4 wrong conversation echo fails closed', async () => {
  await exerciseStream([
    sseFrame({
      conversation_id: 'conv-server-other',
      turn_id: 'turn-renderer-visible',
      choices: [{ delta: { content: 'Hi' } }],
    }),
    'data: [DONE]\n\n',
  ], 'conversation_echo_mismatch');
});

test('T5 wrong turn echo fails closed', async () => {
  await exerciseStream([
    sseFrame({
      conversation_id: 'conv-client-owned',
      turn_id: 'turn-server-other',
      choices: [{ delta: { content: 'Hi' } }],
    }),
    'data: [DONE]\n\n',
  ], 'turn_echo_mismatch');
});

test('T6 top-level typed SSE error remains terminal', async () => {
  const deltas = [];
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(sseFrame({
      error: {
        message: 'Core turn failed',
        type: 'core_execution_error',
        code: 'core_execution_failed',
      },
    }));
  });

  try {
    await assert.rejects(
      () => streamTextMessage({
        conversationId: 'conv-client-owned',
        turnId: 'turn-renderer-visible',
        text: 'hello',
      }, { onDelta: (delta) => deltas.push(delta) }, {
        brainEndpoint: `http://127.0.0.1:${server.address().port}`,
      }),
      (error) => error.code === 'stream_semantic_error'
        && error.message === 'Core turn failed'
        && error.serverErrorType === 'core_execution_error'
        && error.serverErrorCode === 'core_execution_failed'
    );
    assert.deepEqual(deltas, []);
  } finally {
    server.close();
  }
});

async function loadPreloadApi(invoke) {
  const source = fs.readFileSync(path.join(repositoryRoot, 'src/preload/index.js'), 'utf8');
  let exposedApi;
  const electronStub = {
    contextBridge: {
      exposeInMainWorld: (_name, api) => { exposedApi = api; },
    },
    ipcRenderer: {
      invoke,
      on: () => {},
      removeListener: () => {},
    },
  };
  vm.runInNewContext(source, {
    require: (id) => (id === 'electron' ? electronStub : require(id)),
  });
  return exposedApi;
}

test('T7 and T8 renderer requestId and ConversationStore conversationId survive the product seam', async () => {
  const ipcCalls = [];
  const preloadApi = await loadPreloadApi(async (channel, payload) => {
    ipcCalls.push({ channel, payload });
    return {};
  });

  const requestId = 'turn-renderer-visible';
  const conversationId = 'conv-client-owned';
  const text = 'hello';
  await preloadApi.streamTextMessage(requestId, conversationId, text);

  assert.equal(ipcCalls.length, 1);
  assert.equal(ipcCalls[0].channel, 'julia:text:stream');
  assert.equal(ipcCalls[0].payload.requestId, requestId);
  assert.equal(ipcCalls[0].payload.turnId, requestId);
  assert.equal(ipcCalls[0].payload.conversationId, conversationId);

  let requestBody;
  const server = await startServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requestBody = JSON.parse(body);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end([
        sseFrame({
          conversation_id: conversationId,
          turn_id: requestId,
          choices: [{ delta: { content: 'Hi' } }],
        }),
        'data: [DONE]\n\n',
      ].join(''));
    });
  });

  try {
    const result = await streamTextMessage(
      ipcCalls[0].payload,
      {},
      { brainEndpoint: `http://127.0.0.1:${server.address().port}` }
    );
    assert.equal(result.content, 'Hi');
    assert.equal(requestBody.conversation_id, conversationId);
    assert.equal(requestBody.turn_id, requestId);
  } finally {
    server.close();
  }
});

test('main IPC preserves renderer identities without regeneration', () => {
  const source = fs.readFileSync(path.join(repositoryRoot, 'src/main/main.js'), 'utf8');
  assert.match(source, /input\?\.turnId !== input\?\.requestId/);
  assert.match(source, /await streamTextMessage\(\s*input,/);
});
