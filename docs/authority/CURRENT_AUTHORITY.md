# Julia Electron Current Authority

STATUS: CANONICAL
UPDATED: 2026-08-11
REPOSITORY: Julia_client
LOCAL PATH: /Users/admin/julia_electron_v2
ROLE: Electron desktop client for Julia Voice/Text interaction
AUTHORITATIVE BRANCH: codex/bugfix/electron-c10-c11-projection
AUTHORITATIVE CODE COMMIT AT CC-1 SOURCE CLOSEOUT: 56cac30f3f467d28f9eacca0e4a4b6167038c9d4
AUTHORITATIVE DOC HEAD: 381484ea03746456e7e5eed6adb4946e9d300cca plus C2 metadata successor

## Repository identity

This is the active production/development Electron repository.

Remote:

- `https://github.com/tonychang925-dev/Julia_client.git`

DO-NOT-USE AS PRODUCTION AUTHORITY:

- local `/Users/admin/julia_electron`
- remote `tonychang925-dev/julia_electron`

The old `julia_electron` repository is legacy/historical and must not be used for RMD-3G/RMD-4 production work unless Tony explicitly re-authorizes it.

## Current production/development status

- Electron connects to S2S `:8765` for realtime Voice.
- S2S is now production-supervised on AutoDL.
- Electron should treat S2S startup as potentially long-running and should not classify model cold-start as permanent failure without retry/readiness UX.
- CC-1 canonical conversation convergence is in force for Electron: Text and Voice attach to the same Core/ConversationRuntime conversation identity.

## Authoritative docs

CANONICAL:

- `docs/architecture.md`
- `docs/contracts/Julia-Conversation-Domain-Contract-v1.md`
- `docs/adrs/ADR-UI-001-mutually-exclusive-text-voice-surfaces.md`
- `docs/adrs/ADR-UI-002-voice-microphone-lifecycle.md`
- this file

DERIVED / HISTORICAL AUDIT EVIDENCE:

- `docs/audit/*`
- `docs/e1-validation.md`

## CC-1-C2 bind acknowledgement authority

STATUS: SOURCE COMMITTED / AWAITING VOICE ARTIFACT + DEPLOYMENT

C2 Electron source commit:

- `d8ec4e28d178ccb31b361efdfb6dd81d33227d0b`

Required behavior:

- Electron sends `julia.voice.conversation.bind` with canonical `conversationId`.
- Electron waits for `julia.voice.conversation.bound` ACK.
- Electron marks `boundVoiceConversationId` only after ACK `conversationId` exactly equals requested C.
- Electron does not send copied `messages[]` or `baseLastMessageId` to Voice.


## Tunnel lifecycle authority (TUNNEL-L1)

STATUS: SOURCE PACKAGE PENDING DEPLOYMENT / PRODUCTION AUTHORITY AFTER INSTALL

Voice local transport tunnel purpose:

- Mac `127.0.0.1:7860` -> AutoDL `127.0.0.1:7860` for Voice frontend.
- Mac `127.0.0.1:8765` -> AutoDL `127.0.0.1:8765` for S2S WebSocket/API.

CANONICAL (version-controlled):

- `deploy/mac/start-voice-tunnels`
- `deploy/mac/com.julia.tunnel.voice-local.plist`
- `deploy/mac/com.julia.tunnel.voice-local.watchdog.plist`
- `deploy/mac/health-voice-tunnels`
- `deploy/mac/voice-tunnel.env.example`

LOCAL OPERATIONAL CONFIG / NOT COMMITTED:

- `/Users/admin/.julia_ops/tunnel.env`
- `/Users/admin/.ssh/julia_autodl_ed25519` mode `600`

Production lifecycle authority after TUNNEL-L1 install:

- launchd label `com.julia.tunnel.voice-local` owns the SSH process.
- launchd label `com.julia.tunnel.voice-local.watchdog` owns health checks and restarts via `launchctl kickstart -k`.
- Manual SSH tunnel commands are HISTORICAL / NON-AUTHORITATIVE.
- Watchdog must not spawn ad-hoc SSH; it may only restart the canonical launchd service.

## Current production code paths

ACTIVE:

- Electron main process / app bootstrap under the current committed source tree
- active realtime Voice client path that connects to S2S `ws://<host>:8765/v1/realtime`
- active UI path under `src/`, `app/`, `frontend/`, or project-specific equivalent in this repository
- CC-1 Voice binding path: Electron sends the active canonical `conversation_id` to Voice and never uploads copied Voice history back to Core
- Core/ConversationRuntime projection sync: Electron may refresh canonical messages for display, but this is not conversation authority

LEGACY / RETIREMENT TARGETS:

- old workspace/bootstrap semantic authority paths: RETIRED by CC-1; do not reintroduce message snapshot bootstrap into Voice
- client-owned history authority: RETIRED by CC-1; Electron local cache is display/projection only
- Voice external-turn commit path: DEPRECATED SAFETY FENCE ONLY; if invoked, it rejects instead of writing `/external-turns`
- any old LiveKit-only path not referenced by current Voice architecture

## Open remediation items

- RMD-4 will remove any remaining transitional protocol/client authority after RMD-3G LIVE closes.
- Add explicit S2S STARTING/READY reconnect UX if not already complete.
- Remove the deprecated `commitExternalTurns` IPC safety fence after all historical callers are proven absent.
- Keep `.claude-dev/` untracked; it is not production authority.
