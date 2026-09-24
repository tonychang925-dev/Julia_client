const DEFAULT_TEXT_API_URL = 'http://127.0.0.1:18089/v1/chat/completions';

function buildTextApiUrl(brainEndpoint) {
  return new URL('/v1/chat/completions', brainEndpoint).toString();
}

function getTextApiUrl(options = {}) {
  if (process.env.JULIA_TEXT_API_URL) return process.env.JULIA_TEXT_API_URL;
  if (options.brainEndpoint) return buildTextApiUrl(options.brainEndpoint);
  return DEFAULT_TEXT_API_URL;
}

function assertTextMessage(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Text request must be an object');
  }

  const conversationId = String(input.conversationId || '').trim();
  const turnId = String(input.turnId || '').trim();
  const text = String(input.text || '').trim();
  if (!conversationId) throw new Error('Conversation ID is required');
  if (!turnId) throw new Error('Turn ID is required');
  if (!text) throw new Error('Text message is empty');
  if (text.length > 8000) throw new Error('Text message is too long');

  return { conversationId, turnId, text };
}

function assertConversationTurnEcho(data, turn) {
  if (data?.conversation_id && data.conversation_id !== turn.conversationId) {
    throw new Error(`Julia conversation mismatch: ${data.conversation_id} != ${turn.conversationId}`);
  }
  if (data?.turn_id && data.turn_id !== turn.turnId) {
    throw new Error(`Julia turn mismatch: ${data.turn_id} != ${turn.turnId}`);
  }
}

function createStreamSemanticError(error) {
  if (typeof error === 'string') {
    const stringError = new Error(error);
    stringError.code = 'stream_semantic_error';
    return stringError;
  }

  const semanticError = new Error(error?.message || 'Julia conversation turn failed');
  semanticError.code = 'stream_semantic_error';
  if (error?.type) semanticError.serverErrorType = error.type;
  if (error?.code) semanticError.serverErrorCode = error.code;
  return semanticError;
}

async function sendTextMessage(input, options = {}) {
  const turn = assertTextMessage(input);
  const url = getTextApiUrl(options);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'julia-brain',
      conversation_id: turn.conversationId,
      turn_id: turn.turnId,
      stream: false,
      messages: [
        {
          role: 'user',
          content: turn.text,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Julia text request failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ''}`);
  }

  const data = await response.json();
  assertConversationTurnEcho(data, turn);
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Julia text response did not contain assistant content');
  }

  return {
    conversation_id: turn.conversationId,
    turn_id: turn.turnId,
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
    source: 'julia-brain-text',
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
    if (data && typeof data === 'object' && data.error && typeof data.error === 'object') {
      return { error: data.error };
    }
    const delta = data?.choices?.[0]?.delta?.content || '';
    const finishReason = data?.choices?.[0]?.finish_reason || null;
    return {
      data,
      done: finishReason === 'stop',
      delta,
    };
  } catch (error) {
    return {
      done: false,
      error: `Invalid Julia text stream chunk: ${error.message}`,
    };
  }
}

async function streamTextMessage(input, handlers = {}, options = {}) {
  const turn = assertTextMessage(input);
  const url = getTextApiUrl(options);
  const onDelta = typeof handlers.onDelta === 'function' ? handlers.onDelta : () => {};

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'julia-brain',
      conversation_id: turn.conversationId,
      turn_id: turn.turnId,
      stream: true,
      messages: [
        {
          role: 'user',
          content: turn.text,
        },
      ],
    }),
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
        assertConversationTurnEcho(parsed.data, turn);
        if (parsed.error) throw createStreamSemanticError(parsed.error);
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
    assertConversationTurnEcho(parsed?.data, turn);
    if (parsed?.error) throw createStreamSemanticError(parsed.error);
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
    createdAt: new Date().toISOString(),
    source: 'julia-brain-text-stream',
  };
}

module.exports = {
  DEFAULT_TEXT_API_URL,
  buildTextApiUrl,
  getTextApiUrl,
  sendTextMessage,
  streamTextMessage,
  parseOpenAiSseChunk,
};
