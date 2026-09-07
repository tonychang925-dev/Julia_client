# ADR-CLIENT-C2A — Phase 5 Voice Authority Cutover

Status: ACCEPTED FOR IMPLEMENTATION
Date: 2026-09-07
Scope: Julia Electron / Voice conversation authority only

## Context

Research Desk V1 canonical acceptance is closed. Julia Client C1 text turns already use Core ConversationRuntime as canonical authority. The remaining continuity blocker is the Electron Voice path.

The repository currently contains a hybrid of two historical Voice contracts:

1. The earlier Voice C1B workspace-reconcile design allowed Electron to transport a Core-produced history snapshot into an ephemeral Voice workspace and contemplated a later workspace delta commit.
2. The later Phase 5 / VC-03 Voice runtime retired shadow semantic turns. In the deployed-authorized Voice source, completed semantic turns live in Core, `VoiceWorkspace.exportDelta()` is empty, Electron-host attachment binds only a canonical `conversation_id`, S2S propagates that identity into the Brain request, and Brain/Core ConversationRuntime persists the semantic turn.

The current Electron renderer still sends `julia.voice.workspace.bootstrap` with `messages[]` and `baseLastMessageId`, then calls `workspace.flush` and retains an Electron `commitExternalTurns` fence. Those semantics are stale relative to the Phase 5 production authority.

## Decision

The sole canonical Voice semantic path is:

```text
Electron canonical conversation_id
→ Voice host attach / bind ACK
→ Voice session metadata
→ S2S
→ Brain /v1/chat/completions
   {conversation_id, turn_id, modality=voice}
→ Core ConversationRuntime
→ canonical ConversationMessage persistence
```

Electron is a control-plane and projection client. It MUST NOT own or upload Voice semantic history.

### Electron → Voice bind contract

Electron MUST:

- send `julia.voice.host.attach` with:
  - `protocol: "julia-electron-v2"`
  - canonical `conversationId`
  - a request correlation ID
- wait for a positive bind acknowledgement for the exact requested conversation;
- set `boundVoiceConversationId` only after that acknowledgement;
- fail closed on timeout, negative ACK, missing conversation identity, or identity mismatch.

Electron MUST NOT send as Voice authority:

- `messages[]`
- `history`
- `external_history`
- `baseLastMessageId`
- locally reconstructed conversation truth

### Persistence contract

Voice semantic persistence is direct S2S → Brain → Core.

Electron MUST NOT:

- collect completed Voice turns for semantic commit;
- upload Voice turns through `commitExternalTurns`;
- treat `workspace.flush` as a persistence authority;
- mark local Voice material canonical before Core read-back.

Electron MAY keep bounded RAM-only Voice UX projection and MAY refresh the disposable local projection from Core after Voice events or mode transitions.

### Lifecycle contract

The existing VOICE-WS-LIFECYCLE-001 frame-unload / bounded 1008 handoff handling remains in scope and is not changed by this ADR. It is lifecycle handling, not an alternate semantic authority.

## Supersession

For Julia Electron semantic conversation authority, this ADR supersedes the older workspace-history / workspace-delta assumptions.

Legacy compatibility handlers in the Voice frontend (`workspace.bootstrap`, `workspace.flush`, `workspace.committed`) are not Electron authority and must not be used by the canonical Electron path.

The `commitExternalTurns` safety fence may remain temporarily as unreachable defensive code until exposure-minimality cleanup, but no production renderer path may call it.

## Acceptance invariants

CLIENT-C2A closes only when all are proven:

1. Electron bind uses `julia.voice.host.attach` with canonical ID only.
2. No `messages[]` or `baseLastMessageId` crosses the Electron → Voice bind boundary.
3. Bound state is assigned only after a positive matching ACK.
4. Renderer has zero runtime call sites to `commitExternalTurns`.
5. Voice exit/hide/conversation-switch performs lifecycle release plus Core projection refresh, never an Electron semantic commit.
6. Existing Core-first text/conversation authority is unchanged.
7. No fallback, synthetic history, or client-owned canonical persistence is introduced.

## Deferred, explicitly out of scope

- CSP / Voice URL hardening
- plaintext projection-cache hardening
- single-instance lock
- Diary wiring
- removal of unrelated dead preload APIs
- Research Desk internals
