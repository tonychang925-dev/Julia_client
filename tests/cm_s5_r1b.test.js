/**
 * CM-S5-R1B — Projection / Open / Resume (unit + stub-fetch sabotage).
 *
 * Verifies: project a canonical conversation without mutating the current
 * selection; list projects the canonical Brain list (never local fabrication).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ConversationStore } = require('../src/main/conversation-store.js');
const { listConversationsViaCore, ensureConversationMessages } = require('../src/main/text-client.js');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cm5-r1b-'));
}

function stubFetch(handler) {
  const original = global.fetch;
  global.fetch = handler;
  return () => { global.fetch = original; };
}

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

// projectConversation projects WITHOUT changing the current selection
function test_project_does_not_change_current() {
  const store = new ConversationStore(tmpDir());
  store.createConversationWithId('conv_A', 'A');
  store.setCurrentConversation('conv_A');

  store.projectConversation('conv_B', 'B');
  assert.strictEqual(store.getCurrentConversation().conversation_id, 'conv_A');
  assert.ok(store.listConversations().some((c) => c.conversation_id === 'conv_B'));
}

// projectConversation requires a non-empty canonical id
function test_project_requires_canonical_id() {
  const store = new ConversationStore(tmpDir());
  assert.throws(() => store.projectConversation(''), /Canonical conversation_id is required/);
}

// listConversationsViaCore returns the canonical Brain array (GET, not POST)
async function test_list_returns_canonical_array() {
  const calls = [];
  const restore = stubFetch(async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method });
    return jsonResponse(200, [
      { conversation_id: 'conv_A', title: 'A' },
      { conversation_id: 'conv_B', title: 'B' },
    ]);
  });
  try {
    const result = await listConversationsViaCore();
    assert.strictEqual(result.length, 2);
    assert.strictEqual(calls[0].method, 'GET');
  } finally {
    restore();
  }
}

// AT-ELEC-R1B-04: canonical list excludes local residue (GHOST cached but hidden)
function test_project_canonical_list_excludes_residue() {
  const store = new ConversationStore(tmpDir());
  store.createConversationWithId('conv_A', 'A');
  store.createConversationWithId('conv_B', 'B');
  store.createConversationWithId('conv_GHOST', 'GHOST');

  const result = store.projectCanonicalList([
    { conversation_id: 'conv_A', title: 'A' },
    { conversation_id: 'conv_B', title: 'B' },
  ]);
  assert.deepStrictEqual(
    result.map((c) => c.conversation_id).sort(),
    ['conv_A', 'conv_B']
  );
  // residue remains cached, just has zero list authority
  assert.ok(store.getConversation('conv_GHOST') !== null);
}

// AT-ELEC-R1B-05: canonical title refreshes presentation metadata
function test_project_canonical_list_refreshes_title() {
  const store = new ConversationStore(tmpDir());
  store.createConversationWithId('conv_A', 'OLD');
  const result = store.projectCanonicalList([
    { conversation_id: 'conv_A', title: 'CANONICAL' },
  ]);
  assert.strictEqual(result[0].title, 'CANONICAL');
  assert.strictEqual(store.getConversation('conv_A').title, 'CANONICAL');
}

// AT-ELEC-R1B-06: list must not change current selection
function test_project_canonical_list_preserves_current() {
  const store = new ConversationStore(tmpDir());
  store.createConversationWithId('conv_X', 'X');
  store.setCurrentConversation('conv_X');
  store.projectCanonicalList([
    { conversation_id: 'conv_A', title: 'A' },
    { conversation_id: 'conv_B', title: 'B' },
  ]);
  assert.strictEqual(store.getCurrentConversation().conversation_id, 'conv_X');
}

// AT-ELEC-R1B-05B: literal "New Conversation" canonical title still wins
function test_project_canonical_list_new_conversation_title_wins() {
  const store = new ConversationStore(tmpDir());
  store.createConversationWithId('conv_A', 'OLD LOCAL TITLE');
  const result = store.projectCanonicalList([
    { conversation_id: 'conv_A', title: 'New Conversation' },
  ]);
  assert.strictEqual(result[0].title, 'New Conversation');
  assert.strictEqual(store.getConversation('conv_A').title, 'New Conversation');
}

// AT-ELEC-R1B-07: valid canonical, local absent → GET, projection created, reconciled, selected, zero POST
async function test_open_valid_absent_local_reconciles_no_post() {
  const calls = [];
  const restore = stubFetch(async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method });
    if (String(url).includes('/messages')) {
      return jsonResponse(200, {
        conversation_id: 'conv_A',
        title: 'A',
        messages: [{ message_id: 'm1', turn_id: 't1', role: 'user', content: 'hi', status: 'completed' }],
      });
    }
    return jsonResponse(200, { conversation_id: 'conv_A', title: 'A' });
  });
  try {
    const canonical = await ensureConversationMessages('conv_A');
    assert.ok(calls.every((c) => c.method !== 'POST'), 'open must not POST create');

    const store = new ConversationStore(tmpDir());
    store.reconcileCanonicalMessages('conv_A', canonical);
    assert.ok(store.getConversation('conv_A') !== null);
    assert.strictEqual(store.getCurrentConversation().conversation_id, 'conv_A');
    assert.strictEqual(store.getConversation('conv_A').messages.length, 1);
  } finally {
    restore();
  }
}

// AT-ELEC-R1B-08: unknown canonical → 404, zero POST, no projection mutation
async function test_open_unknown_404_no_mutation() {
  const calls = [];
  const restore = stubFetch(async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method });
    return jsonResponse(404, {});
  });
  try {
    await assert.rejects(() => ensureConversationMessages('unknown_id'), /HTTP 404/);
    assert.ok(calls.every((c) => c.method !== 'POST'), 'unknown must not POST');
  } finally {
    restore();
  }
  const store = new ConversationStore(tmpDir());
  assert.strictEqual(store.getConversation('unknown_id'), null);
  assert.strictEqual(store.getCurrentConversation(), null);
}

(async () => {
  const tests = [
    test_project_does_not_change_current,
    test_project_requires_canonical_id,
    test_list_returns_canonical_array,
    test_project_canonical_list_excludes_residue,
    test_project_canonical_list_refreshes_title,
    test_project_canonical_list_preserves_current,
    test_project_canonical_list_new_conversation_title_wins,
    test_open_valid_absent_local_reconciles_no_post,
    test_open_unknown_404_no_mutation,
  ];
  let failed = 0;
  for (const t of tests) {
    try {
      await t();
      console.log('PASS', t.name);
    } catch (e) {
      failed += 1;
      console.error('FAIL', t.name, '-', e.message);
    }
  }
  if (failed) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log('\nAll CM-S5-R1B tests passed');
})();
