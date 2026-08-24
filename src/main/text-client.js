const DEFAULT_BRAIN_ENDPOINT = 'http://127.0.0.1:18089';

function buildConversationTurnApiUrl(brainEndpoint, conversationId) {
  const id = String(conversationId || '').trim();
  if (!id) throw new Error('Conversation ID is required');
  return new URL(
    `/internal/v1/conversations/${encodeURIComponent(id)}/turns`,
    brainEndpoint || DEFAULT_BRAIN_ENDPOINT
  ).toString();
}

function buildConversationMessagesApiUrl(brainEndpoint, conversationId) {
  const id = String(conversationId || '').trim();
  if (!id) throw new Error('Conversation ID is required');
  return new URL(
    `/internal/v1/conversations/${encodeURIComponent(id)}/messages`,
    brainEndpoint || DEFAULT_BRAIN_ENDPOINT
  ).toString();
}

function buildConversationsApiUrl(brainEndpoint) {
  return new URL('/internal/v1/conversations', brainEndpoint || DEFAULT_BRAIN_ENDPOINT).toString();
}

function buildConversationDetailApiUrl(brainEndpoint, conversationId) {
  const id = String(conversationId || '').trim();
  if (!id) throw new Error('Conversation ID is required');
  return new URL(
    `/internal/v1/conversations/${encodeURIComponent(id)}`,
    brainEndpoint || DEFAULT_BRAIN_ENDPOINT
  ).toString();
}

async function getConversationDetail(conversationId, options = {}) {
  const response = await fetch(buildConversationDetailApiUrl(options.brainEndpoint, conversationId), {
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
  if (process.env.JULIA_TEXT_API_URL) {
    return buildConversationTurnApiUrl(process.env.JULIA_TEXT_API_URL, input?.conversationId);
  }
  return buildConversationTurnApiUrl(options.brainEndpoint, input?.conversationId);
}

function getConversationTurnApiTemplate(options = {}) {
  const endpoint = process.env.JULIA_TEXT_API_URL || options.brainEndpoint || DEFAULT_BRAIN_ENDPOINT;
  return new URL('/internal/v1/conversations/{conversation_id}/turns', endpoint).toString();
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
  const response = await fetch(url, {
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
  const response = await fetch(buildConversationsApiUrl(options.brainEndpoint), {
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildTurnBody(turn, false)),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Julia text request failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ''}`);
  }

  const data = await response.json();
  if (data?.conversation_id && data.conversation_id !== turn.conversationId) {
    throw new Error(`Julia conversation mismatch: ${data.conversation_id} != ${turn.conversationId}`);
  }
  if (data?.turn_id && data.turn_id !== turn.turnId) {
    throw new Error(`Julia turn mismatch: ${data.turn_id} != ${turn.turnId}`);
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildTurnBody(turn, true)),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Julia text stream failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ''}`);
  }

  if (!response.body) {
    throw new Error('Julia text stream did not provide a response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const parsed = parseOpenAiSseChunk(line);
        if (!parsed) continue;
        if (parsed.error) throw new Error(parsed.error);
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
    if (parsed?.error) throw new Error(parsed.error);
    if (parsed?.delta) {
      content += parsed.delta;
      onDelta(parsed.delta, content);
    }
  }

  if (!content.trim()) {
    throw new Error('Julia text stream completed without assistant content');
  }

  return {
    conversation_id: turn.conversationId,
    turn_id: turn.turnId,
    role: 'assistant',
    content,
    status: 'completed',
    createdAt: new Date().toISOString(),
    source: 'julia-native-conversation-stream',
  };
}

async function createConversationViaCore(title = 'New Conversation', options = {}) {
  const url = buildConversationsApiUrl(options.brainEndpoint);
  const response = await fetch(url, {
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
  const response = await fetch(url, {
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
  const response = await fetch(url, {
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
