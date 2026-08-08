# Julia Conversation Domain Contract v1

## Status

```text
Draft / M2.3
```

## Date

```text
2026-08-08
```

## Baseline References

```text
M1 Voice Shell V1
  tag: julia-electron-v2-voice-shell-v1
  commit: 8fa1f369450c934728e4a310c53ac5cbe3cdaaed

M2.1 ADR-UI-001
  commit: aba77ea

M2.2 Information Architecture
  commit: 5744cb3
```

## Core Principle

```text
Persistent conversation history != realtime runtime history.
```

This pairs with ADR-UI-001:

```text
Unified conversation does not require unified presentation.
```

## Purpose

M2.3 defines the logical Conversation Domain contract required for Julia Desktop to support Text and Voice as separate surfaces over one logical Julia conversation.

It answers:

```text
who owns durable conversation history
who owns active Voice runtime history
how context crosses Text / Voice boundaries without duplicating runtime history
how text and voice turns are identified
how interrupted/failed turns are represented
what must be idempotent
```

It does not implement persistence, UI, transport, or Voice Core changes.

## Non-Goals

M2.3 does not define or implement:

```text
database technology
SQLite/Postgres/IndexedDB choice
physical schema or migrations
UI components
renderer implementation
Electron Main/IPC media path
S2S protocol changes
VAD/STT/TTS changes
Julia Core memory algorithm
legacy data migration
search indexing
settings
avatar
latency optimization
```

## Three Distinct Histories

Julia Desktop must treat these as distinct systems:

```text
Conversation Store
  = durable / user-visible history

S2S runtime history
  = ephemeral realtime Voice context

Julia Core memory
  = Julia identity / persona / long-term semantic memory
```

They must not pretend to be the same object.

They may exchange carefully scoped context through explicit contracts, but they must not continuously mirror or overwrite each other.

## Current vs Target Ownership

### Current validated state

```text
S2S owns active Voice runtime history.
Electron V2 does not yet implement the Conversation Store defined here.
Electron V2 currently hosts the existing HF Web Voice surface.
Voice Core remains unchanged.
```

### Target state

```text
Conversation Domain owns logical conversation identity.
Conversation Store owns durable user-visible conversation history.
S2S / Voice Runtime owns active Voice short-term runtime history.
Julia Core owns identity, persona, and long-term semantic memory.
```

Identifier invariant:

```text
conversation_id MUST NOT be assumed to equal:
  voice_session_id
  S2S runtime/session identifier
  WebSocket identifier
  Julia Core internal session identifier
```

Mapping between runtime identifiers and `conversation_id` is an implementation concern outside this contract.

## Target Architecture

```text
                         Julia Identity / Memory
                               Julia Core
                                   ▲
                                   │
                         reasoning / long memory
                                   │
             ┌─────────────────────┴─────────────────────┐
             │                                           │
        TEXT RUNTIME                                VOICE RUNTIME
             │                                           │
             │                                      HF S2S session
             │                                      short-term history
             │                                           │
             └─────────────────────┬─────────────────────┘
                                   │
                        Conversation Domain
                                   │
                         Conversation Store
                                   │
                         durable user history
```

## Ownership Model

| Concern | Owner |
|---|---|
| Logical conversation identity | Conversation Domain |
| Durable message history | Conversation Store |
| Active Voice short-term runtime history | S2S / Voice Runtime |
| Julia identity / persona / long-term memory | Julia Core |
| Audio / VAD / STT / TTS / barge-in | Voice Engine / S2S |
| Presentation | Text Surface / Voice Surface |
| Text runtime request/response lifecycle | Text Runtime |
| Voice runtime session lifecycle | Voice Runtime / S2S |

Key invariant:

```text
Conversation Store MUST NOT become the active Voice runtime history owner.
S2S runtime history MUST NOT become the durable user-visible history owner.
Julia Core memory MUST NOT be treated as a UI transcript database.
```

## Domain Terminology

### Conversation

A user-recognizable logical discussion with Julia.

A Conversation may include text turns and voice turns.

### Turn

A logical interaction attempt.

A Turn commonly contains a user message and an assistant response, but it MUST NOT require exactly two completed Messages.

A Turn may be incomplete, interrupted, or failed.

### Message

A persisted or persistable content record belonging to a Conversation and optionally grouped under a Turn.

Initial M2.3 scope only covers:

```text
role = user | assistant
modality = text | voice
```

A Turn represents one logical interaction attempt and may contain zero, one, or multiple persisted Messages depending on failure/interruption timing.

### Voice Session

A realtime Voice runtime session, typically backed by S2S.

A Voice Session is not the same as a logical Conversation.

A single Conversation may include multiple Voice Sessions.

### Runtime History

Ephemeral context maintained by a runtime while it is active.

For Voice, active runtime history is owned by S2S / Voice Runtime.

### Persistent History

Durable, user-visible history stored by Conversation Store.

Persistent History is used for display, search, export, and future context derivation.

### Context Seed

A bounded context object derived from durable history, summary, or memory to help initialize or orient a runtime without duplicating active runtime history.

Context Seed is not a full replay of Conversation Store.

## Identifier Contract

### conversation_id

Identifies the logical user-facing conversation.

```text
conversation_id = stable across Text and Voice surfaces
conversation_id != voice_session_id
```

Example:

```text
Conversation conv-A
├── Text interaction
├── Voice session #1
├── Text interaction
├── Voice session #2
└── Text interaction
```

### voice_session_id

Identifies a single realtime Voice runtime session.

It may change across:

```text
Voice reconnect
S2S restart
Return to Text then later re-enter Voice
explicit End Voice followed by new Voice entry
```

Changing `voice_session_id` MUST NOT automatically create a new logical `conversation_id`.

A `voice_session_id` MUST belong to exactly one logical `conversation_id` for its lifetime.

One `conversation_id` MAY span multiple `voice_session_id` values.

### turn_id

Identifies a logical user/assistant interaction unit.

A turn may contain one or more messages.

Example:

```text
turn_100
├── msg_100_user
│   role=user
│   modality=voice
└── msg_100_assistant
    role=assistant
    modality=voice
```

### message_id

Identifies one message record.

Message IDs should be stable enough to support idempotent persistence.

## Minimal Logical Contract

This is a logical contract, not a database schema.

### Conversation

```text
Conversation {
  conversation_id
  created_at
  updated_at
}
```

### Message

```text
Message {
  message_id
  conversation_id
  turn_id?
  role: "user" | "assistant"
  modality: "text" | "voice"
  content
  status
  created_at
  metadata
}
```

### Turn

```text
Turn {
  turn_id
  conversation_id
  modality: "text" | "voice"
  status
  created_at
  completed_at?
  metadata
}
```

### Voice Session

```text
VoiceSession {
  voice_session_id
  conversation_id
  started_at
  ended_at?
  status
  metadata
}
```

## Status Values

Minimum message/turn statuses:

```text
completed
interrupted
failed
```

Optional future statuses may include:

```text
pending
streaming
cancelled
partial
```

M2.3 only requires that interrupted and failed voice turns can be represented without corrupting completed history.

## Text Turn Semantics

Text turns are initiated by Text Surface / Text Runtime.

A completed Text turn may produce:

```text
user text message
assistant text message
turn status = completed
```

Text Surface presents conversation history, but does not own Conversation Store semantics.

## Voice Turn Semantics

Voice turns are initiated and managed by Voice Runtime / S2S.

A completed Voice turn may produce conversation-relevant turn information:

```text
final user transcript
final assistant text or transcript
turn status
voice_session_id metadata
```

Voice Surface may present immersive state, but it does not own Conversation Store persistence semantics.

Persistence and synchronization are owned by Conversation Domain / M2.3+ implementation decisions.

## Interruption Semantics

Barge-in may interrupt an assistant voice response.

A durable history representation must be able to record:

```text
assistant message status = interrupted
partial assistant content if available
new user turn begins after interruption
```

Example:

```text
turn_100
├── msg_100_user
│   role=user
│   modality=voice
│   status=completed
└── msg_100_assistant
    role=assistant
    modality=voice
    content="我觉得这里真正的问题是……"
    status=interrupted

turn_101
└── msg_101_user
    role=user
    modality=voice
    status=completed
```

An interrupted assistant Voice message MUST be represented as interrupted.

Persistent history MUST NOT imply that the full generated response was successfully delivered to the user.

Exact tracking of generated text versus delivered speech is deferred to implementation.

M2.3 does not require a specific audio delivery field. Future metadata may include:

```text
speech_delivery_complete=false
audio_interrupted_at_ms
cancel_reason
generated_text
delivered_text_estimate
```

## Failure Semantics

Failed text or voice turns must not be silently persisted as completed.

A failed turn may be represented as:

```text
status=failed
content may be empty or partial
metadata.error may contain diagnostic details
```

User-facing display rules are defined by UI specs, not by this contract.

## Persistence Semantics

Conversation Store saves durable records for:

```text
user-visible history
search
export
future context derivation
```

Voice persistence should happen through completed or finalized turn information, not by continuously cloning S2S internal runtime history.

Recommended flow:

```text
Voice runtime
     │
     │ final / finalized turn information
     ▼
Conversation Coordinator
     │
     ▼
Conversation Store
```

M2.3 does not define physical storage, transaction boundaries, or database APIs.

## Voice Runtime History Boundary

S2S / Voice Runtime owns active short-term Voice runtime history.

Conversation Store MUST NOT continuously replay the active Voice session back into S2S.

Forbidden pattern:

```text
S2S history
  ↔ continuous mirror/sync
Conversation Store
```

Forbidden replay pattern:

```text
S2S already has active session history:
U1 A1 U2 A2

Conversation Store injects same active history:
U1 A1 U2 A2

Result:
duplicate context
```

Allowed pattern:

```text
Conversation Store
  -> bounded Context Seed for new, stale, or context-deficient runtime only
```

A Context Seed MAY be supplied when a Voice runtime does not already possess sufficient context for the logical conversation.

Once an active Voice runtime owns its short-term history, Conversation Store MUST NOT continuously re-seed or replay that active-session history back into the runtime.

## Context Bridge Semantics

Text and Voice need logical continuity without runtime-history duplication.

### Text -> Voice

When entering Voice from an existing Text conversation:

```text
conversation_id remains the same
new or existing voice_session_id may be used
Voice Runtime may receive a bounded Context Seed when context-deficient
Conversation Store MUST NOT dump full active history into S2S by default
Conversation Store MUST NOT continuously re-seed an active Voice runtime that already owns its short-term history
```

Context Seed may be derived from future combinations of:

```text
recent durable turns
conversation summary
Julia Core memory
explicit user selection
```

M2.3 does not define the derivation algorithm.

Context Seed is not:

```text
full transcript replay
continuous sync
replacement for S2S active runtime history
replacement for Julia Core memory
```

### Voice -> Text

When returning from Voice to Text:

```text
conversation_id remains the same
finalized voice turns become eligible for durable history
Text Surface reads durable history through the future Conversation Domain contract
Voice transcript need not have been visible during Voice Mode
```

Voice -> Text continuity is primarily display continuity through Conversation Store, not a runtime history sync.

## Mode Transition Contract

### Text -> Voice

```text
AppMode: TEXT -> VOICE
conversation_id preserved
voice_session_id created or resumed according to Voice lifecycle
Context Seed MAY be supplied when needed
active Store history MUST NOT be continuously replayed into S2S
```

### Voice -> Text

```text
AppMode: VOICE -> TEXT
conversation_id preserved
voice_session_id may remain warm, settle, or end according to lifecycle
microphone/listening must follow M2.2 privacy invariants
finalized turn information MAY become eligible for persistence
```

### End Voice

```text
active Voice interaction/session ends
conversation_id preserved
voice_session_id may end
microphone capture stops
active listening stops
finalized/interrupted/failed turn information MAY become eligible for persistence
```

## Idempotency / Deduplication

Realtime systems may emit duplicate events due to:

```text
retry
reconnect
duplicate final transcript
duplicate assistant final
client refresh
runtime recovery
```

The contract requires stable IDs:

```text
conversation_id
turn_id
message_id
voice_session_id
```

Same logical `turn_id` submitted multiple times MUST NOT create duplicate logical turns.

Same logical `message_id` submitted multiple times MUST NOT create duplicate logical messages.

Retries or duplicate delivery of the same logical turn/message MUST NOT create duplicate durable conversation records.

A `voice_session_id` MUST belong to exactly one logical `conversation_id` for its lifetime.

One `conversation_id` MAY span multiple `voice_session_id` values.

M2.3 defines idempotency requirements; implementation defines the persistence mechanism.

M2.3 does not define database UPSERT mechanics.

## Privacy / Microphone Boundary

M2.3 inherits the M2.2 invariant:

```text
If AppMode != VOICE:
  microphone capture MUST be inactive
  VoicePresentationState MUST NOT be LISTENING
```

Conversation persistence must not require hidden microphone capture.

## Current vs Target State

### Current validated M1 state

```text
Electron V2 hosts existing HF Web Voice
HF Web Voice / S2S manages realtime Voice path
S2S owns active Voice runtime history
Voice Core unchanged
No unified Conversation Store implemented in V2
```

### Target M2/M3 state

```text
Text and Voice share logical conversation_id semantics
Conversation Store owns durable user-visible history
S2S owns active Voice runtime history
Julia Core owns identity/persona/long-term memory
Context Bridge provides bounded continuity without history duplication
```

This document defines the target contract. It does not claim the target is already implemented.

## Definition of Done for M2.3

M2.3 is PASS when:

```text
Conversation / Turn / Message / VoiceSession defined
conversation_id and voice_session_id clearly separated
durable history, S2S runtime history, and Julia memory ownership do not overlap
Text and Voice share target logical conversation semantics
Voice turns can be persisted without Voice Surface owning Store semantics
active S2S history replay from Store is forbidden
Text -> Voice continuity uses bounded Context Seed abstraction
Voice -> Text continuity uses durable history display semantics
barge-in / interrupted turn semantics defined
idempotency stable ID contract defined
Current vs Target ownership semantics defined
runtime identifier mapping boundary defined
Context Seed lifecycle does not permit continuous active-session reseeding
interrupted Voice messages do not imply full delivery to user
voice_session_id cardinality defined
no DB technology selected
no UI code written
no transport changes
no Voice Core changes
no legacy migration
```

## Follow-up Decisions

```text
M2.4 Minimal UI Shell Implementation
Conversation Coordinator design
Context Seed derivation algorithm
physical persistence backend
legacy conversation migration strategy
search/indexing strategy
Voice transcript finalization policy
Julia Core memory integration policy
```
