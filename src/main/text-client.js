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

function buildExternalTurnsApiUrl(brainEndpoint, conversationId) {
  const id = String(conversationId || '').trim();
  if (!id) throw new Error('Conversation ID is required');
  return new URL(
    `/internal/v1/conversations/${encodeURIComponent(id)}/external-turns`,
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
      || typeof message.turn_id !== 'string'
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

async function ensureConversationMessages(conversationId, title = 'New Conversation', options = {}) {
  try {
    await getConversationDetail(conversationId, options);
  } catch (error) {
    if (error.status !== 404) throw error;
    const response = await fetch(buildConversationsApiUrl(options.brainEndpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, title }),
    });
    if (!response.ok && response.status !== 409) {
      const body = await response.text().catch(() => '');
      throw new Error(`Julia conversation create failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ''}`);
    }
  }
  return getConversationMessages(conversationId, options);
}

async function commitExternalTurns(input, options = {}) {
  const conversationId = String(input?.conversationId || '').trim();
  const turns = Array.isArray(input?.turns) ? input.turns : [];
  if (!conversationId) throw new Error('Conversation ID is required');
  if (!turns.length) return {
    conversation_id: conversationId,
    appended_turn_ids: [],
    skipped_turn_ids: [],
    empty: true,
  };
  const url = buildExternalTurnsApiUrl(options.brainEndpoint, conversationId);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      source: 'voice-s2s',
      source_session_id: String(input.voiceSessionId || ''),
      base_last_message_id: String(input.baseLastMessageId || ''),
      turns,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Voice workspace commit failed: HTTP ${response.status}`);
    error.code = data.code || `http_${response.status}`;
    error.status = response.status;
    throw error;
  }
  if (data.conversation_id !== conversationId) {
    throw new Error(`Voice workspace commit mismatch: ${data.conversation_id || 'missing'} != ${conversationId}`);
  }
  return data;
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
    throw new Error(`Julia conversation create failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ''}`);
  }
  const data = await response.json();
  return {
    conversation_id: data.conversation_id,
    title: data.title,
    created_at: data.created_at,
    durable: true,
  };
}

module.exports = {
  DEFAULT_BRAIN_ENDPOINT,
  buildConversationMessagesApiUrl,
  buildConversationDetailApiUrl,
  buildConversationsApiUrl,
  buildConversationTurnApiUrl,
  buildExternalTurnsApiUrl,
  buildTurnBody,
  getConversationTurnApiTemplate,
  getConversationMessages,
  getConversationDetail,
  ensureConversationMessages,
  createConversationViaCore,
  commitExternalTurns,
  getTextApiUrl,
  normalizeTurnRequest,
  parseOpenAiSseChunk,
  sendTextMessage,
  streamTextMessage,
};
