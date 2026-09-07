# Julia Electron Current Authority

STATUS: CANONICAL BASELINE / CLIENT-C2A CUTOVER IN PROGRESS
UPDATED: 2026-09-07
REPOSITORY: Julia_client
LOCAL PATH: /Users/admin/julia_electron_v2
ROLE: Electron desktop client / presentation projection for Julia Voice/Text
AUTHORITATIVE BASELINE: glm-d/julia-client-c1-transport-hardening @ 2eed98d
CLIENT-C2A IMPLEMENTATION BRANCH: client-c2a-voice-authority-cutover
SUPERSEDED CC-1 SOURCE CLOSEOUT: 56cac30f3f467d28f9eacca0e4a4b6167038c9d4 (historical)

## Repository identity

This is the active production/development Electron repository.

Remote:

- `https://github.com/tonychang925-dev/Julia_client.git`

DO-NOT-USE AS PRODUCTION AUTHORITY:

- local `/Users/admin/julia_electron`
- remote `tonychang925-dev/julia_electron`

The old `julia_electron` repository is legacy/historical and must not be used for production continuity work unless Tony explicitly re-authorizes it.

## Current production/development status

- Electron connects to S2S `:8765` for realtime Voice.
- S2S is production-supervised on AutoDL.
- CC-1 canonical conversation convergence is in force: Text and Voice attach to one Core/ConversationRuntime conversation identity.
- Text C1 is Core-first and uses Julia-native conversation endpoints.
- Electron local conversation state is a disposable presentation projection, never cognition/history authority.
- Phase 5 Voice authority is direct S2S → Brain → Core semantic persistence; Electron is control-plane + projection only.

## Authoritative docs

CANONICAL:

- `docs/architecture.md`
- `docs/contracts/Julia-Conversation-Domain-Contract-v1.md`
- `docs/adrs/ADR-UI-001-mutually-exclusive-text-voice-surfaces.md`
- `docs/adrs/ADR-UI-002-voice-microphone-lifecycle.md`
- `docs/adrs/ADR-CLIENT-C2A-voice-authority-cutover.md`
- this file

DERIVED / HISTORICAL AUDIT EVIDENCE:

- `docs/audit/*`
- `docs/e1-validation.md`

## CLIENT-C2A / CC-1 Voice authority

STATUS: PHASE 5 AUTHORITY PROVEN / ELECTRON CUTOVER IN PROGRESS

### Canonical semantic path

```text
Electron canonical conversation_id
→ Voice host attach / bind ACK
→ S2S session metadata
→ S2S Brain request {conversation_id, turn_id, modality=voice}
→ Core ConversationRuntime
→ canonical ConversationMessage persistence
```

The deployed-authorized Phase 5 Voice source has already retired shadow semantic turns: completed Voice semantic turns live in Core; Voice workspace delta export is empty; workspace bootstrap/flush are compatibility handlers rather than canonical persistence authority.

### Required Electron behavior

- Electron sends `julia.voice.host.attach` with protocol `julia-electron-v2` and canonical `conversationId`.
- Electron waits for the resulting positive bind acknowledgement.
- Electron marks `boundVoiceConversationId` only after ACK `conversationId` exactly equals the requested conversation.
- Electron does not send copied `messages[]`, `history`, `external_history`, or `baseLastMessageId` to Voice.
- Electron does not commit completed Voice semantic turns back to Core.
- Electron may refresh its disposable projection from Core after Voice events/mode transitions.

### Retired semantic paths

The following are not canonical Electron authority:

- `julia.voice.workspace.bootstrap` with conversation-history snapshot
- `julia.voice.workspace.flush` as semantic persistence
- Electron `commitExternalTurns` as a Voice commit mechanism
- client-owned or iframe-owned durable conversation history

The `commitExternalTurns` implementation may remain temporarily as an unreachable fail-closed safety fence until exposure-minimality cleanup, but no production renderer path may invoke it.

## Tunnel lifecycle authority (TUNNEL-L1)

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

ACTIVE / REQUIRED:

- Electron main process / app bootstrap under the current committed source tree
- active realtime Voice client path that connects to S2S `ws://<host>:8765/v1/realtime`
- active UI path under `src/renderer/shell`
- Text path → Brain native conversation endpoints → Core ConversationRuntime
- Voice identity transport → S2S → Brain → Core ConversationRuntime
- Core/ConversationRuntime projection sync for display only
- VOICE-WS-LIFECYCLE-001 frame release / bounded single-slot handoff handling

LEGACY / RETIREMENT TARGETS:

- workspace/bootstrap semantic history snapshot
- workspace/flush semantic commit semantics
- client-owned history authority
- Voice external-turn commit surface
- unrelated old Voice paths not referenced by the current architecture

## Open remediation items

- CLIENT-C2A: cut Electron runtime from workspace bootstrap/flush semantics to Phase 5 ID-only host attach/bind.
- CLIENT-C2A: make the stale Voice authority tests match the proven Phase 5 contract without weakening them.
- CLIENT-C2C: run Text ↔ Voice continuity E2E after C2A qualification.
- CLIENT-C2D: remove unreachable transitional/dead IPC surfaces after absence of callers is proven.
- Security hardening (CSP, Voice URL scope, plaintext projection cache, single-instance) remains separate from continuity authority closure.
- Diary wiring remains out of scope for C2A.
- Keep `.claude-dev/` untracked; it is not production authority.
