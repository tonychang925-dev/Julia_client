# ADR-UI-001: Mutually Exclusive Text / Voice Interaction Surfaces

## Status

```text
Proposed
```

## Date

```text
2026-08-08
```

## Context

Julia Electron V2 Voice Shell V1 has been validated and frozen at:

```text
tag: julia-electron-v2-voice-shell-v1
commit: 8fa1f369450c934728e4a310c53ac5cbe3cdaaed
```

M1 proved that Electron Chromium can host the existing HF Web Voice surface without changing Voice Core or adding a new Electron media stack.

M2 now needs to define the desktop interaction architecture before migrating legacy `julia_electron` features such as conversation persistence, history, search, settings, and desktop integrations.

The central product and architecture question is how Text interaction and Voice interaction should coexist in Julia Desktop without reintroducing media-path coupling or confusing conversation ownership.

## Decision

Julia Desktop adopts mutually exclusive interaction surfaces:

```text
One Julia
One Conversation
Two Mutually Exclusive Surfaces
```

Core principle:

```text
Unified conversation does not require unified presentation.
```

Text and Voice share identity and target conversation semantics, but they do not share visible UI or realtime transport implementation.

## Target Conversation Invariant

Text and Voice surfaces belong to the same logical Julia conversation and MUST converge on the same `conversation_id` semantics.

This is a target contract for M2/M3, not a claim that the frozen M1 Voice Shell already implements a unified Conversation Store.

ADR-UI-001 does not define:

```text
Conversation Store schema
history ownership migration
Text/Voice synchronization mechanism
S2S short-term history replacement
Julia Brain memory integration changes
```

Those belong to M2.3 Conversation Domain Contract and later migration work.

## Text Surface

Text Mode is conversation-oriented.

It may include:

```text
conversation sidebar
history/search
markdown rendering
code blocks
files
text composer
text streaming UI
```

Text Mode should feel close to a modern ChatGPT-like conversation workspace, while remaining Julia-specific in domain ownership and persistence semantics.

## Voice Surface

Voice Mode is presence-oriented and immersive.

It should include only minimal voice-state presentation, such as:

```text
Julia
Listening / Thinking / Speaking
waveform or equivalent voice activity display
mic / mute
end / return to text
avatar-ready central canvas
```

Voice Mode must not show:

```text
conversation sidebar
chat timeline
transcript UI
history/search panels
engineering diagnostics by default
```

Diagnostics, if needed, belong behind a separate diagnostic surface and must not become the normal Voice Mode presentation.

## Shared Semantics

Text Surface and Voice Surface share target semantics for:

```text
Julia identity
conversation_id
message / turn identity
memory ownership
persistence semantics
```

A single logical conversation may contain both text and voice turns:

```text
Conversation
├── Text Turn
├── Text Turn
├── Voice Turn
├── Voice Turn
└── Text Turn
```

## Separate Responsibilities

Text Surface and Voice Surface keep separate:

```text
visible presentation
renderer surface
transport
realtime lifecycle
audio/media pipeline
```

Text transport must not be forced to become Voice transport.
Voice transport must not be rewritten to satisfy Text UI implementation preferences.

## Voice Transcript Policy

Voice Mode MUST NOT display the live conversation transcript.

Voice turns MAY produce transcript data internally.

Validated voice turns MUST be eligible for persistence into the shared Conversation Store once that store exists.

When returning to Text Mode, persisted voice turns MAY appear in conversation history.

Transcript persistence MUST NOT alter the frozen realtime media path.

The product invariant is:

```text
hidden during Voice Mode != discarded from conversation history
```

Example future persistence shape:

```text
Message {
  role: "user" | "assistant"
  modality: "voice"
  content: "final transcript or final assistant text"
  metadata: {...}
}
```

Example future Text/History display:

```text
Voice conversation · 19:32
Tony   ...
Julia  ...
```

## Mode Transition Invariants

### Text -> Voice

Mode switching from Text to Voice:

```text
does not create a new Julia identity
does not implicitly create a new logical conversation
does not reload/recreate Voice Surface during normal switching
does not route PCM through Electron Main/IPC
does not modify the frozen Voice Core path
```

### Voice -> Text

Mode switching from Voice to Text:

```text
does not destroy the logical conversation
does not require Voice transcript to have been visible during Voice Mode
restores the same logical conversation context
does not require Voice Surface teardown under normal operation
```

## Voice Session Lifecycle Constraint

Mode switching MUST preserve the validated realtime voice session under normal operation.

The implementation SHOULD prefer show/hide over reload/recreate.

Reload/recreate is allowed only for explicit recovery, shutdown, or unrecoverable voice-session failure.

This ADR does not require a specific embedding implementation such as `WebContentsView`; that belongs to M2.2/M2.4.

The goal is to protect realtime continuity and avoid unnecessary churn in:

```text
WebSocket
AudioContext
AudioWorklet
mic permission state
S2S runtime/session state
```

## Microphone Lifecycle Constraint

View lifecycle is not microphone/listening lifecycle.

A warm or hidden Voice Surface MUST NOT imply that microphone capture remains active.

Voice session listening state must remain governed by Voice runtime semantics and explicit user controls, not merely by whether the view exists in memory.

This is required for privacy, macOS microphone indicator correctness, and user expectation alignment.

## Media Boundary Constraint

Electron Main Process and IPC must not own realtime media transport.

Forbidden in M2 UI architecture:

```text
Electron Main PCM capture
IPC PCM forwarding
Node audio player
Electron WebSocket media proxy
custom VAD/STT/TTS client logic
ScriptProcessor fallback
manual playback scheduler
```

The frozen HF Voice path remains direct to S2S:

```text
Voice Surface / HF Web Voice
  -> direct WebSocket/media path
  -> S2S
```

## Conversation Domain Direction

Before legacy migration, the conversation domain should support modality explicitly.

A possible future direction is:

```text
Message {
  id
  conversation_id
  turn_id?
  role
  content
  modality: "text" | "voice"
  created_at
  metadata
}
```

Initial modality scope:

```text
text
voice
```

Future modality expansion may include image, file, or tool events.

This ADR does not freeze the schema; it only records the modality requirement for M2.3.

## Alternatives Considered

### Alternative A: Text and Voice simultaneously visible

Rejected.

Reason:

```text
It crowds the interface, divides attention, weakens immersive voice interaction, and encourages the two surfaces to leak presentation concerns into each other.
```

### Alternative B: Voice as a small panel inside Text Mode

Rejected for baseline architecture.

Reason:

```text
It frames Voice as a tool widget instead of an interaction surface and leaves insufficient room for future avatar / presence UI.
```

### Alternative C: Separate Text Julia and Voice Julia sessions

Rejected.

Reason:

```text
It fragments user mental model, Julia continuity, conversation continuity, and persistence semantics.
```

### Alternative D: Reload Voice page on every mode switch

Rejected for normal switching.

Reason:

```text
It risks WebSocket, AudioContext, AudioWorklet, microphone permission, and S2S session churn.
```

Reload/recreate remains acceptable for explicit recovery, shutdown, or unrecoverable voice-session failure.

### Alternative E: Single unified transport for Text and Voice

Rejected for M2.

Reason:

```text
It risks pulling Voice back into Electron/client-owned transport decisions and undermines the validated HF Web Voice baseline.
```

## Consequences

Positive:

```text
clear user mental model
focused Text and Voice experiences
preserves validated Voice Shell baseline
supports immersive voice and future avatar
keeps conversation persistence logically unified
reduces risk of media regression during UI work
provides clean rollback comparison against voice-shell-v1
```

Tradeoffs:

```text
mode switching requires lifecycle management
Text and Voice surfaces need an explicit conversation synchronization contract later
Voice transcript persistence must be designed carefully to avoid showing transcript during Voice Mode
warm/hidden Voice Surface requires explicit microphone/listening controls
Text and Voice transports remain independently testable instead of being collapsed into one transport
```

## Non-Goals

ADR-UI-001 does not define or implement:

```text
Text transport implementation
Conversation Store schema
database technology
message/turn schema
WebContentsView vs alternative embedding implementation
visual styling details
Text UI code
Voice UI replacement
conversation persistence
search/history migration
settings migration
avatar implementation
legacy migration
Voice Core changes
VAD/STT/TTS changes
local LLM replacement
latency optimization
```

## Follow-up Decisions

```text
M2.2 Information Architecture
M2.3 Conversation Domain Contract
M2.4 Minimal Shell Implementation
M2.5 Voice regression against julia-electron-v2-voice-shell-v1
```

## Validation Plan

After minimal UI shell implementation, run voice regression against the frozen baseline:

```text
checkout/reference: julia-electron-v2-voice-shell-v1
then current M2 implementation
```

Minimum required regression:

```text
E1 5-turn smoke
barge-in check
no obvious STT/TTS regression
no Electron Main/IPC media path introduced
```

If Voice regression appears, compare against:

```text
git checkout julia-electron-v2-voice-shell-v1
```

## Final Statement

```text
Julia Desktop presents Text and Voice as mutually exclusive surfaces over one Julia and one logical conversation.
The conversation is unified; the presentation is not.
```
