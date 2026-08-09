const fs = require('fs');
const path = require('path');

const DEFAULT_FILE_NAME = 'julia-settings-v1.json';
const DEFAULT_SETTINGS = {
  version: 1,
  defaultMode: 'text',
  brainEndpoint: 'http://127.0.0.1:18089',
  closeBehavior: 'tray',
  launchAtLogin: false,
  windowRestore: true,
  trayEnabled: true,
  globalShortcut: 'CommandOrControl+Shift+J',
  windowState: null,
};

function normalizeBrainEndpoint(value) {
  const endpoint = String(value || DEFAULT_SETTINGS.brainEndpoint).trim();
  const parsed = new URL(endpoint);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Julia Brain endpoint must be http:// or https://');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function normalizeSettings(input = {}) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...input,
    version: DEFAULT_SETTINGS.version,
  };

  return {
    version: DEFAULT_SETTINGS.version,
    defaultMode: ['text', 'voice'].includes(merged.defaultMode) ? merged.defaultMode : DEFAULT_SETTINGS.defaultMode,
    brainEndpoint: normalizeBrainEndpoint(merged.brainEndpoint),
    closeBehavior: ['tray', 'quit'].includes(merged.closeBehavior) ? merged.closeBehavior : DEFAULT_SETTINGS.closeBehavior,
    launchAtLogin: Boolean(merged.launchAtLogin),
    windowRestore: Boolean(merged.windowRestore),
    trayEnabled: Boolean(merged.trayEnabled),
    globalShortcut: String(merged.globalShortcut || DEFAULT_SETTINGS.globalShortcut).trim(),
    windowState: normalizeWindowState(merged.windowState),
  };
}

function normalizeWindowState(value) {
  if (!value || typeof value !== 'object') return null;
  const width = Number(value.width);
  const height = Number(value.height);
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

  return {
    width: Math.max(900, Math.round(width)),
    height: Math.max(640, Math.round(height)),
    x: Number.isFinite(x) ? Math.round(x) : undefined,
    y: Number.isFinite(y) ? Math.round(y) : undefined,
    maximized: Boolean(value.maximized),
  };
}

class SettingsStore {
  constructor(baseDir, fileName = DEFAULT_FILE_NAME) {
    this.baseDir = baseDir;
    this.filePath = path.join(baseDir, fileName);
    this.settings = normalizeSettings();
    this.loaded = false;
  }

  load() {
    if (this.loaded) return this.settings;
    fs.mkdirSync(this.baseDir, { recursive: true });

    if (fs.existsSync(this.filePath)) {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.settings = normalizeSettings(JSON.parse(raw));
    } else {
      this.settings = normalizeSettings();
      this.save();
    }

    this.loaded = true;
    return this.settings;
  }

  save() {
    fs.mkdirSync(this.baseDir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.settings, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  getSettings() {
    return this.load();
  }

  updateSettings(patch = {}) {
    this.load();
    this.settings = normalizeSettings({
      ...this.settings,
      ...patch,
    });
    this.save();
    return this.settings;
  }

  updateWindowState(windowState) {
    this.load();
    this.settings = normalizeSettings({
      ...this.settings,
      windowState,
    });
    this.save();
    return this.settings.windowState;
  }
}

function createSettingsStore(baseDir) {
  return new SettingsStore(baseDir);
}

module.exports = {
  DEFAULT_SETTINGS,
  SettingsStore,
  createSettingsStore,
  normalizeBrainEndpoint,
};
