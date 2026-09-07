'use strict';
/* A2-R2 component qualification — structured product transport/projection.
 * Test fixture / LOGIC_ONLY: no live Brain, no user turn, no renderer DOM.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createHash } = require('node:crypto');

const { parseOpenAiSseChunk } = require('../src/main/text-client');
const { ConversationStore } = require('../src/main/conversation-store');

// research.brief.v1-shaped fixture (authoritative schema derived from R0/R1)
const PRODUCT_FIXTURE = {
  contract_version: 'research.brief.v1',
  brief_id: 'br_fixture_1',
  event_title: 'Token出海',
  headline: 'Token 出海 主题市场变化',
  executive_summary: ['这是初步判断。'],
  what_happened: '示例事实',
  why_it_matters: ['示例意义'],
  key_drivers: [
    { driver_id: 'd1', statement: '示例驱动', support_level: 'SOURCE_VERIFIED_SUPPORT',
      evidence_refs: ['ev_1'], source_record_refs: ['source-verified'] },
  ],
  evidence_snapshot: {
    drivers: [{ driver_id: 'd1', support_level: 'SOURCE_VERIFIED_SUPPORT' }],
    judgment_evidence_refs: ['ev_1'],
    judgment_source_record_refs: ['source-verified'],
  },
  contradictions: [],
  uncertainties: ['示例不确定'],
  what_to_watch: ['示例关注'],
  confidence: 0.6,
  confidence_display: '中等',
  source_refs: ['source-verified'],
  reasoning_limits: ['初步判断 · 非投资建议'],
  trace: { brief_id: 'br_fixture_1', judgment_id: 'j_fixture_1', market_event_id: 215257,
           evidence_refs: ['ev_1'], source_record_refs: ['source-verified'] },
  composition_metadata: {},
};

function sha(value) {
  return createHash('sha256').update(
    JSON.stringify(value, Object.keys(value).sort(), 0), 'utf8'
  ).digest('hex');
}

function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2r2-'));
  return { store: new ConversationStore(dir), dir };
}

function messagesOf(store, cid) {
  const conv = store.getConversation(cid);
  return conv ? conv.messages || [] : [];
}

// ── SSE parser: product frame must be captured (not dropped) ──────────────
test('r2_sse_parser_captures_product_frame', () => {
  const frame = 'data: ' + JSON.stringify({ product: PRODUCT_FIXTURE });
  const parsed = parseOpenAiSseChunk(frame);
  assert.deepEqual(parsed.product, PRODUCT_FIXTURE);
});

test('r2_sse_parser_preserves_content_delta_and_error', () => {
  const delta = parseOpenAiSseChunk('data: ' + JSON.stringify({
    choices: [{ delta: { content: 'hi' }, finish_reason: null }],
  }));
  assert.equal(delta.delta, 'hi');
  const done = parseOpenAiSseChunk('data: ' + JSON.stringify({
    choices: [{ delta: {}, finish_reason: 'stop' }],
  }));
  assert.equal(done.done, true);
  const err = parseOpenAiSseChunk('data: ' + JSON.stringify({
    choices: [{ delta: {}, finish_reason: 'error' }],
  }));
  assert.ok(err.error);
});

test('r2_sse_parser_product_digest_stable', () => {
  const parsed = parseOpenAiSseChunk('data: ' + JSON.stringify({ product: PRODUCT_FIXTURE }));
  assert.equal(sha(parsed.product), sha(PRODUCT_FIXTURE));
});

// ── Projection store: product preserved on message, absent on ordinary ────
test('r2_projection_preserves_product_on_assistant_message', () => {
  const { store } = makeStore();
  store.createConversationWithId('conv-r2', 'T');
  store.addMessage('conv-r2', { turn_id: 't1', role: 'user', modality: 'text', content: 'hello' });
  store.addMessage('conv-r2', { turn_id: 't2', role: 'assistant', modality: 'text', content: 'brief', product: PRODUCT_FIXTURE });
  const briefMsg = messagesOf(store, 'conv-r2').find((m) => m.turn_id === 't2');
  assert.ok(briefMsg.product, 'product must be preserved');
  assert.equal(sha(briefMsg.product), sha(PRODUCT_FIXTURE));
});

test('r2_ordinary_message_has_no_product', () => {
  const { store } = makeStore();
  store.createConversationWithId('conv-r2b', 'T');
  store.addMessage('conv-r2b', { turn_id: 't1', role: 'assistant', modality: 'text', content: 'plain' });
  const msgs = messagesOf(store, 'conv-r2b');
  assert.ok(!msgs[0].product);
});

test('r2_local_product_removed_when_core_omits_it', () => {
  const { store } = makeStore();
  store.createConversationWithId('conv-r2c', 'T');
  store.addMessage('conv-r2c', { turn_id: 't1', role: 'assistant', modality: 'text', content: 'brief', product: PRODUCT_FIXTURE });
  // Core canonical sync returns same message WITHOUT product (object form)
  store.reconcileCanonicalMessages('conv-r2c', {
    conversation_id: 'conv-r2c',
    last_message_id: 'c1',
    messages: [{
      message_id: 'c1', turn_id: 't1', role: 'assistant', modality: 'text',
      content: 'brief', status: 'completed', created_at: new Date().toISOString(),
    }],
  });
  const assistant = messagesOf(store, 'conv-r2c').find((m) => m.role === 'assistant');
  assert.ok(!assistant.product, 'SSE-only product must not become canonical');
});

test('r2_core_product_overrides_local', () => {
  const { store } = makeStore();
  store.createConversationWithId('conv-r2d', 'T');
  store.addMessage('conv-r2d', { turn_id: 't1', role: 'assistant', modality: 'text', content: 'brief', product: { ...PRODUCT_FIXTURE, headline: 'STALE_LOCAL' } });
  store.reconcileCanonicalMessages('conv-r2d', {
    conversation_id: 'conv-r2d',
    last_message_id: 'c2',
    messages: [{
      message_id: 'c2', turn_id: 't1', role: 'assistant', modality: 'text',
      content: 'brief', status: 'completed', created_at: new Date().toISOString(),
      product: PRODUCT_FIXTURE,
    }],
  });
  const assistant = messagesOf(store, 'conv-r2d').find((m) => m.role === 'assistant');
  assert.equal(assistant.product.headline, PRODUCT_FIXTURE.headline);
});

test('r2_old_cache_without_product_still_reads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2r2old-'));
  const store = new ConversationStore(dir);
  store.state = {
    version: 2,
    currentConversationId: 'conv-old',
    conversations: [{
      conversation_id: 'conv-old', title: 'Old',
      messages: [{ message_id: 'm1', conversation_id: 'conv-old', turn_id: 'x',
                   role: 'assistant', modality: 'text', content: 'old text',
                   status: 'completed', created_at: new Date().toISOString(),
                   metadata: { source: 'julia-core-canonical' } }],
    }],
    cache: { kind: 'disposable_projection', authority: 'non_canonical', last_cleared_at: null },
  };
  store.loaded = true;
  const msgs = messagesOf(store, 'conv-old');
  assert.equal(msgs.length, 1);
  assert.ok(!msgs[0].product);
  assert.equal(msgs[0].content, 'old text');
});
