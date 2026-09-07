const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const APP_PATH = path.join(__dirname, '..', 'src', 'renderer', 'shell', 'app.js');

function appSource() {
  return fs.readFileSync(APP_PATH, 'utf8');
}

function functionSlice(source, startName, nextName) {
  const start = source.indexOf(`async function ${startName}`);
  assert.notEqual(start, -1, `missing ${startName}`);
  const end = source.indexOf(`async function ${nextName}`, start + 1);
  assert.notEqual(end, -1, `missing ${nextName}`);
  return source.slice(start, end);
}

test('CLIENT-C2A-TC01 Voice bind uses Phase 5 host.attach with identity-only payload', () => {
  const source = appSource();
  const bind = functionSlice(source, 'bindVoiceConversation', 'bootstrapVoiceWorkspace');

  assert.match(bind, /type:\s*'julia\.voice\.host\.attach'/);
  assert.match(bind, /protocol:\s*'julia-electron-v2'/);
  assert.match(bind, /conversationId:\s*targetId/);

  assert.doesNotMatch(bind, /julia\.voice\.workspace\.bootstrap/);
  assert.doesNotMatch(bind, /messages\s*:/);
  assert.doesNotMatch(bind, /baseLastMessageId/);
  assert.doesNotMatch(bind, /external_history/);
});

test('CLIENT-C2A-TC02 bound authority is assigned only after positive matching acknowledgement', () => {
  const source = appSource();
  const bind = functionSlice(source, 'bindVoiceConversation', 'bootstrapVoiceWorkspace');

  assert.match(bind, /pendingVoiceCommands\.set\(requestId,\s*\{\s*resolve,\s*reject,\s*timeout\s*\}\)/);
  assert.match(bind, /if\s*\(!(?:ack|result)\?\.ok\)\s*throw new Error/);
  assert.match(bind, /(?:ack|result)\.conversationId[\s\S]*?targetId/);
  assert.match(bind, /boundVoiceConversationId\s*=\s*targetId/);

  const ackCheck = Math.max(bind.indexOf('if (!ack?.ok)'), bind.indexOf('if (!result?.ok)'));
  const boundAssignment = bind.indexOf('boundVoiceConversationId = targetId');
  assert.ok(ackCheck >= 0, 'positive ACK check must exist');
  assert.ok(boundAssignment > ackCheck, 'bound state must be assigned after ACK validation');
});

test('CLIENT-C2A-TC03 Electron renderer has no semantic external-turn commit call site', () => {
  const source = appSource();
  assert.doesNotMatch(source, /textClient\.commitExternalTurns\s*\(/);
});

test('CLIENT-C2A-TC04 workspace flush is not a Voice persistence authority', () => {
  const source = appSource();
  const flush = functionSlice(source, 'flushVoiceWorkspace', 'pauseVoiceCapture');

  assert.doesNotMatch(flush, /julia\.voice\.workspace\.flush/);
  assert.doesNotMatch(flush, /julia\.voice\.workspace\.committed/);
  assert.doesNotMatch(flush, /commitExternalTurns/);
  assert.match(flush, /syncCanonicalConversation/);
});

test('CLIENT-C2A-TC05 Voice-to-Text lifecycle still releases the frame and refreshes Core projection', () => {
  const source = appSource();
  const toText = functionSlice(source, 'switchToTextMode', 'switchToVoiceMode');

  assert.match(toText, /pauseVoiceCapture/);
  assert.match(toText, /teardownVoiceFrame/);
  assert.match(toText, /syncCanonicalConversation|flushVoiceWorkspace/);
  assert.doesNotMatch(toText, /commitExternalTurns/);
});

test('CLIENT-C2A-TC06 no history authority is uploaded anywhere in the canonical Voice bind function', () => {
  const source = appSource();
  const bind = functionSlice(source, 'bindVoiceConversation', 'bootstrapVoiceWorkspace');

  for (const forbidden of ['messages:', 'baseLastMessageId', 'external_history', 'history:']) {
    assert.equal(bind.includes(forbidden), false, `forbidden Voice authority field present: ${forbidden}`);
  }
});
