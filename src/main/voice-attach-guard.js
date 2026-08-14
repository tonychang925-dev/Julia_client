/**
 * CM-S5-R1C — Voice canonical attach eligibility (pure, testable spec).
 *
 * Voice may attach only to a PROVEN canonical conversation_id.
 * Never a local-cache guess, never a stale id, never a fabricated fallback.
 *
 * Production bindVoiceConversation() implements these same checks inline;
 * this module is the frozen, independently-testable form of the invariants.
 */
function verifyVoiceAttachEligibility(targetId, canonical) {
  const id = String(targetId || '').trim();
  if (!id) return { ok: false, reason: 'missing-canonical-id' };
  if (!canonical || canonical.conversation_id !== id) {
    return { ok: false, reason: 'canonical-mismatch' };
  }
  return { ok: true, conversation_id: id };
}

function verifyVoiceBootstrapAck(targetId, ackConversationId) {
  const id = String(targetId || '').trim();
  if (!id) return { ok: false, reason: 'missing-canonical-id' };
  if (String(ackConversationId || '').trim() !== id) {
    return { ok: false, reason: 'bootstrap-ack-mismatch' };
  }
  return { ok: true };
}

function verifyActiveEquality(targetId, activeId) {
  const id = String(targetId || '').trim();
  if (!id) return { ok: false, reason: 'missing-canonical-id' };
  if (String(activeId || '').trim() !== id) {
    return { ok: false, reason: 'not-active-conversation' };
  }
  return { ok: true };
}

module.exports = {
  verifyVoiceAttachEligibility,
  verifyVoiceBootstrapAck,
  verifyActiveEquality,
};
