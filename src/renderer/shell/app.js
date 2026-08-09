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

voiceUrlLabel.textContent = webVoiceUrl;

function setMode(mode) {
  const isVoice = mode === 'voice';
  app.dataset.mode = mode;
  textSurface.classList.toggle('hidden', isVoice);
  voiceSurface.classList.toggle('hidden', !isVoice);
  textModeButton.classList.toggle('active', !isVoice);
  voiceModeButton.classList.toggle('active', isVoice);
}

textModeButton.addEventListener('click', () => setMode('text'));
voiceModeButton.addEventListener('click', () => setMode('voice'));
composerVoiceButton.addEventListener('click', () => setMode('voice'));
backToTextButton.addEventListener('click', () => setMode('text'));

openVoiceButton.addEventListener('click', () => {
  window.location.href = webVoiceUrl;
});

setMode('text');
