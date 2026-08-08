# Julia Electron V2 Architecture

## ADR-ELECTRON-001: Clean Shell + Selective Migration

旧 `julia_electron` 冻结为 legacy feature donor；新 Electron V2 从最小 BrowserWindow / Web Voice shell 建立。非媒体功能经审计后逐项迁移，旧 Voice/media 实现禁止迁移。

## Local Loopback Profile — E0/E1 Default

E1 默认原样复现当前 Safari Reference，不引入 TLS / 证书 / WSS 迁移变量：

```text
Electron V2 BrowserWindow
  -> http://localhost:7860
  -> existing HF Web Voice
  -> ws://localhost:8765 as implemented by the frozen Web client
```

默认入口：

```bash
npm start
```

等价显式入口：

```bash
npm run start:http
```

## Secure-by-scope URL Rule

允许：

```text
http://localhost:7860       # loopback, potentially trustworthy origin
http://127.0.0.1:7860       # loopback, potentially trustworthy origin
https://...                 # non-local / production profile
```

禁止：

```text
remote http://...
remote ws://... as a desktop-controlled endpoint
```

V2 自身不重写 HF Web Voice 内部的 WebSocket；E1 目标是保持同一页面、同一 URL、同一 S2S 路径，仅把运行环境从 Safari WebKit 换成 Electron Chromium。

## HTTPS Compatibility Profile

未来需要验证 HTTPS 时可使用：

```bash
npm run start:https
```

本地自签证书诊断入口仅用于 DEV / DIAGNOSTIC ONLY：

```bash
npm run start:https:diagnostic:insecure-localhost
```

`JULIA_ALLOW_INSECURE_LOCALHOST_CERT=1` 只允许 localhost / 127.0.0.1 / ::1 的 HTTPS 证书临时放行，不允许远端主机放行，也不属于生产设计。

## Hard Boundary

V2 主进程可以负责：

- BrowserWindow lifecycle
- microphone permission
- window/tray/settings/status later

V2 主进程禁止负责：

- microphone PCM capture
- PCM forwarding
- audio playback queue
- VAD / STT / TTS
- realtime media WebSocket proxy
- Julia streaming response processing

## Migration Rule

从 legacy 迁移能力，不迁移历史媒体架构：

- KEEP/MIGRATE: conversation model, persistence, search, settings, non-media UI
- REVIEW: tray, window state, Julia Brain control/status API
- DROP: VoiceEngineClient, PCM buffer, ScriptProcessor, playback scheduler, media IPC, VAD/STT/TTS client logic
