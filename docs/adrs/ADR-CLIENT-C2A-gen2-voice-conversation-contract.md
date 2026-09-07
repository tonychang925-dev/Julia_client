# ADR-CLIENT-C2A — Current gen-2 Voice Conversation Contract

STATUS: ACCEPTED AS CURRENT RUNTIME CONTRACT
DATE: 2026-09-07
SCOPE: Julia_client / Julia-Voice-S2S / Julia-AI-Assistant / Julia_core conversation continuity

## Decision

The current production Voice conversation contract is the existing gen-2 runtime path. No runtime migration to `julia.voice.host.attach` is authorized by this ADR.

## Current runtime sequence

```text
Electron
  julia.voice.workspace.bootstrap {
    conversationId,
    baseLastMessageId,
    messages[]
  }
    ↓
S2S
  strips copied messages[] from semantic authority
  bindCanonicalConversation(conversationId)
  configures /v1/realtime session metadata.conversation_id
    ↓
S2S per-turn Brain request
  extra_body {
    conversation_id,
    voice_trace_id,
    turn_id
  }
    ↓
Brain / Core ConversationRuntime
  canonical user + assistant persistence
    ↓
Electron
  realtime live-message = display only
  debounced canonical sync = projection refresh from Core truth
```

## Authority rule

The presence of `messages[]` and `baseLastMessageId` in the Electron bootstrap payload does not give Electron or Voice semantic history authority.

Canonical semantic authority is the Core ConversationRuntime conversation identified by `conversation_id`.

S2S must not promote copied Electron history into canonical Voice or Core history.

## Findings reconciled

### F1 — documentation/test drift

Some Client authority text/tests described direct `julia.voice.conversation.bind` with no copied history as the current Electron protocol. That description is stale relative to the current gen-2 runtime.

Disposition: documentation/tests must be reconciled to the real runtime before they can be used as current protocol evidence.

### F2 — gen-3 precondition

S2S implements `julia.voice.host.attach`; while in `WAIT_HOST_ATTACH`, direct `conversation.bind` is rejected.

Disposition: `host.attach` is a future coordinated migration candidate, not a current Electron requirement. A partial migration that changes Electron to direct bind without host attachment is invalid.

### F3 — redundant copied history

Electron currently sends `messages[]`, but S2S strips/ignores those messages for semantic authority.

Disposition: this is redundant transport debt, not a continuity correctness failure. Removal may be considered separately only after compatibility is proven.

### F4 — dormant external-turn commit path

S2S `workspace.flush` returns `turns: []`; Electron `commitExternalTurns` therefore does not participate in the real working persistence loop.

Disposition: keep the path fail-closed and classify it as deprecated. A future non-empty delta would be a contract change requiring explicit qualification.

### F5 — two protocol generations coexist

- gen-2: `julia.voice.workspace.*` — currently used by Electron
- gen-3: `julia.voice.host.attach` — implemented by S2S, not currently sent by Electron

Disposition: coexistence is migration debt. Documentation must not collapse the two generations into one protocol.

## Non-goals

This ADR does not:

- migrate Electron to gen-3
- change Voice runtime behavior
- change Brain/Core persistence behavior
- authorize external-turn persistence
- treat Electron realtime cache as canonical history
- reopen Research Desk architecture

## Acceptance consequence

Continuity acceptance must test the current gen-2 path as it actually runs:

`Electron bootstrap → S2S canonical conversation_id binding → Brain/Core canonical commit → Electron Core sync`

A separate migration project may later replace gen-2 with `host.attach`, but that migration must have its own cross-repository contract, rollback/fail-closed behavior, and E2E evidence.
