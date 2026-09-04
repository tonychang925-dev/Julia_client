const DEFAULT_TEXT_API_URL = 'http://127.0.0.1:18089/v1/chat/completions';
const { normalizeProductEvent, normalizeProductMetadata } = require('./product-metadata');

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

  const text = String(input.text || '').trim();
  if (!text) throw new Error('Text message is empty');
  if (text.length > 8000) throw new Error('Text message is too long');

  return text;
}

function readIdentity(input) {
  const conversationId = input?.conversation_id;
  const turnId = input?.turn_id;

  if (conversationId !== undefined && (typeof conversationId !== 'string' || !conversationId.trim())) {
    throw new Error('Conversation ID must be a non-empty string');
  }
  if (turnId !== undefined && (typeof turnId !== 'string' || !turnId.trim())) {
    throw new Error('Turn ID must be a non-empty string');
  }

  return {
    ...(conversationId ? { conversation_id: conversationId } : {}),
    ...(turnId ? { turn_id: turnId } : {}),
  };
}

async function sendTextMessage(input, options = {}) {
  const text = assertTextMessage(input);
  const url = getTextApiUrl(options);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...readIdentity(input),
      model: 'julia-brain',
      stream: false,
      messages: [
        {
          role: 'user',
          content: text,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Julia text request failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ''}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Julia text response did not contain assistant content');
  }

  return {
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
    source: 'julia-brain-text',
    ...(data.product ? { metadata: normalizeProductMetadata(data.product) } : {}),
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
    const productEvents = data?.product?.events;
    return {
      done: finishReason === 'stop',
      delta,
      product: data?.product,
      productEvents: Array.isArray(productEvents)
        ? productEvents.map(normalizeProductEvent)
        : undefined,
    };
  } catch (error) {
    return {
      done: false,
      error: `Invalid Julia text stream chunk: ${error.message}`,
    };
  }
}

async function streamTextMessage(input, handlers = {}, options = {}) {
  const text = assertTextMessage(input);
  const url = getTextApiUrl(options);
  const onDelta = typeof handlers.onDelta === 'function' ? handlers.onDelta : () => {};
  const onProductEvent = typeof handlers.onProductEvent === 'function' ? handlers.onProductEvent : () => {};

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...readIdentity(input),
      model: 'julia-brain',
      stream: true,
      messages: [
        {
          role: 'user',
          content: text,
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
  let productMetadata = null;
  const productEvents = [];
  let researchBrief;
  let trace;

  const accumulateProductMetadata = (metadata) => {
    if (!metadata) return;
    productEvents.push(...metadata.events);
    if (metadata.research_brief !== undefined) researchBrief = metadata.research_brief;
    if (metadata.trace !== undefined) trace = metadata.trace;
    productMetadata = {
      contract_version: metadata.contract_version,
      events: productEvents,
      ...(researchBrief === undefined ? {} : { research_brief: researchBrief }),
      ...(trace === undefined ? {} : { trace }),
    };
  };

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
        if (parsed.product !== undefined) accumulateProductMetadata(normalizeProductMetadata(parsed.product));
        if (parsed.productEvents) {
          for (const productEvent of parsed.productEvents) onProductEvent(productEvent);
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
    if (parsed?.error) throw new Error(parsed.error);
    if (parsed?.productEvents) {
      for (const productEvent of parsed.productEvents) onProductEvent(productEvent);
    }
    if (parsed?.delta) {
      content += parsed.delta;
      onDelta(parsed.delta, content);
    }
  }

  if (!content.trim()) {
    throw new Error('Julia text stream completed without assistant content');
  }

  return {
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
    source: 'julia-brain-text-stream',
    ...(productMetadata ? { metadata: productMetadata } : {}),
  };
}

module.exports = {
  DEFAULT_TEXT_API_URL,
  buildTextApiUrl,
  getTextApiUrl,
  sendTextMessage,
  streamTextMessage,
};
