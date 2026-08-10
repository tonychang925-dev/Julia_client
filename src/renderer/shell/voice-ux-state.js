(function initVoiceUxState(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.JuliaVoiceUX = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, () => {
  const ACTIVE_STATES = new Set(['listening', 'speech', 'processing', 'speaking']);
  const BUSY_STATES = new Set(['bootstrapping', 'resuming', 'pausing', 'draining', 'flushing']);

  function normalizeVoiceState(state, payload = {}) {
    const raw = String(state || payload.status || payload.state || '').toLowerCase().replace(/[\s_-]+/g, '-');
    const message = String(payload.message || payload.error || '');
    if (/permission|denied|unavailable|error|failed/.test(raw) || /permission denied|not allowed/i.test(message)) return 'error';
    if (/unbound|not-bound/.test(raw)) return 'unbound';
    if (/bootstrap|binding|loading/.test(raw)) return 'bootstrapping';
    if (/resume|starting/.test(raw)) return 'resuming';
    if (/pause|releas/.test(raw)) return 'pausing';
    if (/drain|settling|finishing|not-settled|response[.-]done|response[.-]finished/.test(raw) || /not settled/i.test(message)) return 'draining';
    if (/flush|saving|commit/.test(raw)) return 'flushing';
    if (/speech|vad/.test(raw)) return 'speech';
    if (/process|thinking|generat|transcrib|asr|stt/.test(raw)) return 'processing';
    if (/speak|play|audio|tts/.test(raw)) return 'speaking';
    if (/listen|active/.test(raw)) return 'listening';
    if (/idle|paused|released|ready/.test(raw)) return 'idle';
    return raw || 'idle';
  }

  function describeVoiceState(state, payload = {}) {
    const normalized = normalizeVoiceState(state, payload);
    const message = String(payload.message || '');
    const map = {
      unbound: ['Not bound', 'Voice needs the active Core conversation before microphone capture.'],
      bootstrapping: ['Preparing', 'Loading the Core conversation snapshot into the Voice workspace.'],
      idle: ['Idle', 'Microphone is off.'],
      resuming: ['Starting', 'Attaching microphone after Voice workspace is ready.'],
      listening: ['Listening', 'Microphone is active.'],
      speech: ['Speech detected', 'Listening to Tony; transcript is still Voice workspace state.'],
      processing: ['Thinking', 'Voice is processing speech/assistant generation.'],
      speaking: ['Speaking', 'Julia audio may still be playing.'],
      draining: ['Finishing…', 'Waiting for Voice generation/audio/workspace to settle before switching modes.'],
      pausing: ['Releasing mic', 'Microphone capture is being released.'],
      flushing: ['Saving Voice', 'Final Voice turns are being committed to Core canonical conversation.'],
      error: ['Voice error', message || 'Voice is in a recoverable error state.'],
    };
    const [label, detail] = map[normalized] || ['Voice', message || 'Voice state unavailable.'];
    return { state: normalized, label, detail, active: ACTIVE_STATES.has(normalized), busy: BUSY_STATES.has(normalized) };
  }

  function getVoiceControlState(state) {
    const info = describeVoiceState(state);
    return {
      startDisabled: ['bootstrapping', 'resuming', 'listening', 'speech', 'processing', 'speaking', 'draining', 'flushing', 'pausing'].includes(info.state),
      releaseDisabled: ['unbound', 'bootstrapping', 'idle', 'flushing'].includes(info.state),
      textSwitchDiscouraged: ['bootstrapping', 'resuming', 'draining', 'flushing', 'pausing'].includes(info.state),
      modeSwitchBusy: ['bootstrapping', 'flushing', 'pausing'].includes(info.state),
    };
  }

  function isVoiceWorkspaceNotSettled(error) {
    return /workspace is not settled|not settled|draining/i.test(String(error?.message || error || ''));
  }

  return {
    normalizeVoiceState,
    describeVoiceState,
    getVoiceControlState,
    isVoiceWorkspaceNotSettled,
  };
});
