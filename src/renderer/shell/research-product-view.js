'use strict';
/* A2-R2 structured-product view for research.brief.v1.
 *
 * Pure DOM builder. Dispatch is by explicit product type/schema_version — never
 * by prose parsing. Presentation-only: no fabricated fields, no trading
 * guidance, no promotion of transient product to canonical authority.
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

function el(tagName, text) {
  const node = document.createElement(tagName);
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function isResearchBrief(product) {
  const type = product && (product.product_type || product.contract_version);
  const version = product && (product.schema_version || product.contract_version);
  return (
    type === 'research.brief.v1' ||
    version === 'research.brief.v1' ||
    (product && product.headline && product.contract_version === 'research.brief.v1')
  );
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

function renderResearchBrief(product) {
  const wrap = el('div', null);
  wrap.className = 'structured-product';

  if (!isResearchBrief(product)) {
    wrap.className += ' unsupported';
    const tag = el('div', null);
    tag.className = 'structured-product-tag';
    const version = product && (product.schema_version || product.contract_version);
    tag.textContent = `结构化产品（暂不支持渲染）: ${version || 'unknown'}`;
    wrap.appendChild(tag);
    return wrap;
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

  return {
    renderStructuredProduct: renderResearchBrief,
    renderResearchBrief,
    isResearchBrief,
  };
});
