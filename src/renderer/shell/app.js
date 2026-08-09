const params = new URLSearchParams(window.location.search);
const webVoiceUrl = params.get('voiceUrl') || 'http://localhost:7860/';
const initialDefaultMode = params.get('defaultMode') || 'text';

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
const conversationSearch = document.getElementById('conversationSearch');
const conversationList = document.getElementById('conversationList');
const emptyConversationList = document.getElementById('emptyConversationList');
const settingsButton = document.getElementById('settingsButton');
const brainStatusButton = document.getElementById('brainStatusButton');
const brainStatusDot = document.getElementById('brainStatusDot');
const brainStatusText = document.getElementById('brainStatusText');
const settingsPanel = document.getElementById('settingsPanel');
const settingsCloseButton = document.getElementById('settingsCloseButton');
const settingsCancelButton = document.getElementById('settingsCancelButton');
const settingsSaveButton = document.getElementById('settingsSaveButton');
const defaultModeSetting = document.getElementById('defaultModeSetting');
const closeBehaviorSetting = document.getElementById('closeBehaviorSetting');
const launchAtLoginSetting = document.getElementById('launchAtLoginSetting');
const brainEndpointSetting = document.getElementById('brainEndpointSetting');
const brainStatusDetails = document.getElementById('brainStatusDetails');
const refreshBrainStatusButton = document.getElementById('refreshBrainStatusButton');
const globalShortcutSetting = document.getElementById('globalShortcutSetting');
const windowRestoreSetting = document.getElementById('windowRestoreSetting');
const trayEnabledSetting = document.getElementById('trayEnabledSetting');
const settingsError = document.getElementById('settingsError');

const textClient = window.juliaElectronV2;
let sending = false;
let activeConversationId = null;
let currentSettings = null;
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

function setSettingsError(message) {
  settingsError.textContent = message || '';
  settingsError.classList.toggle('hidden', !message);
}

function populateSettings(settings) {
  currentSettings = settings;
  defaultModeSetting.value = settings.defaultMode || 'text';
  closeBehaviorSetting.value = settings.closeBehavior || 'tray';
  launchAtLoginSetting.checked = Boolean(settings.launchAtLogin);
  brainEndpointSetting.value = settings.brainEndpoint || 'http://127.0.0.1:18089';
  globalShortcutSetting.value = settings.globalShortcut || 'CommandOrControl+Shift+J';
  windowRestoreSetting.checked = Boolean(settings.windowRestore);
  trayEnabledSetting.checked = Boolean(settings.trayEnabled);
}

function readSettingsForm() {
  return {
    defaultMode: defaultModeSetting.value,
    closeBehavior: closeBehaviorSetting.value,
    launchAtLogin: launchAtLoginSetting.checked,
    brainEndpoint: brainEndpointSetting.value.trim(),
    globalShortcut: globalShortcutSetting.value.trim(),
    windowRestore: windowRestoreSetting.checked,
    trayEnabled: trayEnabledSetting.checked,
  };
}

function openSettingsPanel() {
  if (currentSettings) populateSettings(currentSettings);
  setSettingsError('');
  settingsPanel.classList.remove('hidden');
  brainEndpointSetting.focus();
}

function closeSettingsPanel() {
  settingsPanel.classList.add('hidden');
  setSettingsError('');
}

function renderBrainStatus(status) {
  brainStatusDot.classList.toggle('offline', !status.connected);
  brainStatusText.textContent = status.connected ? 'Julia Brain' : 'Brain Offline';

  const lines = [
    `Endpoint: ${status.endpoint}`,
    `Status: ${status.status}`,
    status.contract_version ? `Contract: ${status.contract_version}` : null,
    status.julia_core ? `Julia Core: ${status.julia_core}` : null,
    status.error ? `Error: ${status.error}` : null,
    status.checked_at ? `Last check: ${new Date(status.checked_at).toLocaleString()}` : null,
  ].filter(Boolean);
  brainStatusDetails.textContent = lines.join('\n');
}

async function refreshBrainStatus() {
  const status = await textClient.getBrainStatus();
  renderBrainStatus(status);
  return status;
}

async function restoreSettingsState() {
  const settings = await textClient.getSettings();
  populateSettings(settings);
  setMode(settings.defaultMode || initialDefaultMode);
  await refreshBrainStatus();
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

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function groupConversationByDate(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Earlier';

  const today = startOfDay(new Date());
  const itemDay = startOfDay(new Date(timestamp));
  const diffDays = Math.floor((today - itemDay) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This Week';
  return 'Earlier';
}

function groupConversations(items) {
  const groups = new Map([
    ['Today', []],
    ['Yesterday', []],
    ['This Week', []],
    ['Earlier', []],
  ]);

  for (const item of items) {
    const group = groupConversationByDate(item.updated_at);
    groups.get(group).push(item);
  }

  return [...groups.entries()].filter(([, groupItems]) => groupItems.length > 0);
}

function renderConversationList(items) {
  const query = conversationSearch.value.trim();
  conversationList.replaceChildren();
  const emptyText = emptyConversationList.querySelector('.empty-sidebar');
  if (emptyText) {
    emptyText.textContent = query ? 'No conversations match this search.' : 'No saved conversations yet.';
  }
  emptyConversationList.classList.toggle('hidden', items.length > 0);

  if (items.length === 0) return;

  const groups = query ? [['Search Results', items]] : groupConversations(items);

  for (const [groupName, groupItems] of groups) {
    const group = document.createElement('div');
    group.className = 'conversation-group';

    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = groupName;
    group.appendChild(title);

    for (const item of groupItems) {
      const row = document.createElement('div');
      row.className = 'conversation-row';

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
      const matchText = item.match_count ? ` · ${item.match_count} match${item.match_count === 1 ? '' : 'es'}` : '';
      meta.textContent = `${item.message_count || 0} messages · ${formatConversationTime(item.updated_at)}${matchText}`;

      button.append(itemTitle, meta);

      if (item.match_snippet && query) {
        const snippet = document.createElement('div');
        snippet.className = 'conversation-snippet';
        snippet.textContent = item.match_snippet;
        button.appendChild(snippet);
      }

      const actions = document.createElement('div');
      actions.className = 'conversation-actions';

      const rename = document.createElement('button');
      rename.className = 'conversation-action';
      rename.type = 'button';
      rename.dataset.action = 'rename';
      rename.dataset.conversationId = item.conversation_id;
      rename.dataset.conversationTitle = item.title || 'New Conversation';
      rename.title = 'Rename conversation';
      rename.textContent = '✎';

      const del = document.createElement('button');
      del.className = 'conversation-action danger';
      del.type = 'button';
      del.dataset.action = 'delete';
      del.dataset.conversationId = item.conversation_id;
      del.title = 'Delete conversation';
      del.textContent = '×';

      actions.append(rename, del);
      row.append(button, actions);
      group.appendChild(row);
    }

    conversationList.appendChild(group);
  }
}

async function refreshConversationList() {
  const query = conversationSearch.value.trim();
  const items = query
    ? await textClient.searchConversations(query)
    : await textClient.listConversations();
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

async function renameConversation(conversationId, currentTitle) {
  const nextTitle = window.prompt('Rename conversation', currentTitle || 'New Conversation');
  if (nextTitle === null) return;
  const trimmed = nextTitle.trim();
  if (!trimmed) return;

  const updated = await textClient.renameConversation(conversationId, trimmed);
  if (updated.conversation_id === activeConversationId) {
    renderConversationMessages(updated);
  }
  await refreshConversationList();
}

async function deleteConversation(conversationId) {
  const ok = window.confirm('Delete this conversation? This cannot be undone.');
  if (!ok) return;

  const result = await textClient.deleteConversation(conversationId);
  const next = result.current_conversation || await textClient.getCurrentConversation();
  activeConversationId = next.conversation_id;
  renderConversationMessages(next);
  await refreshConversationList();
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
  const action = event.target.closest('.conversation-action');
  if (action) {
    const conversationId = action.dataset.conversationId;
    const task = action.dataset.action === 'delete'
      ? deleteConversation(conversationId)
      : renameConversation(conversationId, action.dataset.conversationTitle);

    task.catch((error) => {
      console.error('[V2_CONVERSATION_ACTION_FAILED]', error);
    });
    return;
  }

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

conversationSearch.addEventListener('input', () => {
  refreshConversationList().catch((error) => {
    console.error('[V2_CONVERSATION_SEARCH_FAILED]', error);
  });
});

settingsButton.addEventListener('click', openSettingsPanel);
brainStatusButton.addEventListener('click', openSettingsPanel);
settingsCloseButton.addEventListener('click', closeSettingsPanel);
settingsCancelButton.addEventListener('click', closeSettingsPanel);
settingsPanel.addEventListener('click', (event) => {
  if (event.target === settingsPanel) closeSettingsPanel();
});

refreshBrainStatusButton.addEventListener('click', () => {
  refreshBrainStatus().catch((error) => {
    renderBrainStatus({
      connected: false,
      endpoint: brainEndpointSetting.value,
      status: 'offline',
      error: error.message,
      checked_at: new Date().toISOString(),
    });
  });
});

settingsSaveButton.addEventListener('click', () => {
  setSettingsError('');
  textClient.updateSettings(readSettingsForm())
    .then((settings) => {
      populateSettings(settings);
      setMode(settings.defaultMode || 'text');
      closeSettingsPanel();
      return refreshBrainStatus();
    })
    .catch((error) => {
      setSettingsError(`Settings save failed: ${error.message}`);
    });
});

setMode(initialDefaultMode === 'voice' ? 'voice' : 'text');
composerInput.disabled = false;
composerSend.disabled = true;
restoreSettingsState().catch((error) => {
  renderBrainStatus({
    connected: false,
    endpoint: 'unknown',
    status: 'offline',
    error: error.message,
    checked_at: new Date().toISOString(),
  });
});
restoreConversationState().catch((error) => {
  thread.replaceChildren();
  const message = appendMessage('assistant', `Conversation restore failed: ${error.message}`);
  message.classList.add('error');
});

setInterval(() => {
  refreshBrainStatus().catch((error) => {
    renderBrainStatus({
      connected: false,
      endpoint: currentSettings?.brainEndpoint || 'unknown',
      status: 'offline',
      error: error.message,
      checked_at: new Date().toISOString(),
    });
  });
}, 30000);
