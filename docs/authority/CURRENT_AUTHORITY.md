# Julia Electron Current Authority

STATUS: CANONICAL
UPDATED: 2026-09-07
REPOSITORY: Julia_client
LOCAL PATH: /Users/admin/julia_electron_v2
ROLE: Electron desktop client / presentation projection for Julia Voice/Text
AUTHORITATIVE BASE COMMIT FOR THIS RECONCILIATION: 2eed98d9e54394b7de79a2e2c802222354cf8c0a
SUPERSEDED CC-1 SOURCE CLOSEOUT: 56cac30f3f467d28f9eacca0e4a4b6167038c9d4 (historical)

## Repository identity

This is the active production/development Electron repository.

Remote:

- `https://github.com/tonychang925-dev/Julia_client.git`

DO-NOT-USE AS PRODUCTION AUTHORITY:

- local `/Users/admin/julia_electron`
- remote `tonychang925-dev/julia_electron`

The old `julia_electron` repository is legacy/historical and must not be used for production work unless Tony explicitly re-authorizes it.

## Current production/development status

- Electron connects to S2S `:8765` for realtime Voice.
- S2S is production-supervised on AutoDL.
- CC-1 canonical conversation convergence is in force: Text and Voice converge on the same Core/ConversationRuntime conversation identity.
- Electron local conversation state is projection/display state only; Core/ConversationRuntime is canonical history authority.

## Authoritative docs

CANONICAL:

- `docs/architecture.md`
- `docs/contracts/Julia-Conversation-Domain-Contract-v1.md`
- `docs/adrs/ADR-UI-001-mutually-exclusive-text-voice-surfaces.md`
- `docs/adrs/ADR-UI-002-voice-microphone-lifecycle.md`
- `docs/adrs/ADR-CLIENT-C2A-gen2-voice-conversation-contract.md`
- this file

DERIVED / HISTORICAL AUDIT EVIDENCE:

- `docs/audit/*`
- `docs/e1-validation.md`

## Current Voice conversation contract — gen-2 ACTIVE

STATUS: CURRENT RUNTIME AUTHORITY

The currently deployed/working cross-repository path is:

1. Electron sends `julia.voice.workspace.bootstrap` with:
   - canonical `conversationId`
   - `baseLastMessageId`
   - `messages[]`
2. S2S accepts the bootstrap transport but strips/ignores copied `messages[]` for semantic authority.
3. S2S binds the canonical `conversationId` through `bindCanonicalConversation(conversationId)` and configures realtime session metadata.
4. S2S sends Brain requests carrying canonical identity metadata including:
   - `conversation_id`
   - `voice_trace_id`
   - `turn_id`
5. Brain/Core ConversationRuntime owns canonical user/assistant turn persistence.
6. Electron may display realtime `live-message` data immediately, but that display is non-canonical.
7. Electron debounces and refreshes from Core; Core truth wins reconciliation.

### Important distinction: transport vs semantic authority

`workspace.bootstrap` is ACTIVE as the current wire/transport contract.

The copied `messages[]` and `baseLastMessageId` are NOT canonical semantic authority. Their presence in the Electron payload must not be interpreted as permission for Voice or Electron to reconstruct, replace, or mint canonical conversation history.

The current S2S implementation enforces this by stripping copied history before canonical binding.

## gen-3 `host.attach` status

STATUS: IMPLEMENTED IN S2S / NOT CURRENT ELECTRON CONTRACT / MIGRATION CANDIDATE

S2S contains a newer hosted protocol based on `julia.voice.host.attach`, but Electron does not currently send `host.attach`.

In S2S `WAIT_HOST_ATTACH` state, a direct legacy `conversation.bind` is rejected until host attachment occurs. Therefore documentation or tests must not instruct current Electron runtime to switch directly to `conversation.bind` without a coordinated gen-3 migration.

A future migration to gen-3 must be treated as an explicit cross-repository protocol migration with coordinated Electron + S2S changes and acceptance evidence. It is not a documentation-only correction and is not required to preserve the currently working gen-2 continuity path.

## Voice flush / external-turn commit status

CURRENT BEHAVIOR:

- S2S `workspace.flush` returns `turns: []` under the current Core-owned persistence model.
- Electron `commitExternalTurns` is therefore not exercised by the real working Voice loop.
- `commitExternalTurns` remains a deprecated fail-closed safety fence, not a production persistence authority.

If S2S ever returns non-empty external turns, that would represent a contract change and must fail qualification until explicitly authorized; Electron must not silently promote those turns to Core canonical history.

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

ACTIVE:

- Electron main process / app bootstrap under the current committed source tree
- current Electron `workspace.bootstrap` Voice transport
- S2S canonical `conversation_id` binding into realtime session metadata
- S2S → Brain request propagation of `conversation_id` / `voice_trace_id` / `turn_id`
- Brain/Core ConversationRuntime canonical turn persistence
- Electron canonical conversation sync for projection refresh
- VOICE-WS-LIFECYCLE-001 frame unload / bounded single-slot handoff handling

NON-AUTHORITATIVE / TRANSITIONAL:

- Electron-copied `messages[]` as semantic history input: NOT AUTHORITY; S2S strips it
- Electron `baseLastMessageId` as canonical persistence authority: NOT AUTHORITY
- Electron realtime `live-message` cache: DISPLAY ONLY
- Electron external-turn commit: DEPRECATED FAIL-CLOSED FENCE
- gen-3 `host.attach`: FUTURE MIGRATION CANDIDATE, NOT CURRENT ELECTRON RUNTIME CONTRACT
- client-owned conversation history authority: RETIRED

## Open remediation items

1. Reconcile stale Client documentation/tests that still describe direct `conversation.bind` as the current Electron protocol.
2. Preserve current runtime behavior while doing that reconciliation; no Voice runtime change is authorized by documentation drift alone.
3. Remove redundant copied bootstrap history only as a separately reviewed cleanup after proving no hidden consumer depends on payload shape; this is not required for current continuity correctness because S2S already strips it.
4. Decide gen-3 `host.attach` migration separately, with a cross-repository migration plan and acceptance gate.
5. Remove deprecated `commitExternalTurns` only after all historical callers are proven absent.
6. Keep `.claude-dev/` untracked; it is not production authority.
