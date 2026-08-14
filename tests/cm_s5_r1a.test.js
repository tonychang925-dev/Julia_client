/**
 * CM-S5-R1A — Canonical ID Authority Excision (unit + static sabotage).
 *
 * Verifies Electron can no longer issue, guess, fabricate, or resurrect a
 * canonical conversation_id. Unit tests hit ConversationStore directly (no
 * Brain needed). AT-ELEC-R1A-01/02/06 (Brain create/sync) are integration-level.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ConversationStore } = require('../src/main/conversation-store.js');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cm5-r1a-'));
}

// AT-ELEC-R1A-03: projection/create without canonical id → fail closed
function test_create_without_id_fails_closed() {
  const store = new ConversationStore(tmpDir());
  assert.throws(
    () => store.createConversation('hello'),
    /Canonical conversation_id is required/
  );
}

// AT-ELEC-R1A-04: empty getCurrentConversation → null, store unchanged
function test_get_current_empty_returns_null_no_mutation() {
  const store = new ConversationStore(tmpDir());
  assert.strictEqual(store.getCurrentConversation(), null);
  assert.strictEqual(store.listConversations().length, 0);
  assert.strictEqual(store.state.currentConversationId, null);
}

// AT-ELEC-R1A-05: delete last projection → empty, no replacement
function test_delete_last_no_replacement() {
  const store = new ConversationStore(tmpDir());
  store.createConversationWithId('conv_canonical_1', 'x');
  const result = store.deleteConversation('conv_canonical_1');
  assert.strictEqual(result.current_conversation, null);
  assert.strictEqual(store.listConversations().length, 0);
  assert.strictEqual(store.getCurrentConversation(), null);
}

// AT-ELEC-R1A-07: static — canonical path contains no local conv id fabrication
function test_no_local_conv_id_in_canonical_path() {
  const storeSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'conversation-store.js'), 'utf8');
  assert.ok(!storeSrc.includes("createId('conv')"), 'store must not fabricate local conv ids');

  const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  assert.ok(!mainSrc.includes('store.createConversation(title)'), 'main must not fall back to local create');

  const tcSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'text-client.js'), 'utf8');
  // resurrection = POST body carrying a caller-supplied conversation_id
  assert.ok(!tcSrc.includes('conversation_id: conversationId, title'), 'text-client must not resurrect via POST');
}

const tests = [
  test_create_without_id_fails_closed,
  test_get_current_empty_returns_null_no_mutation,
  test_delete_last_no_replacement,
  test_no_local_conv_id_in_canonical_path,
];

let failed = 0;
for (const t of tests) {
  try {
    t();
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
console.log('\nAll CM-S5-R1A unit/static tests passed');
