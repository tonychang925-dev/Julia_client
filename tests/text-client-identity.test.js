const assert = require('node:assert/strict');
const test = require('node:test');

const { parseOpenAiSseChunk, streamTextMessage } = require('../src/main/text-client');

function startServer(handler) {
  return new Promise((resolve) => {
    const server = require('node:http').createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('text stream transports client conversation and renderer turn identity', async () => {
  let requestBody;
  const server = await startServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requestBody = JSON.parse(body);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(
        'data: {"conversation_id":"conv-client","turn_id":"turn-visible","choices":[{"delta":{"content":"Hi"}}]}\n\n'
        + 'data: [DONE]\n\n'
      );
    });
  });

  try {
    const result = await streamTextMessage({
      conversationId: 'conv-client',
      turnId: 'turn-visible',
      text: 'hello',
    }, {}, { brainEndpoint: `http://127.0.0.1:${server.address().port}` });

    assert.equal(requestBody.conversation_id, 'conv-client');
    assert.equal(requestBody.turn_id, 'turn-visible');
    assert.equal(result.conversation_id, 'conv-client');
    assert.equal(result.turn_id, 'turn-visible');
    assert.equal(result.content, 'Hi');
  } finally {
    server.close();
  }
});

test('top-level SSE error becomes a terminal typed semantic failure', async () => {
  const deltas = [];
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(
      'data: {"error":{"message":"Core turn failed","type":"core_execution_error","code":"core_execution_failed"}}\n\n'
    );
  });

  try {
    await assert.rejects(
      streamTextMessage({
        conversationId: 'conv-client',
        turnId: 'turn-visible',
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

test('SSE parser preserves top-level typed error objects', () => {
  const parsed = parseOpenAiSseChunk(
    'data: {"error":{"message":"failed","type":"core_error","code":"core_failed"}}'
  );
  assert.deepEqual(parsed.error, {
    message: 'failed',
    type: 'core_error',
    code: 'core_failed',
  });
});
