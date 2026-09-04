const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

global.window = {};

const { sendTextMessage, streamTextMessage } = require('../src/main/text-client');
const { normalizeProductMetadata } = require('../src/main/product-metadata');
const {
  renderProductStatus,
  renderResearchBrief,
  validateProductMetadata,
  validateResearchBrief,
} = require('../src/renderer/shell/product-projection');

class FakeElement {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.textContent = '';
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
}

function fixtureBrief() {
  return {
    contract_version: 'research.brief.v1',
    brief_id: 'brief-1',
    event_title: 'Canonical Market event',
    headline: 'Preliminary: source-bound evidence supports a policy linkage.',
    executive_summary: 'The linkage is preliminary and remains unproven.',
    what_happened: 'Canonical market description <img src=x onerror=alert(1)>',
    why_it_matters: 'The linkage may broaden if official confirmation arrives.',
    key_drivers: [{ support_level: 'SOURCE_VERIFIED_SUPPORT' }],
    evidence_snapshot: [{ state: 'SOURCE_VERIFIED_SUPPORT' }],
    contradictions: ['One report narrows the policy scope.'],
    uncertainties: ['search completeness not proven'],
    what_to_watch: ['Watch for official confirmation.'],
    confidence: 0.72,
    reasoning_limits: ['NO_MODEL_SYNTHESIS'],
    source_refs: ['source-1'],
    trace: {
      judgment_id: 'judgment-1',
      market_event_id: 501,
      capability_request_id: 'request-1',
      capability_call_id: 'call-1',
      correlation_id: 'correlation-1',
      evidence_refs: 'ev-1',
      source_record_refs: 'source-1',
    },
  };
}

function startFixtureServer(responses) {
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const parsed = JSON.parse(body);
      const output = responses(parsed, request);
      response.writeHead(200, {
        'Content-Type': parsed.stream ? 'text/event-stream' : 'application/json',
      });
      response.end(output);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    .then(() => server);
}

async function stopFixtureServer(server) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

test('L0A-F2 ordinary text preserves the canonical conversation stream', async () => {
  let observed;
  const server = await startFixtureServer((body, request) => {
    observed = { body, url: request.url };
    return 'data: {"choices":[{"delta":{"content":"ordinary "}}]}\n\n'
      + 'data: {"choices":[{"delta":{"content":"text"}}]}\n\n'
      + 'data: [DONE]\n\n';
  });

  try {
    const deltas = [];
    const result = await streamTextMessage(
      { conversationId: 'conv-A', turnId: 'turn-A', modality: 'text', input: 'ordinary' },
      { onDelta: (delta) => deltas.push(delta) },
      { brainEndpoint: `http://127.0.0.1:${server.address().port}` }
    );

    assert.equal(observed.url, '/internal/v1/conversations/conv-A/turns');
    assert.deepEqual(observed.body, {
      turn_id: 'turn-A', modality: 'text', input: 'ordinary', stream: true,
    });
    assert.deepEqual(deltas, ['ordinary ', 'text']);
    assert.equal(result.content, 'ordinary text');
    assert.equal(result.conversation_id, 'conv-A');
    assert.equal(result.turn_id, 'turn-A');
    assert.equal(result.metadata, undefined);
  } finally {
    await stopFixtureServer(server);
  }
});

test('L0A-F2 structured product events remain separate from transcript text', async () => {
  const server = await startFixtureServer(() => (
    'data: {"product":{"contract_version":"julia.product.events.v1","events":[{"type":"capability.started","conversation_id":"conv-A","turn_id":"turn-A","capability_request_id":"request-1","correlation_id":"correlation-1"}]},"choices":[{"delta":{"content":"Julia "}}]}\n\n'
    + 'data: {"product":{"contract_version":"julia.product.events.v1","events":[{"type":"capability.completed","conversation_id":"conv-A","turn_id":"turn-A","capability_call_id":"call-1"}],"research_brief":'
    + JSON.stringify(fixtureBrief())
    + ',"trace":{"judgment_id":"judgment-1","market_event_id":501,"capability_request_id":"request-1","capability_call_id":"call-1","correlation_id":"correlation-1"}},"choices":[{"delta":{"content":"responds"}}]}\n\n'
    + 'data: [DONE]\n\n'
  ));

  try {
    const productEvents = [];
    const result = await streamTextMessage(
      { conversationId: 'conv-A', turnId: 'turn-A', modality: 'text', input: 'research' },
      { onProductEvent: (event) => productEvents.push(event) },
      { brainEndpoint: `http://127.0.0.1:${server.address().port}` }
    );

    assert.equal(result.content, 'Julia responds');
    assert.deepEqual(productEvents.map((event) => event.type), [
      'capability.started', 'capability.completed',
    ]);
    assert.equal(result.metadata.contract_version, 'julia.product.events.v1');
    assert.equal(result.metadata.research_brief.brief_id, 'brief-1');
    assert.equal(result.metadata.trace.correlation_id, 'correlation-1');
    assert.equal(productEvents[0].conversation_id, 'conv-A');
    assert.equal(productEvents[0].turn_id, 'turn-A');
  } finally {
    await stopFixtureServer(server);
  }
});

test('L0A-F2 malformed product metadata fails closed', async () => {
  const server = await startFixtureServer(() => (
    'data: {"product":{"contract_version":"unknown.v1","events":[]},"choices":[{"delta":{"content":"bad"}}]}\n\n'
  ));

  try {
    await assert.rejects(
      () => streamTextMessage(
        { conversationId: 'conv-A', turnId: 'turn-A', modality: 'text', input: 'bad' },
        {},
        { brainEndpoint: `http://127.0.0.1:${server.address().port}` }
      ),
      /Unsupported product metadata contract version/
    );
  } finally {
    await stopFixtureServer(server);
  }
});

test('L0A-F2 ResearchBrief renders as inert projection with exact semantics', () => {
  global.document = { createElement: (tag) => new FakeElement(tag) };
  const brief = fixtureBrief();
  const rendered = renderResearchBrief(brief);
  const hostile = rendered.children.find((child) => child.textContent.includes('Canonical market description'));
  assert.equal(hostile.textContent, brief.what_happened);
  assert.equal(Object.prototype.hasOwnProperty.call(hostile, 'innerHTML'), false);
  assert.equal(rendered.dataset.briefId, 'brief-1');
  assert.ok(JSON.stringify(rendered.children).includes('SOURCE_VERIFIED_SUPPORT'));
  assert.ok(JSON.stringify(rendered.children).includes('search completeness not proven'));
  assert.ok(JSON.stringify(rendered.children).includes('NO_MODEL_SYNTHESIS'));
});

test('L0A-F2 machine status is not transcript content', () => {
  global.document = { createElement: (tag) => new FakeElement(tag) };
  const status = renderProductStatus({ type: 'capability.started' });
  assert.equal(status.dataset.capabilityStatus, 'capability.started');
  assert.equal(status.textContent, 'researching');
});

test('L0A-F2 product contracts validate fail-closed', () => {
  assert.throws(
    () => validateProductMetadata({ contract_version: 'unknown.v1', events: [] }),
    /Unsupported product metadata contract version/
  );
  assert.throws(
    () => validateResearchBrief({ ...fixtureBrief(), contract_version: 'unknown.v1' }),
    /Unsupported ResearchBrief contract version/
  );
  assert.throws(
    () => normalizeProductMetadata({ contract_version: 'julia.product.events.v1', events: [{}] }),
    /Unsupported product event type/
  );
});

test('L0A-F2 non-stream conversation response can carry product metadata', async () => {
  const server = await startFixtureServer(() => JSON.stringify({
    conversation_id: 'conv-A',
    turn_id: 'turn-A',
    content: 'completed',
    product: {
      contract_version: 'julia.product.events.v1',
      events: [{ type: 'trace', turn_id: 'turn-A' }],
    },
  }));

  try {
    const result = await sendTextMessage(
      { conversationId: 'conv-A', turnId: 'turn-A', modality: 'text', input: 'complete' },
      { brainEndpoint: `http://127.0.0.1:${server.address().port}` }
    );
    assert.equal(result.metadata.events[0].type, 'trace');
  } finally {
    await stopFixtureServer(server);
  }
});
