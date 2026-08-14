/**
 * CM-S5-R1C — Voice canonical attach sabotage.
 *
 * Voice binds only to a proven canonical conversation_id. Missing/stale/
 * fabricated ids and bootstrap-ack mismatches all fail closed (detached).
 */
const assert = require('assert');

const {
  verifyVoiceAttachEligibility,
  verifyVoiceBootstrapAck,
} = require('../src/main/voice-attach-guard.js');

function test_attach_requires_proven_canonical_id() {
  assert.strictEqual(verifyVoiceAttachEligibility('', { conversation_id: 'conv_A' }).ok, false);
  assert.strictEqual(verifyVoiceAttachEligibility(null, { conversation_id: 'conv_A' }).ok, false);
  assert.strictEqual(verifyVoiceAttachEligibility('conv_A', null).ok, false);
  assert.strictEqual(verifyVoiceAttachEligibility('conv_A', { conversation_id: 'conv_B' }).ok, false);

  const ok = verifyVoiceAttachEligibility('conv_A', { conversation_id: 'conv_A' });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.conversation_id, 'conv_A');
}

function test_attach_no_stale_or_fabricated_id() {
  assert.strictEqual(verifyVoiceAttachEligibility('stale_id', { conversation_id: 'conv_A' }).ok, false);
  assert.strictEqual(verifyVoiceAttachEligibility('fabricated_id', { conversation_id: 'conv_A' }).ok, false);
}

function test_bootstrap_ack_must_match() {
  assert.strictEqual(verifyVoiceBootstrapAck('conv_A', 'conv_A').ok, true);
  assert.strictEqual(verifyVoiceBootstrapAck('conv_A', 'conv_B').ok, false);
  assert.strictEqual(verifyVoiceBootstrapAck('conv_A', '').ok, false);
}

const tests = [
  test_attach_requires_proven_canonical_id,
  test_attach_no_stale_or_fabricated_id,
  test_bootstrap_ack_must_match,
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
console.log('\nAll CM-S5-R1C tests passed');
