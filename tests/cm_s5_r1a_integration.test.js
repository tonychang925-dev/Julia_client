/**
 * CM-S5-R1A — canonical-id authority integration sabotage (stub fetch).
 *
 * Deterministic, no real Brain: monkey-patch global.fetch to prove
 * AT-ELEC-R1A-01A/01B/02/06 at the text-client boundary.
 */
const assert = require('assert');

const {
  createConversationViaCore,
  ensureConversationMessages,
} = require('../src/main/text-client.js');

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

// AT-ELEC-R1A-01A: Brain create → canonical id projected exactly
async function test_create_returns_canonical_id() {
  const calls = [];
  const restore = stubFetch(async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method });
    return jsonResponse(200, { conversation_id: 'conv_core_123', title: 'x' });
  });
  try {
    const result = await createConversationViaCore('hello');
    assert.strictEqual(result.conversation_id, 'conv_core_123');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].method, 'POST');
  } finally {
    restore();
  }
}

// AT-ELEC-R1A-01B: Brain success but missing/empty conversation_id → fail closed
async function test_create_missing_id_fails_closed() {
  const restore = stubFetch(async () => jsonResponse(200, {}));
  try {
    await assert.rejects(
      () => createConversationViaCore('hello'),
      /canonical conversation_id/
    );
  } finally {
    restore();
  }
}

// AT-ELEC-R1A-02: Brain create HTTP failure → exception propagates
async function test_create_http_failure_propagates() {
  const restore = stubFetch(async () => jsonResponse(500, { detail: 'boom' }));
  try {
    await assert.rejects(
      () => createConversationViaCore('hello'),
      /Core create failed/
    );
  } finally {
    restore();
  }
}

// AT-ELEC-R1A-06: unknown id sync → 404, zero POST (no resurrection)
async function test_sync_unknown_404_no_post() {
  const calls = [];
  const restore = stubFetch(async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method });
    if (String(url).includes('/conversations/unknown_id') && !String(url).includes('/messages')) {
      return jsonResponse(404, {});
    }
    return jsonResponse(200, { conversation_id: 'unknown_id', title: 'x', messages: [] });
  });
  try {
    await assert.rejects(
      () => ensureConversationMessages('unknown_id'),
      /HTTP 404/
    );
    assert.ok(calls.every((c) => c.method !== 'POST'), 'sync must not POST on 404');
  } finally {
    restore();
  }
}

(async () => {
  const tests = [
    test_create_returns_canonical_id,
    test_create_missing_id_fails_closed,
    test_create_http_failure_propagates,
    test_sync_unknown_404_no_post,
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
  console.log('\nAll CM-S5-R1A integration tests passed');
})();
