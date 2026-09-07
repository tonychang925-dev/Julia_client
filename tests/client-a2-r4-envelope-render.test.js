'use strict';
/* CLIENT-TEXT-E2E-A2-R4 — julia.product.events.v1 envelope dispatch.
 *
 * DOM-stub component tests (no renderer DOM engine, no network, no canonical
 * user turn). The real FINAL-2 canonical product envelope (Core read-back,
 * contract julia.product.events.v1 wrapping research.brief.v1, event 215257)
 * is used as the authoritative test input — a REAL_RUNTIME_ARTIFACT, not a
 * new canonical acceptance.
 *
 * Enforced renderer contract:
 *   research.brief.v1 (direct)                → render brief
 *   julia.product.events.v1 + research.brief  → select nested + render brief
 *   julia.product.events.v1, no brief         → controlled non-brief state
 *   julia.product.events.v1, wrong nested     → controlled unsupported
 *   unknown top-level                         → controlled unsupported
 *   malformed product                         → no crash, no synthesis
 * The canonical envelope object is never mutated.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createHash } = require('node:crypto');

// ── Minimal DOM stub (createElement/appendChild/classList/textContent) ──────
class El {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this._text = '';
    this.dataset = {};
    this.classList = {
      _tokens: new Set(),
      add: (...cls) => cls.forEach((c) => this.classList._tokens.add(c)),
      contains: (c) => this.classList._tokens.has(c),
    };
  }
  get className() { return this._className || ''; }
  set className(v) {
    this._className = String(v);
    this.classList._tokens = new Set(String(v).split(/\s+/).filter(Boolean));
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = v == null ? '' : String(v); }
  appendChild(child) {
    if (child && typeof child === 'object') {
      child.parentNode = this;
      this.children.push(child);
    }
    return child;
  }
}

function createElement(tagName) { return new El(tagName); }
function createTextNode(text) { return { nodeType: 3, textContent: String(text) }; }
global.document = { createElement, createTextNode };

const view = require('../src/renderer/shell/research-product-view.js');
const ENVELOPE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'final2_julia_product_events_v1.json'), 'utf8')
);

// A2-R2-shaped direct research.brief.v1 product fixture.
const DIRECT_BRIEF = {
  contract_version: 'research.brief.v1',
  brief_id: 'br_fixture_r4',
  event_title: 'Token出海',
  headline: 'Token 出海 主题市场变化（初步判断）',
  executive_summary: ['这是初步判断。'],
  what_happened: '示例事实',
  why_it_matters: ['示例意义'],
  key_drivers: [
    { driver_id: 'd1', statement: '示例驱动', support_level: 'SOURCE_VERIFIED_SUPPORT',
      evidence_refs: ['ev_1'], source_record_refs: ['source-verified'] },
  ],
  contradictions: [],
  uncertainties: ['示例不确定'],
  what_to_watch: ['示例关注'],
  confidence: 0.6,
  confidence_display: '中等',
  source_refs: ['source-verified'],
  reasoning_limits: ['初步判断 · 非投资建议'],
  trace: { brief_id: 'br_fixture_r4', judgment_id: 'j_fixture_r4', market_event_id: 215257 },
};

function sha(o) {
  return createHash('sha256').update(
    JSON.stringify(o, Object.keys(o).sort(), 0), 'utf8'
  ).digest('hex');
}

function collect(node, pred, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (pred(node)) out.push(node);
  (node.children || []).forEach((c) => collect(c, pred, out));
  return out;
}

function findByClass(root, token) {
  return collect(root, (n) => n.classList && n.classList.contains(token));
}

function rootText(root) {
  if (!root) return '';
  return collect(root, () => true).map((n) => n.textContent || '').join('\n');
}

// ── REAL FINAL-2 ENVELOPE RENDERABLE ───────────────────────────────────────
test('r4_real_final2_envelope_renders_nested_brief', () => {
  const srcSha = sha(ENVELOPE);
  const wrap = view.renderStructuredProduct(ENVELOPE);
  const briefs = findByClass(wrap, 'research-brief');
  assert.equal(briefs.length, 1, 'structured research-brief UI must be present');
  const unsupported = findByClass(wrap, 'structured-product-tag');
  assert.equal(unsupported.length, 0, 'unsupported julia.product.events.v1 placeholder must be absent');
  const text = rootText(briefs[0]);
  assert.match(text, /阿里|Token/, 'brief headline/content present');
  // stable digest: renderer must not mutate the canonical envelope
  assert.equal(sha(ENVELOPE), srcSha, 'SOURCE_ENVELOPE_SHA256 == POST_RENDER_INPUT_ENVELOPE_SHA256');
  // nested brief object not mutated
  const nestedSha = sha(ENVELOPE.research_brief);
  view.renderStructuredProduct(ENVELOPE);
  assert.equal(sha(ENVELOPE.research_brief), nestedSha);
});

test('r4_envelope_dispatch_preserves_epistemic_status', () => {
  const wrap = view.renderStructuredProduct(ENVELOPE);
  const text = rootText(wrap);
  assert.match(text, /初步|非投资建议/, 'preliminary/not-investment-advice status preserved');
  assert.match(text, /来源|source/i, 'user-presentable provenance present');
  assert.match(text, /置信度|20/, 'confidence presented');
});

// ── DIRECT BRIEF BACKWARD COMPATIBILITY ────────────────────────────────────
test('r4_direct_research_brief_still_renders', () => {
  const wrap = view.renderStructuredProduct(DIRECT_BRIEF);
  assert.equal(findByClass(wrap, 'research-brief').length, 1);
  assert.equal(findByClass(wrap, 'structured-product-tag').length, 0);
  assert.match(rootText(wrap), /Token 出海/);
});

test('r4_is_research_brief_direct_detection', () => {
  assert.equal(view.isResearchBrief(DIRECT_BRIEF), true);
  assert.equal(view.isResearchBrief(ENVELOPE), false, 'envelope is not itself a brief');
  assert.equal(view.isJuliaProductEventsEnvelope(ENVELOPE), true);
  assert.equal(view.isJuliaProductEventsEnvelope(DIRECT_BRIEF), false);
});

// ── UNKNOWN TOP-LEVEL CONTRACT ─────────────────────────────────────────────
test('r4_unknown_top_level_contract_controlled_unsupported', () => {
  const wrap = view.renderStructuredProduct({ contract_version: 'unknown.v9', headline: 'x' });
  assert.equal(findByClass(wrap, 'research-brief').length, 0, 'RESEARCH_BRIEF_RENDERER_NOT_CALLED');
  const tags = findByClass(wrap, 'structured-product-tag');
  assert.equal(tags.length, 1);
  assert.match(tags[0].textContent, /暂不支持渲染/);
});

// ── MISSING NESTED BRIEF ───────────────────────────────────────────────────
test('r4_missing_research_brief_no_synthesis', () => {
  const env = { contract_version: 'julia.product.events.v1', events: [], trace: {} };
  const wrap = view.renderStructuredProduct(env);
  assert.equal(findByClass(wrap, 'research-brief').length, 0, 'NO_SYNTHETIC_RESEARCH_BRIEF');
  assert.ok(findByClass(wrap, 'structured-product-tag').length >= 1, 'controlled state');
});

// ── WRONG NESTED VERSION ───────────────────────────────────────────────────
test('r4_wrong_nested_version_controlled_unsupported', () => {
  const env = { contract_version: 'julia.product.events.v1', research_brief: { contract_version: 'other.v9' } };
  const wrap = view.renderStructuredProduct(env);
  assert.equal(findByClass(wrap, 'research-brief').length, 0, 'NO_GUESSED_RENDERING');
  assert.match(findByClass(wrap, 'structured-product-tag')[0].textContent, /暂不支持渲染/);
});

// ── MALFORMED NESTED PRODUCT ───────────────────────────────────────────────
test('r4_malformed_nested_product_no_crash', () => {
  for (const nested of ['a string', null, 42, ['arr']]) {
    const env = { contract_version: 'julia.product.events.v1', research_brief: nested };
    const wrap = view.renderStructuredProduct(env);
    assert.ok(wrap, 'no crash');
    assert.equal(findByClass(wrap, 'research-brief').length, 0, 'no brief from malformed');
  }
});

// ── EVENTS ARRAY NON-AUTHORITY ─────────────────────────────────────────────
test('r4_events_array_never_becomes_brief', () => {
  const env = {
    contract_version: 'julia.product.events.v1',
    events: [
      { type: 'capability.completed', detail: 'research.event.enrich completed' },
      { type: 'capability.completed', detail: 'market.event.resolve resolved 215257' },
    ],
    trace: { conversation_id: 'c1', turn_id: 't1' },
    // no research_brief
  };
  const wrap = view.renderStructuredProduct(env);
  assert.equal(findByClass(wrap, 'research-brief').length, 0, 'EVENTS_TO_RESEARCH_BRIEF_SYNTHESIS = 0');
});

// ── NULL / NON-OBJECT TOP LEVEL ────────────────────────────────────────────
test('r4_null_or_nonobject_product_controlled', () => {
  for (const product of [null, undefined, 'text', 5]) {
    const wrap = view.renderStructuredProduct(product);
    assert.ok(wrap, 'no crash');
    assert.equal(findByClass(wrap, 'research-brief').length, 0);
  }
});
