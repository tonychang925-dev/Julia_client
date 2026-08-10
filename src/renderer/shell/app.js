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
const voiceUrlLabel = document.getElementById('voiceUrlLabel');
const voiceFrame = document.getElementById('voiceFrame');
const voiceLifecycleStatus = document.getElementById('voiceLifecycleStatus');
const resumeVoiceButton = document.getElementById('resumeVoiceButton');
const pauseVoiceButton = document.getElementById('pauseVoiceButton');
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
const copyDiagnosticsButton = document.getElementById('copyDiagnosticsButton');
const cacheStatusDetails = document.getElementById('cacheStatusDetails');
const reloadFromCoreButton = document.getElementById('reloadFromCoreButton');
const clearLocalCacheButton = document.getElementById('clearLocalCacheButton');
const globalShortcutSetting = document.getElementById('globalShortcutSetting');
const windowRestoreSetting = document.getElementById('windowRestoreSetting');
const trayEnabledSetting = document.getElementById('trayEnabledSetting');
const settingsError = document.getElementById('settingsError');

const textClient = window.juliaElectronV2;
let sending = false;
let activeConversationId = null;
let currentSettings = null;
let currentMode = 'text';
let voiceLoaded = false;
let voiceFrameReady = false;
let voiceLoadPromise = null;
let voiceLifecycleState = 'paused';
const activeTextStreams = new Map();
const pendingVoiceCommands = new Map();
let canonicalSyncTimer = null;
let lastBrainStatus = null;
let lastCacheStatus = null;
const canonicalSyncInFlight = new Map();
let boundVoiceConversationId = null;
let voiceWorkspaceSessionId = null;

voiceFrame.addEventListener('load', () => {
  boundVoiceConversationId = null;
  voiceWorkspaceSessionId = null;
  if (voiceLoaded) setVoiceLifecycleStatus('Voice frame loaded. Conversation bootstrap required.', 'unbound');
});

voiceUrlLabel.textContent = webVoiceUrl;

function showSurface(mode) {
  const isVoice = mode === 'voice';
  currentMode = mode;
  app.dataset.mode = mode;
  textSurface.classList.toggle('hidden', isVoice);
  voiceSurface.classList.toggle('hidden', !isVoice);
  textModeButton.classList.toggle('active', !isVoice);
  voiceModeButton.classList.toggle('active', isVoice);
}

function setVoiceLifecycleStatus(message, state = voiceLifecycleState) {
  voiceLifecycleState = state;
  voiceLifecycleStatus.textContent = message;
  voiceSurface.dataset.voiceState = state;
}

function isVoiceCapturePotentiallyActive() {
  return ['active', 'listening', 'resuming', 'pausing'].includes(String(voiceLifecycleState).toLowerCase());
}

function ensureVoiceLoaded() {
  if (voiceLoaded) return;
  voiceLoadPromise = new Promise((resolve) => {
    const onLoad = () => {
      voiceFrameReady = true;
      voiceFrame.removeEventListener('load', onLoad);
      resolve();
    };
    voiceFrame.addEventListener('load', onLoad);
  });
  const url = new URL(webVoiceUrl);
  url.searchParams.set('juliaElectronHost', String(Date.now()));
  voiceFrame.src = url.toString();
  voiceLoaded = true;
}

async function waitForVoiceFrameReady() {
  ensureVoiceLoaded();
  if (voiceFrameReady) return;
  await Promise.race([
    voiceLoadPromise,
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (!voiceFrameReady) throw new Error('Voice frame did not become ready');
}

function getVoiceTargetOrigin() {
  return new URL(webVoiceUrl).origin;
}

function resolveVoiceCommand(requestId, payload) {
  const pending = pendingVoiceCommands.get(requestId);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingVoiceCommands.delete(requestId);
  pending.resolve(payload);
}

function isVoiceLifecycleMessage(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const source = String(payload.source || payload.app || '');
  const type = String(payload.type || payload.event || '');
  return source.includes('julia') && (payload.requestId || type.includes('voice') || type.includes('lifecycle'));
}

window.addEventListener('message', (event) => {
  if (event.origin !== getVoiceTargetOrigin()) return;
  const payload = event.data;
  if (!isVoiceLifecycleMessage(payload)) return;

  if (
    !payload.partial
    && (payload.type === 'julia.voice.transcript' || payload.type === 'voice:transcript')
  ) {
    scheduleCanonicalConversationSync(payload.conversationId || activeConversationId, 'voice-turn');
    return;
  }

  if (payload.requestId) {
    resolveVoiceCommand(payload.requestId, payload);
  }

  if (payload.status || payload.state) {
    const state = payload.status || payload.state;
    setVoiceLifecycleStatus(`Voice lifecycle: ${state}`, String(state).toLowerCase());
  }
});

async function syncCanonicalConversation(conversationId = activeConversationId, reason = 'manual') {
  const targetId = String(conversationId || '').trim();
  if (!targetId) return null;
  if (targetId !== activeConversationId) {
    console.warn('[V2_CANONICAL_SYNC_SKIPPED_MISMATCH]', { targetId, activeConversationId, reason });
    return null;
  }
  if (canonicalSyncInFlight.has(targetId)) return canonicalSyncInFlight.get(targetId);

  const syncPromise = textClient.syncConversationMessages(targetId)
    .then(async (result) => {
      if (activeConversationId === targetId) {
        renderConversationMessages(result.conversation);
        await refreshConversationList();
      }
      console.info('[V2_CANONICAL_SYNC]', { reason, conversationId: targetId, ...result.reconciliation });
      return result;
    })
    .finally(() => {
      canonicalSyncInFlight.delete(targetId);
    });
  canonicalSyncInFlight.set(targetId, syncPromise);
  return syncPromise;
}

function scheduleCanonicalConversationSync(conversationId, reason) {
  const targetId = String(conversationId || '').trim();
  if (!targetId || targetId !== activeConversationId) return;
  clearTimeout(canonicalSyncTimer);
  canonicalSyncTimer = setTimeout(() => {
    syncCanonicalConversation(targetId, reason).catch((error) => {
      console.warn('[V2_CANONICAL_SYNC_FAILED]', { reason, conversationId: targetId, error: error.message });
    });
  }, 350);
}

async function sendVoiceLifecycleCommand(action, timeoutMs = 7000) {
  ensureVoiceLoaded();
  await waitForVoiceFrameReady();
  const requestId = createRequestId();
  const message = {
    source: 'julia-electron-v2',
    type: 'voice:lifecycle-command',
    requestId,
    action,
  };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingVoiceCommands.delete(requestId);
      reject(new Error(`Voice lifecycle command timed out: ${action}`));
    }, timeoutMs);

    pendingVoiceCommands.set(requestId, { resolve, reject, timeout });
    voiceFrame.contentWindow.postMessage(message, getVoiceTargetOrigin());
  });
}

async function sendVoiceWorkspaceRequest(type, payload = {}, timeoutMs = 20000) {
  ensureVoiceLoaded();
  await waitForVoiceFrameReady();
  const requestId = createRequestId();
  const message = {
    source: 'julia-electron-v2',
    type,
    requestId,
    ...payload,
  };
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingVoiceCommands.delete(requestId);
      reject(new Error(`Voice workspace request timed out: ${type}`));
    }, timeoutMs);
    pendingVoiceCommands.set(requestId, { resolve, reject, timeout });
    voiceFrame.contentWindow.postMessage(message, getVoiceTargetOrigin());
  }).then((result) => {
    if (!result?.ok) throw new Error(result?.error || `Voice workspace request failed: ${type}`);
    return result;
  });
}

async function bootstrapVoiceWorkspace(conversationId = activeConversationId) {
  const targetId = String(conversationId || '').trim();
  if (!targetId) throw new Error('No active conversation for Voice');
  if (boundVoiceConversationId === targetId && voiceWorkspaceSessionId) return;
  const synced = await textClient.syncConversationMessages(targetId);
  const canonical = synced.canonical;
  if (!canonical || canonical.conversation_id !== targetId) {
    throw new Error('Canonical conversation bootstrap mismatch');
  }
  setVoiceLifecycleStatus('Loading conversation into Voice…', 'bootstrapping');
  const result = await sendVoiceWorkspaceRequest('julia.voice.workspace.bootstrap', {
    conversationId: targetId,
    baseLastMessageId: canonical.last_message_id || '',
    messages: canonical.messages || [],
  }, 30000);
  if (result.conversationId !== targetId) throw new Error('Voice bootstrap acknowledged another conversation');
  boundVoiceConversationId = targetId;
  voiceWorkspaceSessionId = result.voiceSessionId;
  setVoiceLifecycleStatus('Voice workspace ready. Microphone is off.', 'paused');
}

async function flushVoiceWorkspace(reason = 'text') {
  if (!boundVoiceConversationId || !voiceWorkspaceSessionId) return { empty: true };
  const conversationId = boundVoiceConversationId;
  if (conversationId !== activeConversationId) throw new Error('Voice workspace is bound to another conversation');
  setVoiceLifecycleStatus(`Saving Voice conversation for ${reason}…`, 'flushing');
  const delta = await sendVoiceWorkspaceRequest('julia.voice.workspace.flush', { conversationId }, 30000);
  if (delta.conversationId !== conversationId || delta.voiceSessionId !== voiceWorkspaceSessionId) {
    throw new Error('Voice workspace delta identity mismatch');
  }
  const turns = Array.isArray(delta.turns) ? delta.turns : [];
  let committedTurnIds = [];
  let committedLastMessageId = delta.baseLastMessageId || '';
  if (turns.length) {
    const committed = await textClient.commitExternalTurns({
      conversationId,
      voiceSessionId: delta.voiceSessionId,
      baseLastMessageId: delta.baseLastMessageId || '',
      turns,
    });
    committedTurnIds = [
      ...(committed.appended_turn_ids || []),
      ...(committed.skipped_turn_ids || []),
    ];
    committedLastMessageId = committed.last_message_id || committedLastMessageId;
  }
  voiceFrame.contentWindow.postMessage({
    source: 'julia-electron-v2',
    type: 'julia.voice.workspace.committed',
    conversationId,
    committedTurnIds,
    baseLastMessageId: committedLastMessageId,
  }, getVoiceTargetOrigin());
  await syncCanonicalConversation(conversationId, `voice-flush:${reason}`);
  setVoiceLifecycleStatus('Voice conversation saved. Microphone is off.', 'paused');
  return { committedTurnIds, empty: turns.length === 0 };
}

function isPauseConfirmed(result) {
  const status = String(result?.status || result?.state || '').toLowerCase();
  return (
    result?.ok === true
    || result?.micCapturePaused === true
    || result?.details?.paused === true
    || result?.details?.client?.hasMicSource === false
    || ['paused', 'released'].includes(status)
  );
}

async function pauseVoiceCapture(reason = 'text') {
  if (!voiceLoaded) {
    setVoiceLifecycleStatus('Voice surface ready. Microphone is off.', 'paused');
    return { ok: true, skipped: true };
  }

  if (!isVoiceCapturePotentiallyActive()) {
    setVoiceLifecycleStatus('Voice surface ready. Microphone is off.', 'paused');
    return { ok: true, skipped: true, state: voiceLifecycleState };
  }

  setVoiceLifecycleStatus('Releasing microphone…', 'pausing');
  const result = await sendVoiceLifecycleCommand('pauseMicCapture');
  if (!isPauseConfirmed(result)) {
    throw new Error(result?.error || 'Voice did not confirm microphone release');
  }
  setVoiceLifecycleStatus(`Microphone released for ${reason}.`, 'paused');
  return result;
}

async function resumeVoiceCapture() {
  ensureVoiceLoaded();
  await ensureActiveConversation();
  await bootstrapVoiceWorkspace(activeConversationId);
  showSurface('voice');
  setVoiceLifecycleStatus('Starting microphone…', 'resuming');
  const result = await sendVoiceLifecycleCommand('resumeMicCapture');
  setVoiceLifecycleStatus('Voice listening.', 'listening');
  return result;
}

async function switchToTextMode(reason = 'text') {
  try {
    await pauseVoiceCapture(reason);
    await flushVoiceWorkspace(reason);
    showSurface('text');
  } catch (error) {
    showSurface('voice');
    setVoiceLifecycleStatus(`Microphone release failed: ${error.message}`, 'error');
    throw error;
  }
  await syncCanonicalConversation(activeConversationId, `switch-to-text:${reason}`).catch((error) => {
    console.warn('[V2_CANONICAL_SYNC_FAILED]', { reason, error: error.message });
  });
}

async function switchToVoiceMode({ resume = true } = {}) {
  ensureVoiceLoaded();
  await ensureActiveConversation();
  await bootstrapVoiceWorkspace(activeConversationId);
  showSurface('voice');
  if (resume) {
    await resumeVoiceCapture();
  } else {
    setVoiceLifecycleStatus('Voice surface ready. Microphone is off.', 'paused');
  }
}

async function prepareAppHidden(reason = 'hidden') {
  if (currentMode !== 'voice') return { ok: true, mode: currentMode };
  try {
    await pauseVoiceCapture(reason);
    await flushVoiceWorkspace(reason);
    return { ok: true, mode: currentMode, voiceLifecycleState };
  } catch (error) {
    return { ok: false, error: error.message, mode: currentMode, voiceLifecycleState };
  }
}

window.__juliaPrepareForAppHidden = prepareAppHidden;

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
  refreshBrainStatus().catch((error) => {
    renderBrainStatus({
      connected: false,
      endpoint: brainEndpointSetting.value,
      status: 'offline',
      error: error.message,
      checked_at: new Date().toISOString(),
    });
  });
  refreshCacheStatus().catch((error) => {
    renderCacheStatus({ error: error.message });
  });
}

function closeSettingsPanel() {
  settingsPanel.classList.add('hidden');
  setSettingsError('');
}

function renderBrainStatus(status) {
  lastBrainStatus = status;
  brainStatusDot.classList.toggle('offline', !status.connected);
  brainStatusText.textContent = status.connected ? 'Julia Brain' : 'Brain Offline';

  const unavailable = 'unavailable';
  const lines = [
    `Endpoint: ${status.endpoint || unavailable}`,
    `Status: ${status.status || unavailable}`,
    `Contract: ${status.contract_version || unavailable}`,
    `Julia Core: ${status.julia_core || unavailable}`,
    `Service version: ${status.service_version || unavailable}`,
    `Architecture: ${status.architecture_version || unavailable}`,
    `Build: ${status.build || unavailable}`,
    `Commit: ${status.commit || unavailable}`,
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
  const mode = settings.defaultMode || initialDefaultMode;
  if (mode === 'voice') {
    await switchToVoiceMode({ resume: false });
  } else {
    showSurface('text');
  }
  await refreshBrainStatus();
  await refreshCacheStatus();
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
  const status = options.status || (options.pending ? 'pending' : 'completed');
  const projectionState = options.projectionState || '';
  message.dataset.status = status;
  if (projectionState) message.dataset.projectionState = projectionState;
  if (options.pending || status === 'pending') message.dataset.pending = 'true';
  if (status === 'failed') message.classList.add('error');
  if (status === 'interrupted') message.classList.add('interrupted');

  const roleEl = document.createElement('div');
  roleEl.className = 'role';
  const statusLabel = status === 'interrupted'
    ? ' · Interrupted'
    : status === 'failed'
      ? ' · Failed'
      : status === 'pending' && role === 'user'
        ? ' · Sending'
        : '';
  roleEl.textContent = `${role === 'user' ? 'Tony' : 'Julia'}${options.modality === 'voice' ? ' 🎤' : ''}${statusLabel}`;

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

  if (conversation?.projection?.stale) {
    const stale = document.createElement('div');
    stale.className = 'cache-banner';
    stale.textContent = `Offline/stale local projection. Last Core sync failed${conversation.projection.last_reconcile_error ? `: ${conversation.projection.last_reconcile_error}` : '.'}`;
    thread.appendChild(stale);
  }

  const messages = conversation?.messages || [];
  if (messages.length === 0) {
    thread.appendChild(createWelcomeMessage());
    return;
  }

  for (const message of messages) {
    appendMessage(message.role, message.content, {
      modality: message.modality,
      status: message.status,
      projectionState: message.metadata?.projection_state,
    });
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
  try {
    const result = await textClient.syncConversationMessages(activeConversationId);
    renderConversationMessages(result.conversation);
  } catch (error) {
    console.warn('[V2_CANONICAL_ENSURE_FAILED]', error.message);
    renderConversationMessages(conversation);
  }
  await refreshConversationList();
  await refreshCacheStatus();
  return activeConversationId;
}

async function openConversation(conversationId) {
  if (boundVoiceConversationId && boundVoiceConversationId !== conversationId) {
    await pauseVoiceCapture('switch-conversation');
    await flushVoiceWorkspace('switch-conversation');
    boundVoiceConversationId = null;
    voiceWorkspaceSessionId = null;
  }
  const conversation = await textClient.openConversation(conversationId);
  activeConversationId = conversation.conversation_id;
  try {
    const result = await textClient.syncConversationMessages(activeConversationId);
    renderConversationMessages(result.conversation);
  } catch (error) {
    console.warn('[V2_CANONICAL_OPEN_FAILED]', error.message);
    renderConversationMessages(conversation);
  }
  await refreshConversationList();
  await refreshCacheStatus();
}

async function createNewConversation() {
  if (boundVoiceConversationId) {
    await pauseVoiceCapture('new-conversation');
    await flushVoiceWorkspace('new-conversation');
    boundVoiceConversationId = null;
    voiceWorkspaceSessionId = null;
  }
  const conversation = await textClient.createConversation('New Conversation');
  activeConversationId = conversation.conversation_id;
  renderConversationMessages(conversation);
  await refreshConversationList();
  await refreshCacheStatus();
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
  await refreshCacheStatus();
}

async function deleteConversation(conversationId) {
  const ok = window.confirm('Delete this conversation? This cannot be undone.');
  if (!ok) return;

  const result = await textClient.deleteConversation(conversationId);
  const next = result.current_conversation || await textClient.getCurrentConversation();
  activeConversationId = next.conversation_id;
  renderConversationMessages(next);
  await refreshConversationList();
  await refreshCacheStatus();
}

async function refreshCacheStatus() {
  if (!textClient.getCacheStatus) return null;
  const status = await textClient.getCacheStatus();
  lastCacheStatus = status;
  renderCacheStatus(status);
  return status;
}

function renderCacheStatus(status) {
  if (!cacheStatusDetails) return;
  if (!status) {
    cacheStatusDetails.textContent = 'Local cache status unavailable.';
    return;
  }
  cacheStatusDetails.textContent = [
    'Authority: disposable projection',
    `Conversations: ${status.conversation_count ?? 'unavailable'}`,
    `Messages: ${status.message_count ?? 'unavailable'}`,
    `Stale conversations: ${status.stale_conversation_count ?? 'unavailable'}`,
    `Current conversation: ${status.current_conversation_id || 'unavailable'}`,
    `Last cleared: ${status.last_cleared_at || 'never'}`,
    `Cache file: ${status.file_path || 'unavailable'}`,
  ].join('\n');
}

async function reloadActiveConversationFromCore(reason = 'manual-reload') {
  const conversationId = await ensureActiveConversation();
  const result = await syncCanonicalConversation(conversationId, reason);
  await refreshCacheStatus();
  return result;
}

async function clearLocalCacheAndReload() {
  const conversationId = activeConversationId;
  if (!conversationId) throw new Error('No active conversation to reload after cache clear');
  const ok = window.confirm('Clear only the local Electron cache? Julia Core conversation history will not be deleted.');
  if (!ok) return null;
  await textClient.clearLocalCache();
  await refreshCacheStatus();
  activeConversationId = conversationId;
  const result = await syncCanonicalConversation(conversationId, 'clear-local-cache');
  await refreshConversationList();
  await refreshCacheStatus();
  return result;
}


function buildDiagnosticsText() {
  return JSON.stringify({
    brain: lastBrainStatus || null,
    cache: lastCacheStatus || null,
    activeConversationId,
    mode: currentMode,
    voice: {
      state: voiceLifecycleState,
      boundConversationId: boundVoiceConversationId,
      workspaceSessionId: voiceWorkspaceSessionId,
    },
    generated_at: new Date().toISOString(),
  }, null, 2);
}

async function restoreConversationState() {
  const conversation = await textClient.getCurrentConversation();
  activeConversationId = conversation.conversation_id;
  try {
    const result = await textClient.syncConversationMessages(activeConversationId);
    renderConversationMessages(result.conversation);
  } catch (error) {
    console.warn('[V2_CANONICAL_RESTORE_FAILED]', error.message);
    renderConversationMessages(conversation);
  }
  await refreshConversationList();
  await refreshCacheStatus();
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
  const turnId = requestId;
  composerInput.value = '';
  const userMessage = appendMessage('user', text, { status: 'pending' });
  thread.querySelector('.empty-thread')?.remove();
  const pending = appendMessage('assistant', 'Julia is thinking…', { pending: true });
  activeTextStreams.set(requestId, { message: pending, content: '' });
  setComposerBusy(true);

  let conversationId = null;
  let coreTurnCompleted = false;
  try {
    conversationId = await ensureActiveConversation();
    const userRecord = await textClient.addConversationMessage(conversationId, {
      turn_id: requestId,
      role: 'user',
      modality: 'text',
      content: text,
      status: 'pending',
      metadata: {
        source: 'julia-electron-local',
        projection_state: 'local_pending',
      },
    });
    activeConversationId = userRecord.conversation_id;
    await refreshConversationList();

    const response = await textClient.streamTextMessage({
      requestId,
      conversationId,
      turnId,
      modality: 'text',
      input: text,
    });
    if (response.conversation_id !== conversationId || response.turn_id !== turnId) {
      throw new Error('Julia returned a mismatched conversation turn');
    }
    coreTurnCompleted = true;
    if (activeTextStreams.has(requestId)) {
      setMessageContent(pending, response.content);
      activeTextStreams.delete(requestId);
    }
    await textClient.addConversationMessage(conversationId, {
      turn_id: turnId,
      role: 'assistant',
      modality: 'text',
      content: response.content,
      status: 'pending',
      metadata: {
        source: 'julia-electron-local',
        projection_state: 'core_returned',
      },
    });
    await syncCanonicalConversation(conversationId, 'text-turn');
    delete pending.dataset.pending;
  } catch (error) {
    if (!coreTurnCompleted) {
      if (conversationId) {
        await textClient.addConversationMessage(conversationId, {
          turn_id: turnId,
          role: 'user',
          modality: 'text',
          content: text,
          status: 'failed',
          metadata: {
            source: 'julia-electron-local',
            projection_state: 'failed',
            error: error.message,
          },
        }).catch((projectionError) => {
          console.warn('[V2_LOCAL_PROJECTION_FAILED]', projectionError.message);
        });
      }
      userMessage.dataset.status = 'failed';
      delete userMessage.dataset.pending;
      userMessage.classList.add('error');
      const roleEl = userMessage.querySelector('.role');
      if (roleEl) roleEl.textContent = 'Tony · Failed';
    }
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

textModeButton.addEventListener('click', () => {
  switchToTextMode('text').catch((error) => {
    console.error('[V2_MODE_TEXT_FAILED]', error);
  });
});
voiceModeButton.addEventListener('click', () => {
  switchToVoiceMode({ resume: false }).catch((error) => {
    console.error('[V2_MODE_VOICE_FAILED]', error);
  });
});
composerVoiceButton.addEventListener('click', () => {
  switchToVoiceMode({ resume: false }).catch((error) => {
    console.error('[V2_MODE_VOICE_FAILED]', error);
  });
});
backToTextButton.addEventListener('click', () => {
  switchToTextMode('text').catch((error) => {
    console.error('[V2_MODE_TEXT_FAILED]', error);
  });
});

resumeVoiceButton.addEventListener('click', () => {
  resumeVoiceCapture().catch((error) => {
    setVoiceLifecycleStatus(`Voice start failed: ${error.message}`, 'error');
  });
});

pauseVoiceButton.addEventListener('click', () => {
  pauseVoiceCapture('manual').catch((error) => {
    setVoiceLifecycleStatus(`Mic release failed: ${error.message}`, 'error');
  });
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


copyDiagnosticsButton?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(buildDiagnosticsText());
    copyDiagnosticsButton.textContent = 'Copied';
    setTimeout(() => { copyDiagnosticsButton.textContent = 'Copy diagnostics'; }, 1200);
  } catch (error) {
    setSettingsError(`Copy diagnostics failed: ${error.message}`);
  }
});

reloadFromCoreButton?.addEventListener('click', () => {
  reloadActiveConversationFromCore('settings-reload')
    .catch((error) => setSettingsError(`Reload from Core failed: ${error.message}`));
});

clearLocalCacheButton?.addEventListener('click', () => {
  clearLocalCacheAndReload()
    .catch((error) => setSettingsError(`Clear local cache failed: ${error.message}`));
});

settingsSaveButton.addEventListener('click', () => {
  setSettingsError('');
  textClient.updateSettings(readSettingsForm())
    .then((settings) => {
      populateSettings(settings);
      if (settings.defaultMode === 'voice') {
        return switchToVoiceMode({ resume: false }).then(() => settings);
      }
      showSurface('text');
      return settings;
    })
    .then(() => {
      closeSettingsPanel();
      return refreshBrainStatus();
    })
    .catch((error) => {
      setSettingsError(`Settings save failed: ${error.message}`);
    });
});

if (initialDefaultMode === 'voice') {
  switchToVoiceMode({ resume: false }).catch((error) => {
    setVoiceLifecycleStatus(`Voice init failed: ${error.message}`, 'error');
  });
} else {
  showSurface('text');
}
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
