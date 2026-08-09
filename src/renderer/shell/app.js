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

const textClient = window.juliaElectronV2;
let sending = false;

voiceUrlLabel.textContent = webVoiceUrl;

function setMode(mode) {
  const isVoice = mode === 'voice';
  app.dataset.mode = mode;
  textSurface.classList.toggle('hidden', isVoice);
  voiceSurface.classList.toggle('hidden', !isVoice);
  textModeButton.classList.toggle('active', !isVoice);
  voiceModeButton.classList.toggle('active', isVoice);
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
  bubble.textContent = content;

  message.append(roleEl, bubble);
  return message;
}

function appendMessage(role, content, options) {
  const message = createMessage(role, content, options);
  thread.appendChild(message);
  thread.scrollTop = thread.scrollHeight;
  return message;
}

function setComposerBusy(isBusy) {
  sending = isBusy;
  composerInput.disabled = isBusy;
  composerSend.disabled = isBusy || !composerInput.value.trim();
  composerSend.textContent = isBusy ? '…' : '↑';
}

async function sendComposerMessage() {
  if (sending) return;

  const text = composerInput.value.trim();
  if (!text) return;

  composerInput.value = '';
  appendMessage('user', text);
  const pending = appendMessage('assistant', 'Julia is thinking…', { pending: true });
  setComposerBusy(true);

  try {
    const response = await textClient.sendTextMessage(text);
    pending.querySelector('.bubble').textContent = response.content;
    delete pending.dataset.pending;
  } catch (error) {
    pending.querySelector('.bubble').textContent = `Text mode request failed: ${error.message}`;
    pending.classList.add('error');
  } finally {
    setComposerBusy(false);
    composerInput.focus();
  }
}

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
