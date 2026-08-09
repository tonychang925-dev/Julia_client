const DEFAULT_TEXT_API_URL = 'http://127.0.0.1:18089/v1/chat/completions';

function getTextApiUrl() {
  return process.env.JULIA_TEXT_API_URL || DEFAULT_TEXT_API_URL;
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

async function sendTextMessage(input) {
  const text = assertTextMessage(input);
  const url = getTextApiUrl();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
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
  };
}

module.exports = {
  DEFAULT_TEXT_API_URL,
  getTextApiUrl,
  sendTextMessage,
};
