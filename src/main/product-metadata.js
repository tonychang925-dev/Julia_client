const PRODUCT_METADATA_VERSION = 'julia.product.events.v1';
const PRODUCT_EVENT_TYPES = new Set([
  'capability.started',
  'capability.completed',
  'capability.failed',
  'capability.cancelled',
  'research_brief',
  'trace',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(source, field) {
  const value = source[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Product metadata ${field} must be a non-empty string`);
  }
  return value;
}

function normalizeProductEvent(event) {
  if (!isPlainObject(event)) throw new Error('Product event must be an object');

  const type = readString(event, 'type');
  if (!PRODUCT_EVENT_TYPES.has(type)) {
    throw new Error(`Unsupported product event type: ${type}`);
  }

  const normalized = { type };
  for (const field of [
    'conversation_id',
    'turn_id',
    'capability_request_id',
    'capability_call_id',
    'correlation_id',
  ]) {
    const value = readString(event, field);
    if (value !== undefined) normalized[field] = value;
  }

  if (event.payload !== undefined) {
    if (!isPlainObject(event.payload)) throw new Error('Product event payload must be an object');
    normalized.payload = event.payload;
  }

  return normalized;
}

function normalizeProductMetadata(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) throw new Error('Product metadata must be an object');
  if (value.contract_version !== PRODUCT_METADATA_VERSION) {
    throw new Error(`Unsupported product metadata contract version: ${value.contract_version}`);
  }
  if (!Array.isArray(value.events)) throw new Error('Product metadata events must be an array');

  return {
    contract_version: PRODUCT_METADATA_VERSION,
    events: value.events.map(normalizeProductEvent),
    research_brief: value.research_brief === undefined ? undefined : value.research_brief,
    trace: value.trace === undefined ? undefined : value.trace,
  };
}

module.exports = {
  PRODUCT_EVENT_TYPES,
  PRODUCT_METADATA_VERSION,
  normalizeProductEvent,
  normalizeProductMetadata,
};
