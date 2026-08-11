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
const voicePhasePill = document.getElementById('voicePhasePill');
const voiceStateHint = document.getElementById('voiceStateHint');
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
let currentConversationNotice = null;

voiceFrame.addEventListener('load', () => {
  boundVoiceConversationId = null;
  if (voiceLoaded) setVoiceLifecycleStatus('Voice frame loaded. Bind a Core conversation before microphone capture.', 'unbound');
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

function getVoiceUx() {
  return window.JuliaVoiceUX || {
    describeVoiceState: (state, payload = {}) => ({
      state: String(state || 'idle'),
      label: String(state || 'Voice'),
      detail: payload.message || '',
      active: ['active', 'listening'].includes(String(state || '').toLowerCase()),
      busy: false,
    }),
    getVoiceControlState: () => ({ startDisabled: false, releaseDisabled: false, textSwitchDiscouraged: false }),
    isVoiceWorkspaceNotSettled: (error) => /not settled/i.test(String(error?.message || error || '')),
  };
}

function updateVoiceControls() {
  const controls = getVoiceUx().getVoiceControlState(voiceLifecycleState);
  resumeVoiceButton.disabled = Boolean(controls.startDisabled);
  pauseVoiceButton.disabled = Boolean(controls.releaseDisabled);
  backToTextButton.classList.toggle('discouraged', Boolean(controls.textSwitchDiscouraged));
  textModeButton.classList.toggle('discouraged', Boolean(controls.textSwitchDiscouraged));
}

function setVoiceLifecycleStatus(message, state = voiceLifecycleState) {
  const display = getVoiceUx().describeVoiceState(state, { message });
  voiceLifecycleState = display.state;
  voiceLifecycleStatus.textContent = message || display.detail;
  voiceSurface.dataset.voiceState = display.state;
  if (voicePhasePill) voicePhasePill.textContent = display.label;
  if (voiceStateHint) voiceStateHint.textContent = display.detail;
  updateVoiceControls();
}

function isVoiceCapturePotentiallyActive() {
  return ['active', 'listening', 'speech', 'processing', 'speaking', 'resuming', 'pausing', 'draining'].includes(String(voiceLifecycleState).toLowerCase());
}

function applyVoiceRuntimeEvent(payload) {
  const type = String(payload?.type || payload?.event || '').toLowerCase();
  const status = payload?.status || payload?.state;
  if (payload?.partial || type.includes('transcript.partial') || type.includes('speech')) {
    setVoiceLifecycleStatus('Speech detected. Voice is attached to the Core conversation.', 'speech');
    return;
  }
  if (type.includes('response') && (type.includes('done') || type.includes('finished'))) {
    setVoiceLifecycleStatus('Julia response generated. Waiting for Voice audio to settle…', 'draining');
    return;
  }
  if (type.includes('audio') || type.includes('playback') || type.includes('tts')) {
    setVoiceLifecycleStatus('Julia is speaking.', 'speaking');
    return;
  }
  if (status) {
    const display = getVoiceUx().describeVoiceState(status, payload);
    setVoiceLifecycleStatus(payload.message || `Voice lifecycle: ${display.label}`, display.state);
  }
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

  applyVoiceRuntimeEvent(payload);
});

async function syncCanonicalConversation(conversationId = activeConversationId, reason = 'manual') {
  const targetId = String(conversationId || '').trim();
  if (!targetId) return null;
  if (targetId !== activeConversationId) {
    console.warn('[V2_CANONICAL_SYNC_SKIPPED_MISMATCH]', { targetId, activeConversationId, reason });
    return null;
  }
  if (canonicalSyncInFlight.has(targetId)) return canonicalSyncInFlight.get(targetId);

  if (reason !== 'voice-turn') {
    setConversationNotice('Reconnecting — waiting for Core truth…', 'syncing');
  }

  const syncPromise = textClient.syncConversationMessages(targetId)
    .then(async (result) => {
      const reconciliation = result.reconciliation || {};
      const changed = (reconciliation.inserted || 0) + (reconciliation.updated || 0) + (reconciliation.removed_local || 0);
      setConversationNotice(
        changed
          ? `Back online — synced with Core (${changed} projection update${changed === 1 ? '' : 's'}).`
          : 'Back online — conversation is synced with Core.',
        'synced'
      );
      if (activeConversationId === targetId) {
        renderConversationMessages(result.conversation);
        await refreshConversationList();
      }
      console.info('[V2_CANONICAL_SYNC]', { reason, conversationId: targetId, ...result.reconciliation });
      return result;
    })
    .catch((error) => {
      setConversationNotice(`Offline — showing last synced conversation. ${error.message}`, 'offline');
      throw error;
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
      setConversationNotice(`Offline — showing last synced conversation. ${error.message}`, 'offline');
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

async function bindVoiceConversation(conversationId = activeConversationId) {
  const targetId = String(conversationId || '').trim();
  if (!targetId) throw new Error('No active conversation for Voice');
  if (boundVoiceConversationId === targetId) return { conversationId: targetId, reused: true };
  await syncCanonicalConversation(targetId, 'voice-bind');
  setVoiceLifecycleStatus('Binding Voice to Core conversation…', 'bootstrapping');
  ensureVoiceLoaded();
  await waitForVoiceFrameReady();
  const requestId = createRequestId();
  voiceFrame.contentWindow.postMessage({
    source: 'julia-electron-v2',
    type: 'julia.voice.conversation.bind',
    requestId,
    conversationId: targetId,
  }, getVoiceTargetOrigin());
  boundVoiceConversationId = targetId;
  setVoiceLifecycleStatus('Voice bound to Core conversation. Microphone is off.', 'idle');
  return { conversationId: targetId };
}

async function bootstrapVoiceWorkspace(conversationId = activeConversationId) {
  return bindVoiceConversation(conversationId);
}

async function flushVoiceWorkspace(reason = 'text') {
  if (!boundVoiceConversationId) return { empty: true };
  const conversationId = boundVoiceConversationId;
  if (conversationId !== activeConversationId) throw new Error('Voice is bound to another Core conversation');
  await syncCanonicalConversation(conversationId, `voice-sync:${reason}`);
  setVoiceLifecycleStatus('Voice is synced with Core conversation. Microphone is off.', 'idle');
  return { empty: true, canonical: true };
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
    setVoiceLifecycleStatus('Voice surface ready. Microphone is off.', 'idle');
    return { ok: true, skipped: true };
  }

  if (!isVoiceCapturePotentiallyActive()) {
    setVoiceLifecycleStatus('Voice surface ready. Microphone is off.', 'idle');
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
    if (getVoiceUx().isVoiceWorkspaceNotSettled(error)) {
      setVoiceLifecycleStatus('Voice is finishing. Wait for generation/audio to settle, then try Text again.', 'draining');
    } else {
      setVoiceLifecycleStatus(`Microphone release failed: ${error.message}`, 'error');
    }
    throw error;
  }
  await syncCanonicalConversation(activeConversationId, `switch-to-text:${reason}`).catch((error) => {
    console.warn('[V2_CANONICAL_SYNC_FAILED]', { reason, error: error.message });
  });
}

async function switchToVoiceMode({ resume = true } = {}) {
  ensureVoiceLoaded();
  showSurface('voice');
  try {
    await ensureActiveConversation();
    await bootstrapVoiceWorkspace(activeConversationId);
  } catch (error) {
    setVoiceLifecycleStatus(`Voice mode unavailable: ${error.message}`, 'error');
    throw error;
  }
  if (resume) {
    await resumeVoiceCapture();
  } else {
    setVoiceLifecycleStatus('Voice surface ready. Microphone is off.', 'idle');
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

function getMessagePresentation(role, status, options = {}) {
  const normalizedStatus = String(status || 'completed');
  const modality = options.modality === 'voice' ? 'voice' : 'text';
  const projectionState = String(options.projectionState || '');
  const isLocalProjection = options.source === 'julia-electron-local' || projectionState.startsWith('local_') || projectionState === 'failed';

  if (normalizedStatus === 'pending') {
    return {
      label: role === 'user' ? 'Sending' : 'Waiting for Core',
      detail: role === 'user' ? 'Core pending' : 'Local projection until Core confirms',
      className: 'pending',
      retryable: false,
    };
  }
  if (normalizedStatus === 'failed') {
    return {
      label: 'Failed',
      detail: isLocalProjection ? 'Retryable local projection — not canonical history' : 'Failed',
      className: 'failed',
      retryable: role === 'user' && isLocalProjection,
    };
  }
  if (normalizedStatus === 'interrupted') {
    return {
      label: 'Interrupted',
      detail: modality === 'voice'
        ? 'Core canonical interrupted voice response'
        : 'Core canonical interrupted response',
      className: 'interrupted',
      retryable: false,
    };
  }
  return {
    label: projectionState === 'core_returned' ? 'Reconciling' : '',
    detail: projectionState === 'core_returned' ? 'Waiting for canonical Core read-back' : '',
    className: projectionState === 'core_returned' ? 'reconciling' : 'completed',
    retryable: false,
  };
}

function applyMessagePresentation(message, role, status, options = {}) {
  const presentation = getMessagePresentation(role, status, options);
  message.dataset.status = status;
  message.classList.remove('error', 'failed', 'interrupted', 'pending', 'reconciling');
  if (presentation.className && presentation.className !== 'completed') {
    message.classList.add(presentation.className);
  }
  if (status === 'failed') message.classList.add('error');
  if (status === 'pending') message.dataset.pending = 'true';
  else delete message.dataset.pending;

  const roleEl = message.querySelector('.role');
  if (roleEl) {
    const statusLabel = presentation.label ? ` · ${presentation.label}` : '';
    roleEl.textContent = `${role === 'user' ? 'Tony' : 'Julia'}${options.modality === 'voice' ? ' 🎤' : ''}${statusLabel}`;
  }
  const detail = message.querySelector('.message-status-detail');
  if (detail) {
    detail.textContent = presentation.detail || '';
    detail.classList.toggle('hidden', !presentation.detail);
  }
  return presentation;
}

function createMessage(role, content, options = {}) {
  const message = document.createElement('div');
  message.className = `message ${role}`;
  const status = options.status || (options.pending ? 'pending' : 'completed');
  const projectionState = options.projectionState || options.metadata?.projection_state || '';
  const source = options.source || options.metadata?.source || '';
  message.dataset.status = status;
  message.dataset.role = role;
  message.dataset.content = String(content || '');
  if (options.turnId) message.dataset.turnId = options.turnId;
  if (options.conversationId) message.dataset.conversationId = options.conversationId;
  if (options.modality) message.dataset.modality = options.modality;
  if (projectionState) message.dataset.projectionState = projectionState;
  if (source) message.dataset.source = source;

  const roleEl = document.createElement('div');
  roleEl.className = 'role';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.appendChild(renderMessageContent(content));

  const detail = document.createElement('div');
  detail.className = 'message-status-detail hidden';

  const actions = document.createElement('div');
  actions.className = 'message-actions hidden';

  message.append(roleEl, bubble, detail, actions);
  const presentation = applyMessagePresentation(message, role, status, { ...options, projectionState, source });

  if (presentation.retryable) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'message-action-button retry-message-button';
    retry.dataset.action = 'retry-message';
    retry.textContent = 'Retry';
    actions.replaceChildren(retry);
    actions.classList.remove('hidden');
  }

  return message;
}

function createConversationNotice(kind, message) {
  const notice = document.createElement('div');
  notice.className = `conversation-notice ${kind || 'info'}`;
  notice.textContent = message;
  return notice;
}

function setConversationNotice(message, kind = 'info') {
  currentConversationNotice = message ? { message, kind } : null;
  const existing = thread.querySelector('.conversation-notice');
  if (!message) {
    existing?.remove();
    return;
  }
  const notice = createConversationNotice(kind, message);
  if (existing) existing.replaceWith(notice);
  else thread.prepend(notice);
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

  if (currentConversationNotice) {
    thread.appendChild(createConversationNotice(currentConversationNotice.kind, currentConversationNotice.message));
  }

  if (conversation?.projection?.stale) {
    const stale = document.createElement('div');
    stale.className = 'cache-banner';
    stale.textContent = `Offline — showing last synced conversation. Last Core sync failed${conversation.projection.last_reconcile_error ? `: ${conversation.projection.last_reconcile_error}` : '.'}`;
    thread.appendChild(stale);
  }

  const messages = conversation?.messages || [];
  if (messages.length === 0) {
    thread.appendChild(createWelcomeMessage());
    return;
  }

  for (const message of messages) {
    appendMessage(message.role, message.content, {
      conversationId: message.conversation_id || conversation?.conversation_id,
      turnId: message.turn_id,
      modality: message.modality,
      status: message.status,
      projectionState: message.metadata?.projection_state,
      source: message.metadata?.source,
      metadata: message.metadata,
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
    setConversationNotice(`Offline — showing last synced conversation. ${error.message}`, 'offline');
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
  }
  const conversation = await textClient.openConversation(conversationId);
  activeConversationId = conversation.conversation_id;
  try {
    const result = await textClient.syncConversationMessages(activeConversationId);
    renderConversationMessages(result.conversation);
  } catch (error) {
    console.warn('[V2_CANONICAL_OPEN_FAILED]', error.message);
    setConversationNotice(`Offline — showing last synced conversation. ${error.message}`, 'offline');
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
    setConversationNotice(`Offline — showing last synced conversation. ${error.message}`, 'offline');
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
  const retryButton = event.target.closest('[data-action="retry-message"]');
  if (retryButton) {
    retryFailedMessage(retryButton.closest('.message')).catch((error) => {
      setConversationNotice(`Retry failed: ${error.message}`, 'error');
    });
    return;
  }

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
    applyMessagePresentation(stream.message, 'assistant', 'completed', {
      modality: 'text',
      source: 'julia-electron-local',
      projectionState: 'core_returned',
    });
    activeTextStreams.delete(event.requestId);
    return;
  }

  if (event.type === 'error') {
    setMessageContent(stream.message, `Text mode request failed: ${event.error}`);
    applyMessagePresentation(stream.message, 'assistant', 'failed', {
      modality: 'text',
      source: 'julia-electron-local',
      projectionState: 'failed',
    });
    activeTextStreams.delete(event.requestId);
  }
});

async function executeTextTurn({ conversationId, turnId, text, reason = 'text-turn' }) {
  const pendingAssistant = appendMessage('assistant', 'Julia is thinking…', {
    conversationId,
    turnId,
    status: 'pending',
    modality: 'text',
    metadata: { source: 'julia-electron-local', projection_state: 'local_pending' },
  });
  activeTextStreams.set(turnId, { message: pendingAssistant, content: '' });

  const response = await textClient.streamTextMessage({
    requestId: turnId,
    conversationId,
    turnId,
    modality: 'text',
    input: text,
  });
  if (response.conversation_id !== conversationId || response.turn_id !== turnId) {
    throw new Error('Julia returned a mismatched conversation turn');
  }

  if (activeTextStreams.has(turnId)) {
    setMessageContent(pendingAssistant, response.content);
    activeTextStreams.delete(turnId);
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
  await syncCanonicalConversation(conversationId, reason);
  delete pendingAssistant.dataset.pending;
  return response;
}

async function retryFailedMessage(messageEl) {
  if (!messageEl || messageEl.dataset.role !== 'user' || messageEl.dataset.status !== 'failed') return;
  const conversationId = messageEl.dataset.conversationId || activeConversationId;
  const turnId = messageEl.dataset.turnId;
  const text = messageEl.dataset.content || '';
  if (!conversationId || !turnId || !text.trim()) throw new Error('Retry target is missing conversation, turn, or content');

  const button = messageEl.querySelector('[data-action="retry-message"]');
  if (button) {
    button.disabled = true;
    button.textContent = 'Retrying…';
  }
  setConversationNotice('Retrying with the same turn id — waiting for Core truth…', 'syncing');
  await textClient.addConversationMessage(conversationId, {
    turn_id: turnId,
    role: 'user',
    modality: messageEl.dataset.modality || 'text',
    content: text,
    status: 'pending',
    metadata: {
      source: 'julia-electron-local',
      projection_state: 'local_pending',
      retry_of: turnId,
    },
  });
  applyMessagePresentation(messageEl, 'user', 'pending', {
    modality: messageEl.dataset.modality || 'text',
    source: 'julia-electron-local',
    projectionState: 'local_pending',
  });
  messageEl.querySelector('.message-actions')?.classList.add('hidden');

  try {
    await executeTextTurn({ conversationId, turnId, text, reason: 'text-retry' });
  } catch (error) {
    activeTextStreams.delete(turnId);
    await textClient.addConversationMessage(conversationId, {
      turn_id: turnId,
      role: 'user',
      modality: messageEl.dataset.modality || 'text',
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
    const conversation = await textClient.getCurrentConversation().catch(() => null);
    if (conversation?.conversation_id === conversationId) renderConversationMessages(conversation);
    throw error;
  }
}

async function sendComposerMessage() {
  if (sending) return;

  const text = composerInput.value.trim();
  if (!text) return;

  const requestId = createRequestId();
  const turnId = requestId;
  composerInput.value = '';
  const userMessage = appendMessage('user', text, {
    turnId,
    status: 'pending',
    modality: 'text',
    metadata: { source: 'julia-electron-local', projection_state: 'local_pending' },
  });
  thread.querySelector('.empty-thread')?.remove();
  setComposerBusy(true);

  let conversationId = null;
  try {
    conversationId = await ensureActiveConversation();
    userMessage.dataset.conversationId = conversationId;
    const userRecord = await textClient.addConversationMessage(conversationId, {
      turn_id: turnId,
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
    await executeTextTurn({ conversationId, turnId, text, reason: 'text-turn' });
  } catch (error) {
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
    applyMessagePresentation(userMessage, 'user', 'failed', {
      modality: 'text',
      source: 'julia-electron-local',
      projectionState: 'failed',
    });
    const actions = userMessage.querySelector('.message-actions');
    if (actions) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'message-action-button retry-message-button';
      retry.dataset.action = 'retry-message';
      retry.textContent = 'Retry';
      actions.replaceChildren(retry);
      actions.classList.remove('hidden');
    }
    if (activeTextStreams.has(turnId)) {
      const stream = activeTextStreams.get(turnId);
      setMessageContent(stream.message, `Text mode request failed: ${error.message}`);
      stream.message.classList.add('error');
      delete stream.message.dataset.pending;
      activeTextStreams.delete(turnId);
    }
    setConversationNotice(`Failed — local projection only. ${error.message}`, 'error');
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
  switchToVoiceMode({ resume: true }).catch((error) => {
    showSurface('voice');
    setVoiceLifecycleStatus(`Voice mode unavailable: ${error.message}`, 'error');
    console.error('[V2_MODE_VOICE_FAILED]', error);
  });
});
composerVoiceButton.addEventListener('click', () => {
  switchToVoiceMode({ resume: true }).catch((error) => {
    showSurface('voice');
    setVoiceLifecycleStatus(`Voice mode unavailable: ${error.message}`, 'error');
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
setVoiceLifecycleStatus('Voice surface ready. Microphone is off.', 'idle');

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
