// UI cache only. Core DiaryRepository / DiaryContextSource / ContextBlock is
// the sole authority. This store is a disposable projection layer — it may
// display and request, never decide (no truth, admission, acceptance, memory).

const CANONICAL = false;

function createProjectionIdentity(sourceChain) {
  return {
    projection_id: `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    projection_created_at: new Date().toISOString(),
    source_chain: sourceChain,
    canonical: CANONICAL,
  };
}

class DiaryProjectionStore {
  // disposable projection cache only — never canonical diary truth.
  constructor() {
    this.state = {
      projections: [],
    };
  }

  // display: render Core-provided context as a disposable projection.
  project(entry, sourceChain) {
    const identity = createProjectionIdentity(sourceChain);
    const projection = {
      ...identity,
      entry_id: entry.entry_id,
      body: entry.body,
      reflection_time: entry.reflection_time,
      source_refs: entry.source_refs,
      // projection metadata only — never summary / inference / new claims.
    };
    this.state.projections.push(projection);
    return projection;
  }

  listProjections() {
    return this.state.projections.slice();
  }

  // disposable cache may be dropped freely — clearing never loses diary truth.
  clear() {
    this.state.projections = [];
  }
}

module.exports = {
  DiaryProjectionStore,
  createProjectionIdentity,
  CANONICAL,
};
