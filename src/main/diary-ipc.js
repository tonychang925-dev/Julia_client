// IPC boundary for the diary UI. Exposes display + request only, never decide.
// There is deliberately NO 'diary:write' / 'diary:accept' / 'diary:save' handler.

const { DiaryProjectionStore } = require('./diary-projection');

function createDiaryIpcHandlers() {
  const store = new DiaryProjectionStore();
  return {
    // display: project Core-provided context into a disposable projection
    'diary:project': (entry, sourceChain) => store.project(entry, sourceChain),
    // request: list disposable projections (never raw storage)
    'diary:list': () => store.listProjections(),
    // request: clear disposable cache (never touches diary truth)
    'diary:clear': () => store.clear(),
    // NOTE: no decide handlers — write/accept/save/govern are forbidden here.
  };
}

module.exports = { createDiaryIpcHandlers };
