(function () {
  const BRIEF_CONTRACT_VERSION = 'research.brief.v1';
  const PRODUCT_STATUS_LABELS = {
    'capability.started': 'researching',
    'capability.completed': 'completed',
    'capability.failed': 'failed',
    'capability.cancelled': 'cancelled',
  };

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function requireNonEmptyString(value, field) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`ResearchBrief ${field} must be a non-empty string`);
    }
  }

  function requireArray(value, field) {
    if (!Array.isArray(value)) throw new Error(`ResearchBrief ${field} must be an array`);
  }

  function validateResearchBrief(value) {
    if (!isPlainObject(value)) throw new Error('ResearchBrief must be an object');
    if (value.contract_version !== BRIEF_CONTRACT_VERSION) {
      throw new Error(`Unsupported ResearchBrief contract version: ${value.contract_version}`);
    }

    for (const field of [
      'brief_id',
      'event_title',
      'headline',
      'executive_summary',
      'what_happened',
      'why_it_matters',
    ]) {
      requireNonEmptyString(value[field], field);
    }

    if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence)) {
      if (typeof value.confidence !== 'string' || !value.confidence.trim()) {
        throw new Error('ResearchBrief confidence must be a finite number or non-empty string');
      }
    }

    for (const field of [
      'key_drivers',
      'evidence_snapshot',
      'contradictions',
      'uncertainties',
      'what_to_watch',
      'reasoning_limits',
      'source_refs',
    ]) {
      requireArray(value[field], field);
    }

    if (!isPlainObject(value.trace)) throw new Error('ResearchBrief trace must be an object');
    for (const traceValue of Object.values(value.trace)) {
      if (!['string', 'number', 'boolean'].includes(typeof traceValue)) {
        throw new Error('ResearchBrief trace values must be scalar');
      }
    }

    return value;
  }

  function createText(className, text) {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = String(text ?? '');
    return element;
  }

  function appendSection(container, title, content) {
    container.appendChild(createText('research-section-title', title));
    container.appendChild(createText('research-section-body', content));
  }

  function appendList(container, title, values) {
    if (values.length === 0) return;
    container.appendChild(createText('research-section-title', title));
    const list = document.createElement('ul');
    list.className = 'research-list';
    for (const value of values) {
      const item = document.createElement('li');
      item.className = 'research-list-item';
      item.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      list.appendChild(item);
    }
    container.appendChild(list);
  }

  function appendTrace(container, trace) {
    container.appendChild(createText('research-section-title', 'Trace'));
    const list = document.createElement('dl');
    list.className = 'research-trace';
    for (const [key, value] of Object.entries(trace)) {
      const term = document.createElement('dt');
      term.textContent = key;
      const description = document.createElement('dd');
      description.textContent = String(value);
      list.append(term, description);
    }
    container.appendChild(list);
  }

  function renderResearchBrief(value) {
    const brief = validateResearchBrief(value);
    const container = document.createElement('section');
    container.className = 'research-brief';
    container.dataset.briefId = brief.brief_id;
    container.dataset.contractVersion = brief.contract_version;

    container.appendChild(createText('research-event-title', brief.event_title));
    container.appendChild(createText('research-headline', brief.headline));
    appendSection(container, 'Executive summary', brief.executive_summary);
    appendSection(container, 'What happened', brief.what_happened);
    appendSection(container, 'Why it matters', brief.why_it_matters);
    appendList(container, 'Key drivers', brief.key_drivers);
    appendList(container, 'Evidence snapshot', brief.evidence_snapshot);
    appendList(container, 'Contradictions', brief.contradictions);
    appendList(container, 'Uncertainties', brief.uncertainties);
    appendList(container, 'What to watch', brief.what_to_watch);
    appendSection(container, 'Confidence', brief.confidence);
    appendList(container, 'Reasoning limits', brief.reasoning_limits);
    appendList(container, 'Source references', brief.source_refs);
    appendTrace(container, brief.trace);

    return container;
  }

  function renderProductStatus(event) {
    const label = PRODUCT_STATUS_LABELS[event?.type];
    if (!label) return null;

    const status = document.createElement('div');
    status.className = 'product-status';
    status.dataset.capabilityStatus = event.type;
    status.textContent = label;
    return status;
  }

  function validateProductMetadata(value) {
    if (!isPlainObject(value)) throw new Error('Product metadata must be an object');
    if (value.contract_version !== 'julia.product.events.v1') {
      throw new Error(`Unsupported product metadata contract version: ${value.contract_version}`);
    }
    if (!Array.isArray(value.events)) throw new Error('Product metadata events must be an array');
    return value;
  }

  window.JuliaProductProjection = {
    validateProductMetadata,
    validateResearchBrief,
    renderProductStatus,
    renderResearchBrief,
  };

  if (typeof module !== 'undefined') {
    module.exports = {
      validateProductMetadata,
      validateResearchBrief,
      renderProductStatus,
      renderResearchBrief,
    };
  }
}());
