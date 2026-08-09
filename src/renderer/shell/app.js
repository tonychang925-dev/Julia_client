const params = new URLSearchParams(window.location.search);
const webVoiceUrl = params.get('voiceUrl') || 'http://localhost:7860/';

const app = document.getElementById('app');
const textSurface = document.getElementById('textSurface');
const voiceSurface = document.getElementById('voiceSurface');
const textModeButton = document.getElementById('textModeButton');
const voiceModeButton = document.getElementById('voiceModeButton');
const composerVoiceButton = document.getElementById('composerVoiceButton');
const backToTextButton = document.getElementById('backToTextButton');
const openVoiceButton = document.getElementById('openVoiceButton');
const voiceUrlLabel = document.getElementById('voiceUrlLabel');
const thread = document.getElementById('conversationThread');
const composerForm = document.getElementById('composerForm');
const composerInput = document.getElementById('composerInput');
const composerSend = document.getElementById('composerSend');
const newChatButton = document.getElementById('newChatButton');
const conversationList = document.getElementById('conversationList');
const emptyConversationList = document.getElementById('emptyConversationList');

const textClient = window.juliaElectronV2;
let sending = false;
let activeConversationId = null;
const activeTextStreams = new Map();

voiceUrlLabel.textContent = webVoiceUrl;

function setMode(mode) {
  const isVoice = mode === 'voice';
  app.dataset.mode = mode;
  textSurface.classList.toggle('hidden', isVoice);
  voiceSurface.classList.toggle('hidden', !isVoice);
  textModeButton.classList.toggle('active', !isVoice);
  voiceModeButton.classList.toggle('active', isVoice);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function renderTextBlock(text) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${renderInlineMarkdown(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function renderMessageContent(content) {
  const raw = String(content || '');
  const fragment = document.createDocumentFragment();
  const fencePattern = /```(\w+)?\n([\s\S]*?)```/g;
  let cursor = 0;
  let match;

  while ((match = fencePattern.exec(raw)) !== null) {
    const before = raw.slice(cursor, match.index);
    if (before) {
      const textBlock = document.createElement('div');
      textBlock.className = 'message-text';
      textBlock.innerHTML = renderTextBlock(before);
      fragment.appendChild(textBlock);
    }

    const codeBlock = document.createElement('div');
    codeBlock.className = 'code-block';

    const header = document.createElement('div');
    header.className = 'code-header';

    const lang = document.createElement('span');
    lang.textContent = match[1] || 'code';

    const copy = document.createElement('button');
    copy.className = 'copy-button';
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.dataset.copyText = match[2] || '';

    header.append(lang, copy);

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = match[2] || '';
    pre.appendChild(code);

    codeBlock.append(header, pre);
    fragment.appendChild(codeBlock);
    cursor = fencePattern.lastIndex;
  }

  const rest = raw.slice(cursor);
  if (rest || fragment.childNodes.length === 0) {
    const textBlock = document.createElement('div');
    textBlock.className = 'message-text';
    textBlock.innerHTML = renderTextBlock(rest);
    fragment.appendChild(textBlock);
  }

  return fragment;
}

function createMessage(role, content, options = {}) {
  const message = document.createElement('div');
  message.className = `message ${role}`;
  if (options.pending) message.dataset.pending = 'true';

  const roleEl = document.createElement('div');
  roleEl.className = 'role';
  roleEl.textContent = role === 'user' ? 'Tony' : 'Julia';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.appendChild(renderMessageContent(content));

  message.append(roleEl, bubble);
  return message;
}

function createWelcomeMessage() {
  const welcome = document.createElement('div');
  welcome.className = 'empty-thread';
  welcome.textContent = 'Start a new conversation with Julia.';
  return welcome;
}

function appendMessage(role, content, options) {
  const message = createMessage(role, content, options);
  thread.appendChild(message);
  thread.scrollTop = thread.scrollHeight;
  return message;
}

function renderConversationMessages(conversation) {
  thread.replaceChildren();

  const messages = conversation?.messages || [];
  if (messages.length === 0) {
    thread.appendChild(createWelcomeMessage());
    return;
  }

  for (const message of messages) {
    appendMessage(message.role, message.content);
  }
}

function formatConversationTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function renderConversationList(items) {
  conversationList.replaceChildren();
  emptyConversationList.classList.toggle('hidden', items.length > 0);

  if (items.length === 0) return;

  const group = document.createElement('div');
  group.className = 'conversation-group';

  const title = document.createElement('div');
  title.className = 'group-title';
  title.textContent = 'Conversations';
  group.appendChild(title);

  for (const item of items) {
    const button = document.createElement('button');
    button.className = 'conversation-item';
    button.type = 'button';
    button.dataset.conversationId = item.conversation_id;
    button.classList.toggle('active', item.conversation_id === activeConversationId);

    const itemTitle = document.createElement('div');
    itemTitle.className = 'conversation-title';
    itemTitle.textContent = item.title || 'New Conversation';

    const meta = document.createElement('div');
    meta.className = 'conversation-meta';
    meta.textContent = `${item.message_count || 0} messages · ${formatConversationTime(item.updated_at)}`;

    button.append(itemTitle, meta);
    group.appendChild(button);
  }

  conversationList.appendChild(group);
}

async function refreshConversationList() {
  const items = await textClient.listConversations();
  renderConversationList(items);
}

async function ensureActiveConversation() {
  if (activeConversationId) return activeConversationId;

  const conversation = await textClient.getCurrentConversation();
  activeConversationId = conversation.conversation_id;
  renderConversationMessages(conversation);
  await refreshConversationList();
  return activeConversationId;
}

async function openConversation(conversationId) {
  const conversation = await textClient.openConversation(conversationId);
  activeConversationId = conversation.conversation_id;
  renderConversationMessages(conversation);
  await refreshConversationList();
}

async function createNewConversation() {
  const conversation = await textClient.createConversation('New Conversation');
  activeConversationId = conversation.conversation_id;
  renderConversationMessages(conversation);
  await refreshConversationList();
  composerInput.focus();
}

async function restoreConversationState() {
  const conversation = await textClient.getCurrentConversation();
  activeConversationId = conversation.conversation_id;
  renderConversationMessages(conversation);
  await refreshConversationList();
}

function setComposerBusy(isBusy) {
  sending = isBusy;
  composerInput.disabled = isBusy;
  composerSend.disabled = isBusy || !composerInput.value.trim();
  composerSend.textContent = isBusy ? '…' : '↑';
}

function createRequestId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `text_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function setMessageContent(message, content) {
  const bubble = message.querySelector('.bubble');
  bubble.replaceChildren(renderMessageContent(content));
  thread.scrollTop = thread.scrollHeight;
}

thread.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy-button');
  if (!button) return;

  try {
    await navigator.clipboard.writeText(button.dataset.copyText || '');
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, 1200);
  } catch (error) {
    button.textContent = 'Copy failed';
    setTimeout(() => { button.textContent = 'Copy'; }, 1200);
  }
});

textClient.onTextStreamEvent((event) => {
  const stream = activeTextStreams.get(event?.requestId);
  if (!stream) return;

  if (event.type === 'delta') {
    stream.content = event.content || `${stream.content}${event.delta || ''}`;
    setMessageContent(stream.message, stream.content);
    return;
  }

  if (event.type === 'done') {
    stream.content = event.content || stream.content;
    setMessageContent(stream.message, stream.content);
    delete stream.message.dataset.pending;
    activeTextStreams.delete(event.requestId);
    return;
  }

  if (event.type === 'error') {
    setMessageContent(stream.message, `Text mode request failed: ${event.error}`);
    stream.message.classList.add('error');
    delete stream.message.dataset.pending;
    activeTextStreams.delete(event.requestId);
  }
});

async function sendComposerMessage() {
  if (sending) return;

  const text = composerInput.value.trim();
  if (!text) return;

  const requestId = createRequestId();
  composerInput.value = '';
  const userMessage = appendMessage('user', text);
  thread.querySelector('.empty-thread')?.remove();
  const pending = appendMessage('assistant', 'Julia is thinking…', { pending: true });
  activeTextStreams.set(requestId, { message: pending, content: '' });
  setComposerBusy(true);

  try {
    const conversationId = await ensureActiveConversation();
    const userRecord = await textClient.addConversationMessage(conversationId, {
      turn_id: requestId,
      role: 'user',
      modality: 'text',
      content: text,
    });
    activeConversationId = userRecord.conversation_id;
    await refreshConversationList();

    const response = await textClient.streamTextMessage(requestId, text);
    if (activeTextStreams.has(requestId)) {
      setMessageContent(pending, response.content);
      activeTextStreams.delete(requestId);
    }
    await textClient.addConversationMessage(activeConversationId, {
      turn_id: requestId,
      role: 'assistant',
      modality: 'text',
      content: response.content,
    });
    await refreshConversationList();
    delete pending.dataset.pending;
  } catch (error) {
    userMessage.classList.toggle('error', !activeConversationId);
    if (activeTextStreams.has(requestId)) {
      setMessageContent(pending, `Text mode request failed: ${error.message}`);
      pending.classList.add('error');
      delete pending.dataset.pending;
      activeTextStreams.delete(requestId);
    }
  } finally {
    setComposerBusy(false);
    composerInput.focus();
  }
}

newChatButton.addEventListener('click', () => {
  createNewConversation().catch((error) => {
    console.error('[V2_CONVERSATION_CREATE_FAILED]', error);
  });
});

conversationList.addEventListener('click', (event) => {
  const button = event.target.closest('.conversation-item');
  if (!button) return;
  openConversation(button.dataset.conversationId).catch((error) => {
    console.error('[V2_CONVERSATION_OPEN_FAILED]', error);
  });
});

textModeButton.addEventListener('click', () => setMode('text'));
voiceModeButton.addEventListener('click', () => setMode('voice'));
composerVoiceButton.addEventListener('click', () => setMode('voice'));
backToTextButton.addEventListener('click', () => setMode('text'));

openVoiceButton.addEventListener('click', () => {
  window.location.href = webVoiceUrl;
});

composerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sendComposerMessage();
});

composerInput.addEventListener('input', () => {
  composerSend.disabled = sending || !composerInput.value.trim();
});

setMode('text');
composerInput.disabled = false;
composerSend.disabled = true;
restoreConversationState().catch((error) => {
  thread.replaceChildren();
  const message = appendMessage('assistant', `Conversation restore failed: ${error.message}`);
  message.classList.add('error');
});
