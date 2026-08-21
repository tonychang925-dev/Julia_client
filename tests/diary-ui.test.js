const assert = require('node:assert/strict');
const test = require('node:test');

const { DiaryProjectionStore, createProjectionIdentity, CANONICAL } = require('../src/main/diary-projection');
const { createDiaryIpcHandlers } = require('../src/main/diary-ipc');

const entry = {
  entry_id: 'entry_1',
  body: 'original body',
  reflection_time: '2026-08-17T00:00:00+08:00',
  source_refs: ['handoff://handoff-1'],
};

test('RED-UI-01: no direct persistence bypass surface', () => {
  const store = new DiaryProjectionStore();
  assert.equal(typeof store.write, 'undefined');
  assert.equal(typeof store.append_accepted, 'undefined');
  assert.equal(typeof store.save, 'undefined');

  const handlers = createDiaryIpcHandlers();
  assert.equal(typeof handlers['diary:write'], 'undefined');
  assert.equal(typeof handlers['diary:accept'], 'undefined');
  assert.equal(typeof handlers['diary:save'], 'undefined');
});

test('RED-UI-02: UI state is canonical=false (never canonical truth)', () => {
  const store = new DiaryProjectionStore();
  const projection = store.project(entry, 'browse-chain');
  assert.equal(projection.canonical, false);
  assert.equal(CANONICAL, false);
});

test('RED-UI-03: no browse-to-memory escalation surface', () => {
  const store = new DiaryProjectionStore();
  assert.equal(typeof store.writeMemory, 'undefined');
  assert.equal(typeof store.promote, 'undefined');
  assert.equal(typeof store.store, 'undefined');
});

test('RED-UI-04: no reflection bypass surface (reflection walks frozen chain)', () => {
  const store = new DiaryProjectionStore();
  assert.equal(typeof store.accept, 'undefined');
  assert.equal(typeof store.govern, 'undefined');
  assert.equal(typeof store.generate, 'undefined');
});

test('RED-UI-05: projection has no provider field (provider only renders)', () => {
  const store = new DiaryProjectionStore();
  const projection = store.project(entry, 'browse-chain');
  assert.equal(projection.provider, undefined);
  assert.equal(projection.model, undefined);
});

test('RED-UI-06: cache availability != truth availability', () => {
  const store = new DiaryProjectionStore();
  store.project(entry, 'browse-chain');
  assert.equal(store.listProjections().length, 1);
  store.clear(); // dropping disposable cache must not lose diary truth
  assert.equal(store.listProjections().length, 0);
});

test('UI projection identity carries audit metadata (source_chain + created_at + canonical=false)', () => {
  const p = createProjectionIdentity('browse-chain');
  assert.ok(p.projection_id);
  assert.ok(p.projection_created_at);
  assert.equal(p.source_chain, 'browse-chain');
  assert.equal(p.canonical, false);
});

test('IPC boundary exposes display/request only, no decide handlers', () => {
  const handlers = createDiaryIpcHandlers();
  const allowed = new Set(['diary:project', 'diary:list', 'diary:clear']);
  assert.deepEqual(new Set(Object.keys(handlers)), allowed);
});
