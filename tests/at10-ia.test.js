const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { ConversationStore } = require('../src/main/conversation-store');
const { createConversationIpcHandlers } = require('../src/main/conversation-ipc-handlers');

function makeCoreState() {
  return {
    conversations: new Map([
      ['core-ia-1', {
        conversation_id: 'core-ia-1',
        title: 'Core IA One',
        messages: [
          { message_id: 'core-ia-1-m1', conversation_id: 'core-ia-1', turn_id: 'core-ia-1-t1', role: 'user', modality: 'text', content: 'Core IA message A', status: 'completed', created_at: '2026-08-23T03:00:00Z' },
          { message_id: 'core-ia-1-m2', conversation_id: 'core-ia-1', turn_id: 'core-ia-1-t1', role: 'assistant', modality: 'text', content: 'Core IA message B', status: 'completed', created_at: '2026-08-23T03:00:01Z' },
        ],
      }],
    ]),
    requests: [],
    nextId: 2,
    unavailable: false,
  };
}

async function withMockCore(state, fn) {
  const server = http.createServer((request, response) => {
    state.requests.push({ method: request.method, url: request.url });
    if (state.unavailable) {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'core_unavailable' }));
      return;
    }

    if (request.method === 'GET' && request.url === '/internal/v1/conversations') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify([...state.conversations.values()].map((conversation) => ({
        conversation_id: conversation.conversation_id,
        title: conversation.title,
        message_count: conversation.messages.length,
      }))));
      return;
    }

    if (request.method === 'POST' && request.url === '/internal/v1/conversations') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const parsed = body ? JSON.parse(body) : {};
        const id = `core-created-${state.nextId++}`;
        const conversation = {
          conversation_id: id,
          title: parsed.title || 'New Conversation',
          messages: [],
        };
        state.conversations.set(id, conversation);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ conversation_id: id, title: conversation.title }));
      });
      return;
    }

    const detailMatch = request.url.match(/^\/internal\/v1\/conversations\/([^/]+)$/);
    if (request.method === 'GET' && detailMatch) {
      const conversation = state.conversations.get(decodeURIComponent(detailMatch[1]));
      if (!conversation) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ conversation_id: conversation.conversation_id, title: conversation.title }));
      return;
    }

    const messagesMatch = request.url.match(/^\/internal\/v1\/conversations\/([^/]+)\/messages$/);
    if (request.method === 'GET' && messagesMatch) {
      const conversation = state.conversations.get(decodeURIComponent(messagesMatch[1]));
      if (!conversation) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        conversation_id: conversation.conversation_id,
        title: conversation.title,
        last_message_id: conversation.messages.at(-1)?.message_id || '',
        messages: conversation.messages,
      }));
      return;
    }

    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'unexpected_request', url: request.url }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function makeHandlers(dir, endpoint) {
  const store = new ConversationStore(dir);
  store.load();
  return {
    store,
    handlers: createConversationIpcHandlers({
      getConversationStore: () => store,
      getTextClientOptions: () => ({ brainEndpoint: endpoint }),
    }),
  };
}

test('TC-AT10-IA-001 main IPC list/current/open path reloads from Core, not Electron cache', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-at10-ia-001-'));
  const state = makeCoreState();
  try {
    await withMockCore(state, async (endpoint) => {
      const { store, handlers } = makeHandlers(dir, endpoint);
      store.createConversationWithId('conv-local-poison', 'Local poison');
      store.addMessage('conv-local-poison', {
        message_id: 'local-poison', turn_id: 'local-poison-turn', role: 'user', modality: 'text',
        content: 'LOCAL_POISON_SHOULD_NOT_BE_CURRENT', status: 'pending',
        metadata: { source: 'julia-electron-local', projection_state: 'sabotage' },
      });

      const listed = await handlers['julia:conversation:list']();
      assert.deepEqual(listed.map((item) => item.conversation_id), ['core-ia-1']);
      assert.equal(listed[0].projection.authority, 'core_canonical_projection');

      const current = await handlers['julia:conversation:current']();
      assert.equal(current.conversation_id, 'core-ia-1');
      assert.deepEqual(current.messages.map((message) => message.message_id), ['core-ia-1-m1', 'core-ia-1-m2']);

      const opened = await handlers['julia:conversation:open'](null, { conversationId: 'core-ia-1' });
      assert.equal(opened.conversation_id, 'core-ia-1');
      assert.equal(opened.messages.some((message) => message.content.includes('LOCAL_POISON')), false);
      assert.equal(state.requests.map((request) => request.url).some((url) => url.includes('conv-local-poison/messages')), false);
      assert.equal(store.getConversation('conv-local-poison').projection.authority, 'disposable_projection');
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('TC-AT10-IA-002 cache destruction plus restart restores canonical messages from Core', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-at10-ia-002-'));
  const state = makeCoreState();
  try {
    await withMockCore(state, async (endpoint) => {
      let runtime = makeHandlers(dir, endpoint);
      const created = await runtime.handlers['julia:conversation:create'](null, { title: 'Created through Core' });
      state.conversations.get(created.conversation_id).messages.push(
        { message_id: 'created-m1', conversation_id: created.conversation_id, turn_id: 'created-t1', role: 'user', modality: 'text', content: 'created canonical user', status: 'completed', created_at: '2026-08-23T04:00:00Z' },
        { message_id: 'created-m2', conversation_id: created.conversation_id, turn_id: 'created-t1', role: 'assistant', modality: 'text', content: 'created canonical assistant', status: 'completed', created_at: '2026-08-23T04:00:01Z' },
      );
      await runtime.handlers['julia:cache:clear-local']();
      assert.equal(runtime.store.getCacheStatus().conversation_count, 0);

      runtime = makeHandlers(dir, endpoint);
      const restored = await runtime.handlers['julia:conversation:open'](null, { conversationId: created.conversation_id });
      assert.deepEqual(restored.messages.map((message) => message.message_id), ['created-m1', 'created-m2']);
      assert.equal(restored.messages.every((message) => message.metadata.source === 'julia-core-canonical'), true);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('TC-AT10-IA-003 main IPC sync rejects client-only identity without Core creation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-at10-ia-003-'));
  const state = makeCoreState();
  try {
    await withMockCore(state, async (endpoint) => {
      const { store, handlers } = makeHandlers(dir, endpoint);
      store.createConversationWithId('conv_fake_ia_003', 'Client fake IA');
      await assert.rejects(
        () => handlers['julia:conversation:sync'](null, { conversationId: 'conv_fake_ia_003' }),
        (error) => error.status === 404 && error.code === 'CORE_CONVERSATION_NOT_FOUND'
      );
      assert.equal(state.conversations.has('conv_fake_ia_003'), false);
      assert.equal(state.requests.some((request) => request.method === 'POST' && request.url === '/internal/v1/conversations'), false);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('TC-AT10-IA-004 main IPC open replaces stale projection after Core mutation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-at10-ia-004-'));
  const state = makeCoreState();
  try {
    await withMockCore(state, async (endpoint) => {
      const { store, handlers } = makeHandlers(dir, endpoint);
      store.createConversationWithId('core-ia-1', 'Old title');
      store.addMessage('core-ia-1', {
        message_id: 'old-cache-message', turn_id: 'core-ia-1-t1', role: 'user', modality: 'text',
        content: 'OLD_CACHE_COPY', status: 'completed', metadata: { source: 'julia-core-canonical' },
      });
      store.markConversationStale('core-ia-1', 'Core mutated');
      state.conversations.get('core-ia-1').messages = [
        { message_id: 'core-mutated-a', conversation_id: 'core-ia-1', turn_id: 'mutated-t1', role: 'user', modality: 'text', content: 'Core mutated A', status: 'completed', created_at: '2026-08-23T05:00:00Z' },
        { message_id: 'core-mutated-b', conversation_id: 'core-ia-1', turn_id: 'mutated-t2', role: 'assistant', modality: 'text', content: 'Core mutated B', status: 'completed', created_at: '2026-08-23T05:00:01Z' },
      ];

      const opened = await handlers['julia:conversation:open'](null, { conversationId: 'core-ia-1' });
      assert.equal(opened.projection.stale, false);
      assert.deepEqual(opened.messages.map((message) => message.message_id), ['core-mutated-a', 'core-mutated-b']);
      assert.equal(opened.messages.some((message) => message.content === 'OLD_CACHE_COPY'), false);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('TC-AT10-IA-005 Core unavailable path leaves existing cache as stale projection, not truth', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-at10-ia-005-'));
  const state = makeCoreState();
  try {
    await withMockCore(state, async (endpoint) => {
      const { store, handlers } = makeHandlers(dir, endpoint);
      store.createConversationWithId('core-ia-1', 'Cached while offline');
      store.addMessage('core-ia-1', {
        message_id: 'cached-offline', turn_id: 'offline-t1', role: 'user', modality: 'text',
        content: 'CACHED_OFFLINE_PROJECTION', status: 'completed', metadata: { source: 'julia-core-canonical' },
      });
      state.unavailable = true;

      await assert.rejects(
        () => handlers['julia:conversation:list'](),
        (error) => error.status === 503
      );
      const current = await handlers['julia:conversation:current']();
      assert.equal(current.conversation_id, 'core-ia-1');
      assert.equal(store.getConversation('core-ia-1').projection.stale, true);
      assert.equal(store.getConversation('core-ia-1').projection.authority, 'disposable_projection');
      assert.equal(store.getCacheStatus().authority, 'non_canonical');
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
