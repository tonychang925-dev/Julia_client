const { normalizeBrainEndpointUrl } = require('./endpoint-policy');
const { brainFetch, createTransportError } = require('./brain-fetch');

const DEFAULT_BRAIN_ENDPOINT = 'http://127.0.0.1:18089';
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const MAX_REQUEST_TIMEOUT_MS = 60000;

// CLIENT-TEXT-E2E-A2-R3 (Defect A): stream liveness budget.
// A valid Research Desk turn emits NO SSE bytes between POST acceptance and the
// final streamed Julia text (the C2 preliminary-judgment provider call is a
// synchronous chat bounded by a 60 s provider timeout). The backend therefore
// never keeps a LIVE turn silent beyond ~60 s before either bytes or a typed
// terminal SSE error frame arrives. The idle budget must exceed that governed
// ceiling with margin, or a healthy slow research turn is aborted as if dead:
//   30 s (old) < 60 s ceiling  → structurally invalid.
//   120 s (new) = 2 × 60 s ceiling (covers worst sequential pre-stream silence
//   D1 acquisition ≤20 s + C2 judgment ≤60 s = ~80 s with margin).
// Connect (transport establishment) and total (whole turn) stay distinct and
// finite: 30 s connect, 300 s total. A true stall (no bytes at all) still
// fails via idle at 120 s, and a slow-drip pathological stream still fails via
// the finite 300 s total.
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 120000;
const MAX_STREAM_IDLE_TIMEOUT_MS = 180000;
const DEFAULT_STREAM_TOTAL_TIMEOUT_MS = 300000;
const MAX_STREAM_TOTAL_TIMEOUT_MS = 300000;

function resolveTimeoutMs(value, defaultValue, maxValue, label) {
  if (value === undefined || value === null) return defaultValue;
  const timeoutMs = Number(value);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw createTransportError('invalid_timeout', `${label} must be a positive number`);
  }
  return Math.min(timeoutMs, maxValue);
}

function normalizeEndpoint(endpoint) {
  return normalizeBrainEndpointUrl(endpoint || DEFAULT_BRAIN_ENDPOINT);
}

function classifyTransportError(error, abortCode) {
  if (error?.name === 'AbortError') {
    if (abortCode === 'request_aborted') {
      return createTransportError('request_aborted', 'Julia request was aborted before completion');
    }
    const phase = abortCode || 'request';
    const label = phase === 'stream_idle' || phase === 'stream_total'
      ? `Julia stream ${phase.replace('stream_', '')} timeout`
      : 'Julia request timed out';
    return createTransportError('request_timeout', label, { phase });
  }
  if (typeof error?.code === 'string') return error;
  return createTransportError(
    'network_error',
    error?.message || 'Julia network request failed'
  );
}

function createAbortCoordinator(externalSignal) {
  const controller = new AbortController();
  let abortCode = null;

  const abortWith = (code) => {
    if (!abortCode) abortCode = code;
    controller.abort();
  };

  const forwardExternalAbort = () => abortWith('request_aborted');
  if (externalSignal) {
    if (externalSignal.aborted) forwardExternalAbort();
    else externalSignal.addEventListener('abort', forwardExternalAbort, { once: true });
  }

  const disconnectExternalSignal = () => {
    externalSignal?.removeEventListener?.('abort', forwardExternalAbort);
  };

  return { controller, abortWith, get abortCode() { return abortCode; }, disconnectExternalSignal };
}

function buildConversationTurnApiUrl(brainEndpoint, conversationId) {
  const id = String(conversationId || '').trim();
  if (!id) throw new Error('Conversation ID is required');
  return new URL(
    `/internal/v1/conversations/${encodeURIComponent(id)}/turns`,
    normalizeEndpoint(brainEndpoint)
  ).toString();
}

function buildConversationMessagesApiUrl(brainEndpoint, conversationId) {
  const id = String(conversationId || '').trim();
  if (!id) throw new Error('Conversation ID is required');
  return new URL(
    `/internal/v1/conversations/${encodeURIComponent(id)}/messages`,
    normalizeEndpoint(brainEndpoint)
  ).toString();
}

function buildConversationsApiUrl(brainEndpoint) {
  return new URL('/internal/v1/conversations', normalizeEndpoint(brainEndpoint)).toString();
}

function buildConversationDetailApiUrl(brainEndpoint, conversationId) {
  const id = String(conversationId || '').trim();
  if (!id) throw new Error('Conversation ID is required');
  return new URL(
    `/internal/v1/conversations/${encodeURIComponent(id)}`,
    normalizeEndpoint(brainEndpoint)
  ).toString();
}

async function getConversationDetail(conversationId, options = {}) {
  const response = await brainFetch(buildConversationDetailApiUrl(options.brainEndpoint, conversationId), {
    method: 'GET', headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const error = new Error(`Julia conversation detail failed: HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function getTextApiUrl(input, options = {}) {
  return buildConversationTurnApiUrl(resolveTextBrainEndpoint(options), input?.conversationId);
}

function getConversationTurnApiTemplate(options = {}) {
  const endpoint = resolveTextBrainEndpoint(options);
  return new URL('/internal/v1/conversations/{conversation_id}/turns', endpoint).toString();
}

function resolveTextBrainEndpoint(options = {}) {
  const envOverridePresent = Object.prototype.hasOwnProperty.call(
    process.env,
    'JULIA_TEXT_API_URL'
  );
  if (envOverridePresent) {
    return normalizeBrainEndpointUrl(process.env.JULIA_TEXT_API_URL);
  }
  return normalizeBrainEndpointUrl(options.brainEndpoint || DEFAULT_BRAIN_ENDPOINT);
}

function normalizeTurnRequest(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Conversation turn request must be an object');
  }

  const conversationId = String(input.conversationId || '').trim();
  const turnId = String(input.turnId || '').trim();
  const modality = String(input.modality || 'text').trim().toLowerCase();
  const text = String(input.input ?? input.text ?? '').trim();

  if (!conversationId) throw new Error('Conversation ID is required');
  if (!turnId) throw new Error('Turn ID is required');
  if (!['text', 'voice'].includes(modality)) throw new Error(`Unsupported modality: ${modality}`);
  if (!text) throw new Error('Text message is empty');
  if (text.length > 8000) throw new Error('Text message is too long');

  return { conversationId, turnId, modality, text };
}

function buildTurnBody(turn, stream) {
  return {
    turn_id: turn.turnId,
    modality: turn.modality,
    input: turn.text,
    stream,
  };
}

async function getConversationMessages(conversationId, options = {}) {
  const id = String(conversationId || '').trim();
  const url = buildConversationMessagesApiUrl(options.brainEndpoint, id);
  const response = await brainFetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const error = new Error(`Julia conversation sync failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ''}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  if (data?.conversation_id !== id) {
    throw new Error(`Julia conversation sync mismatch: ${data?.conversation_id || 'missing'} != ${id}`);
  }
  if (!Array.isArray(data.messages)) {
    throw new Error('Julia conversation sync response did not contain messages');
  }

  const messages = data.messages.filter((message) => {
    if (
      !message
      || !['user', 'assistant'].includes(message.role)
      || typeof message.message_id !== 'string'
      || (message.turn_id != null && typeof message.turn_id !== 'string')
      || typeof message.content !== 'string'
    ) return false;

    if (message.status === 'completed') return true;
    return message.role === 'assistant'
      && message.status === 'interrupted'
      && message.content.trim().length > 0;
  });
  return {
    conversation_id: id,
    title: typeof data.title === 'string' ? data.title : 'New Conversation',
    last_message_id: String(data.last_message_id || data.messages.at(-1)?.message_id || ''),
    messages,
  };
}

async function ensureConversationMessages(conversationId, _title = 'New Conversation', options = {}) {
  try {
    await getConversationDetail(conversationId, options);
  } catch (error) {
    if (error.status === 404) {
      const notFound = new Error(`Core conversation not found: ${conversationId}`);
      notFound.status = 404;
      notFound.code = 'CORE_CONVERSATION_NOT_FOUND';
      throw notFound;
    }
    throw error;
  }
  return getConversationMessages(conversationId, options);
}

async function listConversationsViaCore(options = {}) {
  const response = await brainFetch(buildConversationsApiUrl(options.brainEndpoint), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const error = new Error(`Julia conversation list failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ''}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const raw = Array.isArray(data) ? data : (Array.isArray(data?.conversations) ? data.conversations : data?.data);
  if (!Array.isArray(raw)) throw new Error('Julia conversation list response did not contain conversations');

  return raw.map((item) => {
    const conversationId = String(item?.conversation_id || item?.id || '').trim();
    if (!conversationId) return null;
    // Brain list API historically returned conversation_id as a title
    // placeholder. Treat a title that equals the conversation id as
    // untitled ("新会话") so the sidebar never shows raw IDs.
    const rawTitle = typeof item.title === 'string' ? item.title.trim() : '';
    const title = (rawTitle && rawTitle !== conversationId) ? rawTitle : '新会话';
    return {
      conversation_id: conversationId,
      title,
      created_at: item.created_at || item.createdAt || null,
      updated_at: item.updated_at || item.updatedAt || item.last_message_at || null,
      message_count: Number.isFinite(Number(item.message_count)) ? Number(item.message_count) : undefined,
      projection: { source: 'julia-core-canonical', authority: 'core_canonical_projection', stale: false },
    };
  }).filter(Boolean);
}

async function commitExternalTurns() {
  throw new Error('CC-1: Electron must not commit Voice workspace/external turns; Voice turns must flow S2S → Brain → ConversationRuntime under canonical conversation_id');
}

async function sendTextMessage(input, options = {}) {
  const turn = normalizeTurnRequest(input);
  const url = getTextApiUrl(turn, options);
  const timeoutMs = resolveTimeoutMs(
    options.timeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
    MAX_REQUEST_TIMEOUT_MS,
    'Request timeout'
  );
  const coordinator = createAbortCoordinator(options.signal);
  const timeout = setTimeout(() => coordinator.abortWith('request_timeout'), timeoutMs);

  let data;
  try {
    const response = await brainFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildTurnBody(turn, false)),
      signal: coordinator.controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw createTransportError(
        'http_error',
        `Julia text request failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ''}`,
        { status: response.status }
      );
    }
    data = await response.json();
  } catch (error) {
    throw classifyTransportError(error, coordinator.abortCode);
  } finally {
    clearTimeout(timeout);
    coordinator.disconnectExternalSignal();
  }
  if (data?.conversation_id && data.conversation_id !== turn.conversationId) {
    throw createTransportError(
      'response_mismatch',
      `Julia conversation mismatch: ${data.conversation_id} != ${turn.conversationId}`
    );
  }
  if (data?.turn_id && data.turn_id !== turn.turnId) {
    throw createTransportError(
      'response_mismatch',
      `Julia turn mismatch: ${data.turn_id} != ${turn.turnId}`
    );
  }

  const content = data?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Julia text response did not contain assistant content');
  }

  return {
    conversation_id: data.conversation_id || turn.conversationId,
    turn_id: data.turn_id || turn.turnId,
    role: 'assistant',
    content,
    status: data.status || 'completed',
    createdAt: new Date().toISOString(),
    source: 'julia-native-conversation',
  };
}

function parseOpenAiSseChunk(line) {
  if (!line.startsWith('data:')) return null;

  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') {
    return { done: payload === '[DONE]' };
  }

  try {
    const data = JSON.parse(payload);
    // A2-R2: the native text stream may carry a standalone structured product
    // frame (research.brief.v1) at the top level (NOT inside choices). Capture
    // it as a typed event instead of silently dropping it.
    if (data && typeof data === 'object' && 'product' in data) {
      return { product: data.product };
    }
    const delta = data?.choices?.[0]?.delta?.content || '';
    const finishReason = data?.choices?.[0]?.finish_reason || null;
    return {
      done: finishReason === 'stop',
      delta,
      error: finishReason === 'error' ? (delta || 'Julia conversation turn failed') : null,
    };
  } catch (error) {
    return {
      done: false,
      error: `Invalid Julia text stream chunk: ${error.message}`,
    };
  }
}

async function streamTextMessage(input, handlers = {}, options = {}) {
  const turn = normalizeTurnRequest(input);
  const url = getTextApiUrl(turn, options);
  const onDelta = typeof handlers.onDelta === 'function' ? handlers.onDelta : () => {};
  const onProduct = typeof handlers.onProduct === 'function' ? handlers.onProduct : () => {};
  const connectTimeoutMs = resolveTimeoutMs(
    options.connectTimeoutMs ?? options.timeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
    MAX_REQUEST_TIMEOUT_MS,
    'Stream connect timeout'
  );
  const idleTimeoutMs = resolveTimeoutMs(
    options.streamIdleTimeoutMs,
    DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    MAX_STREAM_IDLE_TIMEOUT_MS,
    'Stream idle timeout'
  );
  const totalTimeoutMs = resolveTimeoutMs(
    options.streamTotalTimeoutMs,
    DEFAULT_STREAM_TOTAL_TIMEOUT_MS,
    MAX_STREAM_TOTAL_TIMEOUT_MS,
    'Stream total timeout'
  );
  const coordinator = createAbortCoordinator(options.signal);
  const totalTimeout = setTimeout(() => coordinator.abortWith('stream_total'), totalTimeoutMs);
  const connectTimeout = setTimeout(() => coordinator.abortWith('request_timeout'), connectTimeoutMs);
  let idleTimeout = null;
  const resetIdleTimeout = () => {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => coordinator.abortWith('stream_idle'), idleTimeoutMs);
  };

  let response;
  try {
    response = await brainFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildTurnBody(turn, true)),
      signal: coordinator.controller.signal,
    });
  } catch (error) {
    clearTimeout(totalTimeout);
    coordinator.disconnectExternalSignal();
    throw classifyTransportError(error, coordinator.abortCode);
  } finally {
    clearTimeout(connectTimeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    clearTimeout(totalTimeout);
    coordinator.disconnectExternalSignal();
    throw createTransportError(
      'http_error',
      `Julia text stream failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ''}`,
      { status: response.status }
    );
  }

  if (!response.body) {
    clearTimeout(totalTimeout);
    coordinator.disconnectExternalSignal();
    throw createTransportError('stream_protocol_error', 'Julia text stream did not provide a response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let product = null;
  let sawCompletion = false;
  resetIdleTimeout();

  try {
    while (!sawCompletion) {
      const { done, value } = await reader.read();
      if (value) {
        resetIdleTimeout();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          const parsed = parseOpenAiSseChunk(line);
          if (!parsed) continue;
          if (parsed.error) {
            throw createTransportError('stream_semantic_error', parsed.error);
          }
          if (parsed.done) {
            sawCompletion = true;
            break;
          }
          if (parsed.product) {
            // A2-R2: typed structured-product event (research.brief.v1). The
            // product is realtime delivery only; canonical authority comes from
            // Core read-back on sync. Unknown products are preserved raw and
            // surfaced to the caller (renderer decides support) — never
            // silently dropped.
            if (!product) {
              product = parsed.product;
              onProduct(parsed.product);
            }
            continue;
          }
          if (parsed.delta) {
            content += parsed.delta;
            onDelta(parsed.delta, content);
          }
        }
      }

      if (done) break;
    }

    if (buffer.trim()) {
      const parsed = parseOpenAiSseChunk(buffer.trim());
      if (parsed?.error) {
        throw createTransportError('stream_semantic_error', parsed.error);
      }
      if (parsed?.delta) {
        content += parsed.delta;
        onDelta(parsed.delta, content);
      }
      if (parsed?.done) sawCompletion = true;
    }

    if (!sawCompletion) {
      throw createTransportError(
        'stream_protocol_error',
        'Julia text stream ended without a completion marker'
      );
    }
  } catch (error) {
    throw classifyTransportError(error, coordinator.abortCode);
  } finally {
    clearTimeout(idleTimeout);
    clearTimeout(totalTimeout);
    coordinator.disconnectExternalSignal();
    reader.cancel().catch(() => {});
  }

  if (!content.trim()) {
    throw createTransportError(
      'stream_protocol_error',
      'Julia text stream completed without assistant content'
    );
  }

  return {
    conversation_id: turn.conversationId,
    turn_id: turn.turnId,
    role: 'assistant',
    content,
    status: 'completed',
    createdAt: new Date().toISOString(),
    source: 'julia-native-conversation-stream',
    product: product || null,
  };
}

async function createConversationViaCore(title = 'New Conversation', options = {}) {
  const url = buildConversationsApiUrl(options.brainEndpoint);
  const response = await brainFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Core create failed: HTTP ${response.status}${body ? ` ${body.slice(0, 200)}` : ''}`);
  }
  return response.json();
}

async function renameConversationViaCore(conversationId, title, options = {}) {
  const id = String(conversationId || '').trim();
  if (!id) throw new Error('Conversation ID is required');
  const url = buildConversationDetailApiUrl(options.brainEndpoint, id);
  const response = await brainFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Core rename failed: HTTP ${response.status}${body ? ` ${body.slice(0, 200)}` : ''}`);
  }
  return response.json();
}

async function deleteConversationViaCore(conversationId, options = {}) {
  const id = String(conversationId || '').trim();
  if (!id) throw new Error('Conversation ID is required');
  const url = buildConversationDetailApiUrl(options.brainEndpoint, id);
  const response = await brainFetch(url, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    // A Core-orphaned local projection (id unknown to Brain) is still deleted
    // locally: treat 404 as "already gone from Core" so deletion succeeds.
    if (response.status === 404) {
      return { status: 'deleted', conversation_id: id, core_present: false };
    }
    const body = await response.text().catch(() => '');
    throw new Error(`Core delete failed: HTTP ${response.status}${body ? ` ${body.slice(0, 200)}` : ''}`);
  }
  return response.json();
}

module.exports = {
  DEFAULT_BRAIN_ENDPOINT,
  buildConversationMessagesApiUrl,
  buildConversationDetailApiUrl,
  buildConversationsApiUrl,
  buildConversationTurnApiUrl,
  buildTurnBody,
  getConversationTurnApiTemplate,
  getConversationMessages,
  getConversationDetail,
  ensureConversationMessages,
  listConversationsViaCore,
  createConversationViaCore,
  renameConversationViaCore,
  deleteConversationViaCore,
  commitExternalTurns,
  getTextApiUrl,
  normalizeTurnRequest,
  parseOpenAiSseChunk,
  sendTextMessage,
  streamTextMessage,
};
