// #237 P1: tests must never target the production brain (port 18089).
const test = require('node:test');
const assert = require('node:assert');
const { assertNotProduction, resolveTestBrain, PRODUCTION_PORT } = require('./support/brain-target');

test('production port constant is 18089', () => {
  assert.strictEqual(PRODUCTION_PORT, 18089);
});

test('every spelling of the production brain is refused', () => {
  for (const url of [
    'http://127.0.0.1:18089',
    'http://localhost:18089/internal/v1/conversations',
    'http://[::1]:18089',
    'http://0.0.0.0:18089/x',
    'HTTP://LOCALHOST:18089',
  ]) {
    assert.throws(() => assertNotProduction(url), /production/i, url);
  }
});

test('other ports and malformed urls', () => {
  assertNotProduction('http://127.0.0.1:18090');
  assertNotProduction('http://127.0.0.1:54321/health');
  assert.throws(() => assertNotProduction('not a url'), /invalid/i);
});

test('resolveTestBrain needs an explicit env url and refuses 18089', () => {
  assert.strictEqual(resolveTestBrain({}), null);
  assert.strictEqual(resolveTestBrain({ JULIA_TEST_BRAIN_URL: 'http://127.0.0.1:54321' }), 'http://127.0.0.1:54321');
  assert.throws(() => resolveTestBrain({ JULIA_TEST_BRAIN_URL: 'http://127.0.0.1:18089' }), /production/i);
});

test('the live acceptance script has no hard-coded production brain', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, 'ec_acceptance.test.js'), 'utf8');
  assert.ok(!source.includes('18089'), 'ec_acceptance.test.js must not mention the production port');
  assert.ok(source.includes("require('./support/brain-target')"));
});
