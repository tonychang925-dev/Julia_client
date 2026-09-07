'use strict';
/* A2-R2 / A2-R4 structured-product view.
 *
 * Pure DOM builder. Dispatch is by explicit product type/contract_version —
 * never by prose parsing. Presentation-only: no fabricated fields, no trading
 * guidance, no promotion of transient product to canonical authority.
 *
 * R4 canonical-product envelope dispatch:
 *   The canonical product Core persists for a research turn is the FULL
 *   envelope `julia.product.events.v1` (contract_version, events[],
 *   trace{conversation,turn}, research_brief{research.brief.v1}). The Client
 *   keeps that envelope as message.product (no flattening). This view only
 *   selects the correct PRESENTATION:
 *     - direct research.brief.v1            → renderResearchBrief (backward
 *                                             compatible, R2 path)
 *     - julia.product.events.v1 envelope    → validate, select nested
 *                                             research_brief, delegate to the
 *                                             SAME renderResearchBrief
 *     - unknown / missing / wrong-version   → controlled unsupported state,
 *                                             never synthesized from events[]
 *                                             or assistant prose
 *
 * UMD wrapper mirrors voice-ux-state.js so the same file works under Node
 * (node --test) and as a classic renderer <script> that exposes
 * globalThis.JuliaResearchProductView.
 */
(function initResearchProductView(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.JuliaResearchProductView = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, () => {

const JULIA_PRODUCT_EVENTS_V1 = 'julia.product.events.v1';
const RESEARCH_BRIEF_V1 = 'research.brief.v1';

function el(tagName, text) {
  const node = document.createElement(tagName);
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function isResearchBrief(product) {
  const type = product && (product.product_type || product.contract_version);
  const version = product && (product.schema_version || product.contract_version);
  return Boolean(
    type === RESEARCH_BRIEF_V1 ||
    version === RESEARCH_BRIEF_V1 ||
    (product && product.headline && product.contract_version === RESEARCH_BRIEF_V1)
  );
}

// Exact top-level envelope contract detection — no substring guessing.
function isJuliaProductEventsEnvelope(product) {
  return Boolean(
    product &&
    typeof product === 'object' &&
    product.contract_version === JULIA_PRODUCT_EVENTS_V1
  );
}

// Controlled unsupported / non-brief presentation. Never a synthetic brief.
function renderUnsupported(product, labelVersion) {
  const wrap = el('div', null);
  wrap.className = 'structured-product';
  wrap.className += ' unsupported';
  const tag = el('div', null);
  tag.className = 'structured-product-tag';
  const version = labelVersion || (product && (product.schema_version || product.contract_version));
  tag.textContent = `结构化产品（暂不支持渲染）: ${version || 'unknown'}`;
  wrap.appendChild(tag);
  return wrap;
}

function addSection(container, title, renderFn) {
  const section = el('div', null);
  section.className = 'rb-section';
  section.appendChild(Object.assign(el('div', title), { className: 'rb-section-title' }));
  const body = el('div', null);
  body.className = 'rb-section-body';
  renderFn(body);
  section.appendChild(body);
  container.appendChild(section);
}

// The ONE research.brief.v1 renderer (R2). Envelope dispatch delegates here.
function renderResearchBrief(product) {
  const wrap = el('div', null);
  wrap.className = 'structured-product';

  if (!isResearchBrief(product)) {
    return renderUnsupported(product);
  }

  const container = el('div', null);
  container.className = 'research-brief';

  const headline = el('div', product.headline || product.event_title || '研究简报');
  headline.className = 'rb-headline';
  container.appendChild(headline);

  const metaBits = [];
  if (product.event_title) metaBits.push(`事件：${product.event_title}`);
  if (product.contract_version) metaBits.push(product.contract_version);
  const briefId = product.brief_id || (product.trace && product.trace.brief_id);
  if (briefId) metaBits.push(String(briefId));
  if (metaBits.length) {
    const meta = el('div', metaBits.join(' · '));
    meta.className = 'rb-meta';
    container.appendChild(meta);
  }

  const pushText = (b, t) => b.appendChild(el('p', t));

  const execSummary = product.executive_summary;
  if (Array.isArray(execSummary) && execSummary.length) {
    addSection(container, '摘要', (b) => execSummary.forEach((t) => pushText(b, t)));
  } else if (product.executive_summary) {
    addSection(container, '摘要', (b) => pushText(b, product.executive_summary));
  }
  if (product.what_happened) addSection(container, '事实', (b) => pushText(b, product.what_happened));
  if (product.why_it_matters) {
    addSection(container, '意义', (b) => {
      if (Array.isArray(product.why_it_matters)) product.why_it_matters.forEach((t) => pushText(b, t));
      else pushText(b, product.why_it_matters);
    });
  }
  if (Array.isArray(product.key_drivers) && product.key_drivers.length) {
    addSection(container, '关键驱动', (b) => {
      product.key_drivers.forEach((d) => {
        const p = el('p', d.statement || '');
        if (d.support_level) {
          const tag = document.createElement('span');
          tag.className = `rb-support ${String(d.support_level).toLowerCase()}`;
          tag.textContent = String(d.support_level);
          p.appendChild(document.createTextNode(' '));
          p.appendChild(tag);
        }
        b.appendChild(p);
      });
    });
  }
  if (Array.isArray(product.contradictions) && product.contradictions.length) {
    addSection(container, '矛盾点', (b) =>
      product.contradictions.forEach((c) => pushText(b, `• ${String(c.statement || '')}`)));
  }
  if (Array.isArray(product.uncertainties) && product.uncertainties.length) {
    addSection(container, '不确定因素', (b) => product.uncertainties.forEach((u) => pushText(b, `• ${String(u)}`)));
  }
  if (Array.isArray(product.what_to_watch) && product.what_to_watch.length) {
    addSection(container, '关注点', (b) => product.what_to_watch.forEach((t) => pushText(b, `• ${String(t)}`)));
  }
  if (Array.isArray(product.source_refs) && product.source_refs.length) {
    addSection(container, '来源', (b) => {
      product.source_refs.forEach((s) => pushText(b, `• ${String(s)}`));
      if (product.trace && product.trace.judgment_id) pushText(b, `判断 ${product.trace.judgment_id}`);
    });
  }
  if (typeof product.confidence === 'number') {
    addSection(container, '置信度', (b) => pushText(b, String(product.confidence_display || product.confidence)));
  }
  if (Array.isArray(product.reasoning_limits) && product.reasoning_limits.length) {
    addSection(container, '边界', (b) => product.reasoning_limits.forEach((r) => pushText(b, r)));
  }

  const preliminary =
    String(product.executive_summary || '').includes('初步') ||
    (Array.isArray(product.reasoning_limits) &&
      product.reasoning_limits.some((r) => String(r).includes('初步')));
  const statusText = preliminary
    ? '初步判断 · 非投资建议'
    : product.contract_version === 'research.brief.v1' ? '研究简报 · 非投资建议' : '';
  if (statusText) {
    const status = el('div', statusText);
    status.className = 'rb-status';
    container.appendChild(status);
  }

  wrap.appendChild(container);
  return wrap;
}

// R4: julia.product.events.v1 envelope dispatch (R4 §10-14, §19).
// Validates the KNOWN envelope contract, selects the nested renderable
// research.brief.v1, and delegates to the single existing brief renderer.
// It never alters the canonical payload, never reaches the network, never
// rebuilds a judgment, never parses assistant prose, and never invents
// missing product fields.
function renderJuliaProductEventsEnvelope(envelope) {
  // Recognized top-level contract.
  if (!isJuliaProductEventsEnvelope(envelope)) {
    return renderUnsupported(envelope);
  }
  const nested = envelope.research_brief;
  // A valid envelope without a research_brief is a controlled non-brief state.
  if (!nested || typeof nested !== 'object') {
    return renderUnsupported(
      { contract_version: envelope.contract_version },
      `${JULIA_PRODUCT_EVENTS_V1}（未含可渲染研究简报）`
    );
  }
  // Only a recognized research.brief.v1 nested product is delegated to the
  // brief renderer. Wrong/unknown nested schema → controlled unsupported, no
  // guessing, no synthesis.
  if (!isResearchBrief(nested)) {
    const nestedVersion = nested.contract_version || nested.schema_version || 'unknown';
    return renderUnsupported(
      { contract_version: envelope.contract_version },
      `${JULIA_PRODUCT_EVENTS_V1} → 内嵌 ${nestedVersion}`
    );
  }
  return renderResearchBrief(nested);
}

// R4 top-level presentation dispatch (R4 §9, §52).
// Direct research.brief.v1 stays renderable (backward compatible, R2 path);
// the real canonical julia.product.events.v1 envelope selects its nested
// research_brief for view; anything else is a controlled unsupported state.
function renderStructuredProduct(product) {
  if (isResearchBrief(product)) {
    return renderResearchBrief(product);
  }
  if (isJuliaProductEventsEnvelope(product)) {
    return renderJuliaProductEventsEnvelope(product);
  }
  return renderUnsupported(product);
}

  return {
    renderStructuredProduct,
    renderResearchBrief,
    renderJuliaProductEventsEnvelope,
    isResearchBrief,
    isJuliaProductEventsEnvelope,
  };
});
