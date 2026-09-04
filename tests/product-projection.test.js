const test = require('node:test');
const assert = require('node:assert/strict');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  text() {
    const childText = this.children.map((child) => child.text()).join('\n');
    return [this.textContent, childText].filter(Boolean).join('\n');
  }
}

global.window = {};
const {
  renderProductStatus,
  renderResearchBrief,
  validateProductMetadata,
} = require('../src/renderer/shell/product-projection');

function fixtureBrief() {
  return {
    contract_version: 'research.brief.v1',
    brief_id: 'brief-1',
    event_title: 'Market event evt-1',
    headline: 'Preliminary research remains uncertain',
    executive_summary: 'A preliminary judgment was composed.',
    what_happened: 'Canonical market description. <script>alert(1)</script>',
    why_it_matters: 'The judgment identifies unresolved evidence.',
    key_drivers: [{ statement: 'Lead', support_level: 'REPORT_ONLY' }],
    evidence_snapshot: [{ label: 'REPORT_ONLY' }],
    contradictions: ['Source A conflicts with Source B'],
    uncertainties: ['Search completeness not proven'],
    what_to_watch: ['Official confirmation'],
    confidence: 0.72,
    reasoning_limits: ['NO_MODEL_SYNTHESIS'],
    source_refs: ['source-1'],
    trace: {
      conversation_id: 'conv-1',
      turn_id: 'turn-1',
      capability_request_id: 'capreq-1',
      capability_call_id: 'capcall-1',
      correlation_id: 'corr-1',
      judgment_id: 'judgment-1',
      brief_id: 'brief-1',
    },
  };
}

test('capability events map only to authoritative display states', () => {
  global.document = { createElement: (tag) => new FakeElement(tag) };
  assert.equal(renderProductStatus({ type: 'capability.started' }).textContent, 'researching');
  assert.equal(renderProductStatus({ type: 'capability.completed' }).textContent, 'completed');
  assert.equal(renderProductStatus({ type: 'capability.failed' }).textContent, 'failed');
  assert.equal(renderProductStatus({ type: 'capability.cancelled' }).textContent, 'cancelled');
  assert.equal(renderProductStatus({ type: 'research_brief' }), null);
});

test('research brief preserves support, limits, uncertainty, confidence, and trace', () => {
  global.document = { createElement: (tag) => new FakeElement(tag) };
  const rendered = renderResearchBrief(fixtureBrief());
  const text = rendered.text();

  assert.match(text, /REPORT_ONLY/);
  assert.doesNotMatch(text, /confirmed|verified fact/i);
  assert.match(text, /Source A conflicts with Source B/);
  assert.match(text, /Search completeness not proven/);
  assert.match(text, /NO_MODEL_SYNTHESIS/);
  assert.match(text, /0\.72/);
  for (const value of Object.values(fixtureBrief().trace)) {
    assert.match(text, new RegExp(value));
  }
});

test('research content is rendered through textContent and remains inert', () => {
  global.document = { createElement: (tag) => new FakeElement(tag) };
  const brief = fixtureBrief();
  const rendered = renderResearchBrief(brief);
  const hostile = rendered.children.find((child) => child.textContent.includes('Canonical market description'));

  assert.equal(hostile.textContent, brief.what_happened);
  assert.equal(Object.prototype.hasOwnProperty.call(hostile, 'innerHTML'), false);
});

test('product metadata contract is validated before rendering', () => {
  assert.throws(
    () => validateProductMetadata({ contract_version: 'unknown.v1', events: [] }),
    /Unsupported product metadata contract version/
  );
  assert.deepEqual(
    validateProductMetadata({ contract_version: 'julia.product.events.v1', events: [] }),
    { contract_version: 'julia.product.events.v1', events: [] }
  );
});
