const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildConversationMessagesApiUrl,
  buildConversationDetailApiUrl,
  buildConversationTurnApiUrl,
  commitExternalTurns,
  ensureConversationMessages,
  buildTurnBody,
  getConversationMessages,
  getConversationTurnApiTemplate,
  normalizeTurnRequest,
  parseOpenAiSseChunk,
  sendTextMessage,
  streamTextMessage,
} = require('../src/main/text-client');
const { ConversationStore } = require('../src/main/conversation-store');
const { getBrainStatus } = require('../src/main/brain-status');
const {
  describeVoiceState,
  getVoiceControlState,
  isVoiceWorkspaceNotSettled,
} = require('../src/renderer/shell/voice-ux-state');

test('CLIENT-C1-TC01 builds the frozen Julia-native turn contract without history', () => {
  const turn = normalizeTurnRequest({
    conversationId: 'conv-A',
    turnId: 'turn-001',
    modality: 'text',
    input: '前面我们聊到哪里？',
  });

  assert.equal(
    buildConversationTurnApiUrl('http://127.0.0.1:18089', turn.conversationId),
    'http://127.0.0.1:18089/internal/v1/conversations/conv-A/turns'
  );
  assert.equal(
    buildConversationMessagesApiUrl('http://127.0.0.1:18089', turn.conversationId),
    'http://127.0.0.1:18089/internal/v1/conversations/conv-A/messages'
  );
  assert.equal(
    getConversationTurnApiTemplate({ brainEndpoint: 'http://127.0.0.1:18089' }),
    'http://127.0.0.1:18089/internal/v1/conversations/%7Bconversation_id%7D/turns'
  );
  assert.deepEqual(buildTurnBody(turn, true), {
    turn_id: 'turn-001',
    modality: 'text',
    input: '前面我们聊到哪里？',
    stream: true,
  });
  assert.equal(Object.hasOwn(buildTurnBody(turn, true), 'messages'), false);
  assert.equal(Object.hasOwn(buildTurnBody(turn, true), 'history'), false);
  assert.equal(Object.hasOwn(buildTurnBody(turn, true), 'external_history'), false);
});

test('CLIENT-C1-TC02 rejects missing authority identifiers and unsupported modality', () => {
  assert.throws(() => normalizeTurnRequest({ turnId: 'turn-1', input: 'hello' }), /Conversation ID/);
  assert.throws(() => normalizeTurnRequest({ conversationId: 'conv-A', input: 'hello' }), /Turn ID/);
  assert.throws(() => normalizeTurnRequest({
    conversationId: 'conv-A', turnId: 'turn-1', modality: 'audio', input: 'hello',
  }), /Unsupported modality/);
});

test('CLIENT-C1-TC03 surfaces failed SSE turns instead of rendering them as success', () => {
  const parsed = parseOpenAiSseChunk(
    'data: {"choices":[{"delta":{"content":"turn failed"},"finish_reason":"error"}]}'
  );
  assert.equal(parsed.error, 'turn failed');
});

test('CLIENT-C1-TC04 local UI cache is idempotent by conversation, turn, and role', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-client-c1-'));
  try {
    const store = new ConversationStore(dir);
    store.load();
    const conversation = store.createConversation('Client cache');
    store.addMessage(conversation.conversation_id, {
      turn_id: 'turn-001', role: 'user', modality: 'text', content: 'first',
    });
    store.addMessage(conversation.conversation_id, {
      turn_id: 'turn-001', role: 'user', modality: 'text', content: 'updated',
    });
    store.addMessage(conversation.conversation_id, {
      turn_id: 'turn-001', role: 'assistant', modality: 'text', content: 'reply',
    });

    const restored = store.getConversation(conversation.conversation_id);
    assert.equal(restored.messages.length, 2);
    assert.equal(restored.messages[0].content, 'updated');
    assert.equal(restored.messages[1].content, 'reply');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLIENT-C1-TC05 sends JSON and SSE turns through the Julia-native endpoint', async () => {
  const observed = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const parsed = JSON.parse(body);
      observed.push({ method: request.method, url: request.url, body: parsed });
      if (parsed.stream) {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end(
          'data: {"choices":[{"delta":{"content":"Julia "},"finish_reason":null}]}\n\n'
          + 'data: {"choices":[{"delta":{"content":"continues"},"finish_reason":null}]}\n\n'
          + 'data: [DONE]\n\n'
        );
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        conversation_id: 'conv-A',
        turn_id: 'turn-json',
        content: 'Julia remembers',
        status: 'completed',
      }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  try {
    const jsonResult = await sendTextMessage({
      conversationId: 'conv-A', turnId: 'turn-json', modality: 'text', input: 'remember',
    }, { brainEndpoint: endpoint });
    const deltas = [];
    const streamResult = await streamTextMessage({
      conversationId: 'conv-A', turnId: 'turn-sse', modality: 'text', input: 'continue',
    }, { onDelta: (delta) => deltas.push(delta) }, { brainEndpoint: endpoint });

    assert.equal(jsonResult.content, 'Julia remembers');
    assert.equal(streamResult.content, 'Julia continues');
    assert.deepEqual(deltas, ['Julia ', 'continues']);
    assert.equal(observed.length, 2);
    assert.equal(observed[0].url, '/internal/v1/conversations/conv-A/turns');
    assert.deepEqual(observed[0].body, {
      turn_id: 'turn-json', modality: 'text', input: 'remember', stream: false,
    });
    assert.deepEqual(observed[1].body, {
      turn_id: 'turn-sse', modality: 'text', input: 'continue', stream: true,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('CLIENT-C10-E2-TC01 fetches completed and canonical interrupted assistant messages', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      conversation_id: 'conv-voice',
      title: 'Voice continuity',
      messages: [
        {
          message_id: 'msg-user', conversation_id: 'conv-voice', turn_id: 'v1',
          role: 'user', modality: 'voice', content: '代号是什么？', status: 'completed',
          created_at: '2026-08-09T15:00:00+08:00',
        },
        {
          message_id: 'msg-interrupted', conversation_id: 'conv-voice', turn_id: 'v1',
          role: 'assistant', modality: 'voice', content: '部分回答', status: 'interrupted',
          created_at: '2026-08-09T15:00:00.500+08:00',
        },
        {
          message_id: 'msg-pending', conversation_id: 'conv-voice', turn_id: 'v2',
          role: 'assistant', modality: 'voice', content: 'pending', status: 'pending',
          created_at: '2026-08-09T15:00:01+08:00',
        },
      ],
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await getConversationMessages('conv-voice', {
      brainEndpoint: `http://127.0.0.1:${server.address().port}`,
    });
    assert.equal(result.messages.length, 2);
    assert.equal(result.messages[0].message_id, 'msg-user');
    assert.equal(result.messages[0].modality, 'voice');
    assert.equal(result.messages[1].message_id, 'msg-interrupted');
    assert.equal(result.messages[1].status, 'interrupted');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('CLIENT-C1B-TC02 canonical identity replaces optimistic cache entries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-client-c1b-'));
  try {
    const store = new ConversationStore(dir);
    store.load();
    const conversation = store.createConversation('Voice continuity');
    store.addMessage(conversation.conversation_id, {
      message_id: 'local-msg', turn_id: 'voice-turn-1', role: 'user',
      modality: 'voice', content: 'local transcript', status: 'pending',
      metadata: { source: 'julia-electron-local', projection_state: 'local_pending' },
    });

    const result = store.reconcileCanonicalMessages(conversation.conversation_id, {
      title: 'Voice continuity',
      messages: [
        {
          message_id: 'canonical-msg', conversation_id: conversation.conversation_id,
          turn_id: 'voice-turn-1', role: 'user', modality: 'voice',
          content: 'canonical transcript', status: 'completed',
          created_at: '2026-08-09T15:03:26.913714+08:00',
        },
        {
          message_id: 'canonical-reply', conversation_id: conversation.conversation_id,
          turn_id: 'voice-turn-1', role: 'assistant', modality: 'voice',
          content: 'canonical reply', status: 'completed',
          created_at: '2026-08-09T15:03:27.913714+08:00',
        },
      ],
    });

    assert.equal(result.conversation.messages.length, 2);
    assert.equal(result.conversation.messages[0].message_id, 'canonical-msg');
    assert.equal(result.conversation.messages[0].content, 'canonical transcript');
    assert.equal(result.conversation.messages[0].status, 'completed');
    assert.equal(result.conversation.messages[0].metadata.source, 'julia-core-canonical');
    assert.equal(result.conversation.messages[1].message_id, 'canonical-reply');
    assert.equal(result.reconciliation.inserted, 1);
    assert.equal(result.reconciliation.updated, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLIENT-C10-E1-TC01 failed optimistic projection remains local and idempotent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-client-e1-'));
  try {
    const store = new ConversationStore(dir);
    store.load();
    const conversation = store.createConversation('Projection state');
    const pending = store.addMessage(conversation.conversation_id, {
      message_id: 'local-user', turn_id: 'turn-failed', role: 'user',
      modality: 'text', content: 'will fail', status: 'pending',
      metadata: { source: 'julia-electron-local', projection_state: 'local_pending' },
    });
    const failed = store.addMessage(conversation.conversation_id, {
      turn_id: 'turn-failed', role: 'user', modality: 'text', content: 'will fail',
      status: 'failed',
      metadata: { source: 'julia-electron-local', projection_state: 'failed' },
    });

    assert.equal(failed.message_id, pending.message_id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.metadata.projection_state, 'failed');
    assert.equal(store.getConversation(conversation.conversation_id).messages.length, 1);

    const reconciled = store.reconcileCanonicalMessages(conversation.conversation_id, { messages: [] });
    assert.equal(reconciled.conversation.messages.length, 0);
    assert.equal(reconciled.reconciliation.removed_local, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLIENT-C10-E2-TC02 interrupted chronology survives repeated canonical reconcile', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-client-e2-'));
  try {
    const store = new ConversationStore(dir);
    store.load();
    const conversation = store.createConversation('Interrupted history');
    const canonical = {
      messages: [
        { message_id: 'm1', turn_id: 't1', role: 'user', modality: 'voice', content: 'one', status: 'completed', created_at: '2026-08-09T10:00:00Z' },
        { message_id: 'm2', turn_id: 't1', role: 'assistant', modality: 'voice', content: 'partial', status: 'interrupted', created_at: '2026-08-09T10:00:01Z' },
        { message_id: 'm3', turn_id: 't2', role: 'user', modality: 'text', content: 'two', status: 'completed', created_at: '2026-08-09T10:00:02Z' },
        { message_id: 'm4', turn_id: 't2', role: 'assistant', modality: 'text', content: 'done', status: 'completed', created_at: '2026-08-09T10:00:03Z' },
      ],
    };

    store.reconcileCanonicalMessages(conversation.conversation_id, canonical);
    const repeated = store.reconcileCanonicalMessages(conversation.conversation_id, canonical);
    assert.deepEqual(repeated.conversation.messages.map((message) => message.message_id), ['m1', 'm2', 'm3', 'm4']);
    assert.deepEqual(repeated.conversation.messages.map((message) => message.status), ['completed', 'interrupted', 'completed', 'completed']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CC-1-TC01 rejects Voice external-turn shadow commits', async () => {
  await assert.rejects(
    commitExternalTurns({
      conversationId: 'conv-A',
      voiceSessionId: 'vws',
      baseLastMessageId: 'msg-2',
      turns: [{
        turn_id: 'voice:vws:0001', modality: 'voice', user_content: '问题',
        assistant_content: '回答', assistant_status: 'completed',
      }],
    }, { brainEndpoint: 'http://127.0.0.1:1' }),
    /CC-1: Electron must not commit Voice workspace\/external turns/
  );
});

test('CC-1-TC02 external-turns endpoint is not constructed by Electron client', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(require('../src/main/text-client'), 'buildExternalTurnsApiUrl'), false);
});

test('CC-1-TC03 registers a local-only conversation before Voice bind', async () => {
  let exists = false;
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.method === 'GET' && request.url === '/internal/v1/conversations/conv-local') {
      response.writeHead(exists ? 200 : 404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(exists ? { conversation_id: 'conv-local' } : { error: 'not_found' }));
      return;
    }
    if (request.method === 'POST' && request.url === '/internal/v1/conversations') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        assert.deepEqual(JSON.parse(body), { conversation_id: 'conv-local', title: 'Local draft' });
        exists = true;
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ conversation_id: 'conv-local' }));
      });
      return;
    }
    if (request.method === 'GET' && request.url === '/internal/v1/conversations/conv-local/messages') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ conversation_id: 'conv-local', title: 'Local draft', messages: [] }));
      return;
    }
    response.writeHead(500); response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(
      buildConversationDetailApiUrl(endpoint, 'conv-local'),
      `${endpoint}/internal/v1/conversations/conv-local`
    );
    const result = await ensureConversationMessages('conv-local', 'Local draft', { brainEndpoint: endpoint });
    assert.equal(result.conversation_id, 'conv-local');
    assert.deepEqual(requests, [
      'GET /internal/v1/conversations/conv-local',
      'POST /internal/v1/conversations',
      'GET /internal/v1/conversations/conv-local/messages',
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('E4-AT03/E4-AT12 local cache clear is disposable and never uploads history', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-client-e4-clear-'));
  try {
    const store = new ConversationStore(dir);
    store.load();
    const conversation = store.createConversation('Disposable cache');
    store.addMessage(conversation.conversation_id, {
      message_id: 'local-only', turn_id: 't-local', role: 'user', modality: 'text',
      content: 'local projection only', status: 'pending',
      metadata: { source: 'julia-electron-local', projection_state: 'local_pending' },
    });
    const before = store.getCacheStatus();
    assert.equal(before.authority, 'non_canonical');
    assert.equal(before.kind, 'disposable_projection');
    assert.equal(before.message_count, 1);

    const cleared = store.clearLocalCache();
    assert.equal(cleared.cleared, true);
    assert.equal(cleared.previous.message_count, 1);
    assert.equal(cleared.cache.message_count, 0);
    assert.equal(store.getCacheStatus().conversation_count, 0);

    const restored = store.reconcileCanonicalMessages(conversation.conversation_id, {
      title: 'Disposable cache',
      messages: [{
        message_id: 'core-msg', conversation_id: conversation.conversation_id,
        turn_id: 't-core', role: 'user', modality: 'text', content: 'Core truth',
        status: 'completed', created_at: '2026-08-10T00:00:00Z',
      }],
    });
    assert.deepEqual(restored.conversation.messages.map((m) => m.message_id), ['core-msg']);
    assert.equal(restored.conversation.messages[0].metadata.source, 'julia-core-canonical');
    assert.equal(restored.conversation.messages.some((m) => m.message_id === 'local-only'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('E4-AT04/E4-AT05 offline cache is marked stale then Core reconcile wins', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-client-e4-stale-'));
  try {
    const store = new ConversationStore(dir);
    store.load();
    const conversation = store.createConversation('Offline projection');
    store.addMessage(conversation.conversation_id, {
      message_id: 'cached-core', turn_id: 't1', role: 'user', modality: 'text',
      content: 'cached copy', status: 'completed', metadata: { source: 'julia-core-canonical' },
    });

    const stale = store.markConversationStale(conversation.conversation_id, 'Core offline');
    assert.equal(stale.projection.stale, true);
    assert.equal(stale.projection.last_reconcile_error, 'Core offline');
    assert.equal(store.getCacheStatus().stale_conversation_count, 1);

    const reconciled = store.reconcileCanonicalMessages(conversation.conversation_id, {
      messages: [{
        message_id: 'canonical-updated', conversation_id: conversation.conversation_id,
        turn_id: 't1', role: 'user', modality: 'text', content: 'canonical copy',
        status: 'completed', created_at: '2026-08-10T00:00:00Z',
      }],
    });
    assert.equal(reconciled.conversation.projection.stale, false);
    assert.equal(reconciled.conversation.projection.last_reconcile_error, null);
    assert.equal(reconciled.conversation.messages.length, 1);
    assert.equal(reconciled.conversation.messages[0].content, 'canonical copy');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('E4-AT10 Core discovery shows unavailable for missing provenance without fabrication', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', contract_version: '1.0.0' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const status = await getBrainStatus(`http://127.0.0.1:${server.address().port}`);
    assert.equal(status.connected, true);
    assert.equal(status.contract_version, '1.0.0');
    assert.equal(status.julia_core, null);
    assert.equal(status.service_version, null);
    assert.equal(status.architecture_version, null);
    assert.equal(status.commit, null);
    assert.equal(status.raw.status, 'ok');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('E4-AT11 corrupt local cache is discarded and rebuilt as disposable projection', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-client-e4-corrupt-'));
  try {
    fs.writeFileSync(path.join(dir, 'julia-conversations-v1.json'), '{not-json', 'utf8');
    const store = new ConversationStore(dir);
    const state = store.load();
    assert.equal(state.conversations.length, 0);
    assert.equal(state.cache.kind, 'disposable_projection');
    assert.match(state.cache.recovered_from_corruption, /^julia-conversations-v1\.json\.corrupt-/);
    assert.equal(store.getCacheStatus().message_count, 0);
    assert.equal(fs.readdirSync(dir).some((name) => name.includes('.corrupt-')), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('UX-POLISH-E1 retry projection reuses same turn id and canonical promote creates no duplicate', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-client-ux-retry-'));
  try {
    const store = new ConversationStore(dir);
    store.load();
    const conversation = store.createConversation('Retry UX');
    const conversationId = conversation.conversation_id;

    const pending = store.addMessage(conversationId, {
      turn_id: 'turn-retry', role: 'user', modality: 'text', content: 'retry me', status: 'pending',
      metadata: { source: 'julia-electron-local', projection_state: 'local_pending' },
    });
    const failed = store.addMessage(conversationId, {
      turn_id: 'turn-retry', role: 'user', modality: 'text', content: 'retry me', status: 'failed',
      metadata: { source: 'julia-electron-local', projection_state: 'failed', error: 'offline' },
    });
    const retryPending = store.addMessage(conversationId, {
      turn_id: 'turn-retry', role: 'user', modality: 'text', content: 'retry me', status: 'pending',
      metadata: { source: 'julia-electron-local', projection_state: 'local_pending', retry_of: 'turn-retry' },
    });

    assert.equal(pending.message_id, failed.message_id);
    assert.equal(failed.message_id, retryPending.message_id);
    assert.equal(store.getConversation(conversationId).messages.length, 1);
    assert.equal(store.getConversation(conversationId).messages[0].status, 'pending');

    const reconciled = store.reconcileCanonicalMessages(conversationId, {
      messages: [
        { message_id: 'core-u', conversation_id: conversationId, turn_id: 'turn-retry', role: 'user', modality: 'text', content: 'retry me', status: 'completed', created_at: '2026-08-10T01:00:00Z' },
        { message_id: 'core-a', conversation_id: conversationId, turn_id: 'turn-retry', role: 'assistant', modality: 'text', content: 'retried', status: 'completed', created_at: '2026-08-10T01:00:01Z' },
      ],
    });
    assert.deepEqual(reconciled.conversation.messages.map((message) => message.message_id), ['core-u', 'core-a']);
    assert.deepEqual(reconciled.conversation.messages.map((message) => message.status), ['completed', 'completed']);
    assert.equal(reconciled.conversation.messages.some((message) => message.metadata.source === 'julia-electron-local'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('UX-POLISH-E2 mixed failed and interrupted timeline preserves canonical statuses after reconcile', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-client-ux-timeline-'));
  try {
    const store = new ConversationStore(dir);
    store.load();
    const conversation = store.createConversation('Timeline UX');
    const conversationId = conversation.conversation_id;
    store.addMessage(conversationId, {
      turn_id: 'local-failed', role: 'user', modality: 'text', content: 'not committed', status: 'failed',
      metadata: { source: 'julia-electron-local', projection_state: 'failed' },
    });

    const result = store.reconcileCanonicalMessages(conversationId, {
      messages: [
        { message_id: 'm1', conversation_id: conversationId, turn_id: 't1', role: 'user', modality: 'text', content: 'A', status: 'completed', created_at: '2026-08-10T02:00:00Z' },
        { message_id: 'm2', conversation_id: conversationId, turn_id: 't1', role: 'assistant', modality: 'voice', content: 'partial A', status: 'interrupted', created_at: '2026-08-10T02:00:01Z' },
        { message_id: 'm3', conversation_id: conversationId, turn_id: 't2', role: 'user', modality: 'text', content: 'B', status: 'completed', created_at: '2026-08-10T02:00:02Z' },
        { message_id: 'm4', conversation_id: conversationId, turn_id: 't2', role: 'assistant', modality: 'text', content: 'B done', status: 'completed', created_at: '2026-08-10T02:00:03Z' },
      ],
    });

    assert.deepEqual(result.conversation.messages.map((message) => message.message_id), ['m1', 'm2', 'm3', 'm4']);
    assert.deepEqual(result.conversation.messages.map((message) => message.status), ['completed', 'interrupted', 'completed', 'completed']);
    assert.equal(result.conversation.messages.some((message) => message.turn_id === 'local-failed'), false);
    assert.equal(result.reconciliation.removed_local, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('VOICE-UX-TC01 maps body states without creating cognition authority', () => {
  assert.deepEqual(describeVoiceState('listening').state, 'listening');
  assert.deepEqual(describeVoiceState('speech_detected').state, 'speech');
  assert.deepEqual(describeVoiceState('response.done').state, 'draining');
  assert.deepEqual(describeVoiceState('audio_playing').state, 'speaking');
  assert.deepEqual(describeVoiceState('audio to settle').state, 'draining');
  assert.equal(describeVoiceState('draining').detail.includes('settle'), true);
});

test('VOICE-UX-TC02 disables conflicting controls during Voice busy phases', () => {
  assert.equal(getVoiceControlState('idle').startDisabled, false);
  assert.equal(getVoiceControlState('idle').releaseDisabled, true);
  assert.equal(getVoiceControlState('listening').startDisabled, true);
  assert.equal(getVoiceControlState('listening').releaseDisabled, false);
  assert.equal(getVoiceControlState('draining').startDisabled, true);
  assert.equal(getVoiceControlState('draining').textSwitchDiscouraged, true);
  assert.equal(getVoiceControlState('flushing').modeSwitchBusy, true);
});

test('VOICE-UX-TC03 classifies not-settled release failure as recoverable DRAINING UX', () => {
  assert.equal(isVoiceWorkspaceNotSettled(new Error('Voice audio to settle')), true);
  assert.equal(isVoiceWorkspaceNotSettled('draining before flush'), true);
  assert.equal(isVoiceWorkspaceNotSettled(new Error('Microphone access denied')), false);
  const denied = describeVoiceState('error', { message: 'Microphone access denied: Permission denied' });
  assert.equal(denied.state, 'error');
  assert.equal(denied.label, 'Voice error');
});

test('CC-1-C2 Electron waits for Voice bind acknowledgement before marking bound', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/shell/app.js'), 'utf8');
  const bindStart = source.indexOf('async function bindVoiceConversation');
  const bindEnd = source.indexOf('async function bootstrapVoiceWorkspace', bindStart);
  const bindSource = source.slice(bindStart, bindEnd);

  assert.match(bindSource, /type: 'julia\.voice\.conversation\.bind'/);
  assert.match(bindSource, /pendingVoiceCommands\.set\(requestId, \{ resolve, reject, timeout \}\)/);
  assert.match(bindSource, /const ack = await new Promise/);
  assert.match(bindSource, /if \(!ack\?\.ok\) throw new Error/);
  assert.match(bindSource, /ack\.conversationId[\s\S]*!== targetId/);
  assert.match(bindSource, /boundVoiceConversationId = targetId/);
  assert.ok(bindSource.indexOf('const ack = await new Promise') < bindSource.indexOf('boundVoiceConversationId = targetId'));
  assert.doesNotMatch(bindSource, /messages\s*:/);
  assert.doesNotMatch(bindSource, /baseLastMessageId/);
});
