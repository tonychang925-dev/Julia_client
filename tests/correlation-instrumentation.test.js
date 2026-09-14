const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/shell/app.js'), 'utf8');

test('composer correlation is locally defined and passed without ReferenceError', async () => {
  const start = source.indexOf('async function sendComposerMessage()');
  const end = source.indexOf('\nnewChatButton.addEventListener', start);
  const fn = source.slice(start, end);
  assert.match(fn, /const correlation = \{ root_id: requestId/);
  assert.match(fn, /streamTextMessage\(requestId, text, \{[\s\S]*correlation,/);
  assert.doesNotMatch(source.slice(0, start), /const correlation = \{ root_id: requestId/);
});

test('voice lifecycle does not emit text composer correlation', () => {
  const start = source.indexOf('async function sendVoiceLifecycleCommand');
  const end = source.indexOf('\nfunction isPauseConfirmed', start);
  assert.doesNotMatch(source.slice(start, end), /MIRA_CORRELATION/);
});
