function bindingError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function bindCanonicalTextTurn(conversation, input) {
  const requestId = String(input?.requestId || '').trim();
  const text = String(input?.text || '').trim();
  const conversationId = String(conversation?.conversation_id || '').trim();

  if (!requestId) {
    throw bindingError('JULIA_TEXT_TURN_ID_MISSING', 'Text request is missing requestId/turn_id');
  }
  if (!conversationId) {
    throw bindingError('JULIA_TEXT_CONVERSATION_ID_MISSING', 'No active canonical conversation is bound');
  }
  if (!text) {
    throw bindingError('JULIA_TEXT_INPUT_EMPTY', 'Text message is empty');
  }

  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const userMatches = messages.filter((message) =>
    message?.role === 'user' &&
    String(message?.turn_id || '').trim() === requestId
  );

  if (userMatches.length !== 1) {
    throw bindingError(
      'JULIA_TEXT_LOCAL_TURN_BINDING_INVALID',
      `Expected exactly one local user message for turn ${requestId}, found ${userMatches.length}`
    );
  }

  const userMessage = userMatches[0];
  if (String(userMessage.modality || 'text') !== 'text') {
    throw bindingError('JULIA_TEXT_LOCAL_TURN_MODALITY_MISMATCH', 'Local turn is not text modality');
  }
  if (String(userMessage.content || '').trim() !== text) {
    throw bindingError('JULIA_TEXT_LOCAL_TURN_CONTENT_MISMATCH', 'Local turn content does not match outbound text');
  }

  const alreadySettled = messages.some((message) =>
    message?.role === 'assistant' &&
    String(message?.turn_id || '').trim() === requestId
  );
  if (alreadySettled) {
    throw bindingError(
      'JULIA_TEXT_LOCAL_TURN_ALREADY_SETTLED',
      `Turn ${requestId} already has an assistant message`
    );
  }

  return {
    text,
    conversationId,
    turnId: requestId,
    modality: 'text',
  };
}

module.exports = {
  bindCanonicalTextTurn,
};
