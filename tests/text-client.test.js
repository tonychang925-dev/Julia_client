const test = require('node:test');
const assert = require('node:assert/strict');
const { streamTextMessage } = require('../src/main/text-client');

function sseResponse(chunks) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (index >= chunks.length) return { done: true };
          const value = encoder.encode(chunks[index++]);
          return { done: false, value };
        },
      }),
    },
  };
}

test('ordinary text stream remains unchanged without product metadata', async () => {
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return sseResponse([
      'data: {"choices":[{"delta":{"content":"hello "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
    ]);
  };

  try {
    const deltas = [];
    const result = await streamTextMessage({ text: 'ordinary' }, {
      onDelta: (delta, content) => deltas.push({ delta, content }),
    });

    assert.deepEqual(deltas, [
      { delta: 'hello ', content: 'hello ' },
      { delta: 'world', content: 'hello world' },
    ]);
    assert.equal(result.content, 'hello world');
    assert.equal(result.metadata, undefined);
    assert.equal(requestBody.stream, true);
    assert.equal(requestBody.conversation_id, undefined);
    assert.equal(requestBody.turn_id, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test('stream request carries canonical conversation and turn identity without history', async () => {
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n']);
  };

  try {
    await streamTextMessage({
      text: 'with identity',
      conversation_id: 'conv-1',
      turn_id: 'turn-1',
    });
    assert.equal(requestBody.conversation_id, 'conv-1');
    assert.equal(requestBody.turn_id, 'turn-1');
    assert.deepEqual(requestBody.messages, [{ role: 'user', content: 'with identity' }]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('product events stream separately and terminal metadata remains structured', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => sseResponse([
    'data: {"product":{"contract_version":"julia.product.events.v1","events":[{"type":"capability.started","turn_id":"turn-1"}]},"choices":[{"delta":{"content":"working"}}]}\n\n',
    'data: {"product":{"contract_version":"julia.product.events.v1","events":[{"type":"capability.completed","turn_id":"turn-1"}],"research_brief":{"contract_version":"research.brief.v1"},"trace":{"turn_id":"turn-1"}},"choices":[{"delta":{"content":" done"}}]}\n\n',
  ]);

  try {
    const events = [];
    const result = await streamTextMessage({ text: 'research' }, {
      onProductEvent: (event) => events.push(event),
    });

    assert.deepEqual(events.map((event) => event.type), [
      'capability.started',
      'capability.completed',
    ]);
    assert.equal(result.content, 'working done');
    assert.equal(result.metadata.contract_version, 'julia.product.events.v1');
    assert.deepEqual(result.metadata.events.map((event) => event.type), [
      'capability.started',
      'capability.completed',
    ]);
    assert.equal(result.metadata.trace.turn_id, 'turn-1');
  } finally {
    global.fetch = originalFetch;
  }
});

test('unsupported product metadata version fails closed', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => sseResponse([
    'data: {"product":{"contract_version":"unknown.v1","events":[]},"choices":[{"delta":{"content":"bad"}}]}\n\n',
  ]);

  try {
    await assert.rejects(
      () => streamTextMessage({ text: 'bad metadata' }),
      /Unsupported product metadata contract version/
    );
  } finally {
    global.fetch = originalFetch;
  }
});
