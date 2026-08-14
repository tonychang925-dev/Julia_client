/**
 * CM-S5-R1D — canonical rename sabotage.
 *
 * Rename is canonical metadata mutation via Brain PATCH. Electron never writes
 * a local fake title, id/transcript unchanged, unknown id fail-closed.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ConversationStore } = require('../src/main/conversation-store.js');
const { renameConversationViaCore } = require('../src/main/text-client.js');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cm5-r1d-'));
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

// rename PATCH returns canonical result (id unchanged, title canonical)
async function test_rename_returns_canonical_title() {
  const calls = [];
  const restore = stubFetch(async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method });
    return jsonResponse(200, { conversation_id: 'conv_A', title: 'CANONICAL' });
  });
  try {
    const result = await renameConversationViaCore('conv_A', 'CANONICAL');
    assert.strictEqual(result.conversation_id, 'conv_A');
    assert.strictEqual(result.title, 'CANONICAL');
    assert.strictEqual(calls[0].method, 'PATCH');
  } finally {
    restore();
  }
}

// AT-ELEC-R1D: Brain failure → no local fake title (projection stays OLD)
async function test_rename_failure_no_local_fake_title() {
  const store = new ConversationStore(tmpDir());
  store.createConversationWithId('conv_A', 'OLD');

  const restore = stubFetch(async () => jsonResponse(500, {}));
  try {
    await assert.rejects(() => renameConversationViaCore('conv_A', 'NEW'), /Core rename failed/);
  } finally {
    restore();
  }
  // canonical title unchanged (handler throws before any local mutation)
  assert.strictEqual(store.getConversation('conv_A').title, 'OLD');
}

// unknown id → 404 → fail closed
async function test_rename_unknown_404() {
  const restore = stubFetch(async () => jsonResponse(404, {}));
  try {
    await assert.rejects(() => renameConversationViaCore('ghost', 'NEW'), /Core rename failed/);
  } finally {
    restore();
  }
}

// static: rename handler must use canonical PATCH, not local store mutation
function test_rename_handler_uses_canonical_patch() {
  const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  assert.ok(
    !mainSrc.includes('getConversationStore().renameConversation('),
    'rename must be canonical (Brain PATCH), not local store mutation'
  );
}

// R1D-05: 200 {} → reject (Electron must not inject missing id), projection unchanged
async function test_rename_missing_id_rejects_projection_unchanged() {
  const store = new ConversationStore(tmpDir());
  store.createConversationWithId('conv_A', 'OLD');

  const restore = stubFetch(async () => jsonResponse(200, {}));
  try {
    await assert.rejects(
      () => renameConversationViaCore('conv_A', 'NEW'),
      /did not contain canonical conversation_id/
    );
  } finally {
    restore();
  }
  assert.strictEqual(store.getConversation('conv_A').title, 'OLD');
}

// R1D-05B: 200 {"conversation_id":"","title":"NEW"} → reject
async function test_rename_empty_id_rejects() {
  const restore = stubFetch(async () => jsonResponse(200, { conversation_id: '', title: 'NEW' }));
  try {
    await assert.rejects(
      () => renameConversationViaCore('conv_A', 'NEW'),
      /did not contain canonical conversation_id/
    );
  } finally {
    restore();
  }
}

// R1D-05C: 200 {"conversation_id":"conv_A"} (missing title) → reject
async function test_rename_missing_title_rejects() {
  const restore = stubFetch(async () => jsonResponse(200, { conversation_id: 'conv_A' }));
  try {
    await assert.rejects(
      () => renameConversationViaCore('conv_A', 'NEW'),
      /did not contain canonical title/
    );
  } finally {
    restore();
  }
}

(async () => {
  const tests = [
    test_rename_returns_canonical_title,
    test_rename_failure_no_local_fake_title,
    test_rename_unknown_404,
    test_rename_handler_uses_canonical_patch,
    test_rename_missing_id_rejects_projection_unchanged,
    test_rename_empty_id_rejects,
    test_rename_missing_title_rejects,
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
  console.log('\nAll CM-S5-R1D tests passed');
})();
