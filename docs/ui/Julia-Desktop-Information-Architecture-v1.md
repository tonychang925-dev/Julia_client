# Julia Desktop Information Architecture v1

## Status

```text
Draft / M2.2
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
  decision: Mutually Exclusive Text / Voice Interaction Surfaces
```

## Purpose

M2.2 defines how Julia Desktop is organized at the information architecture level.

It answers:

```text
what surfaces exist
what each surface contains
how Text and Voice modes are entered/exited
which UI states are presented
how lifecycle behaves from a user perspective
how common failures are presented
```

It does not implement UI code.

It does not define the Conversation Store schema.

It does not modify Voice Core or the frozen HF Web Voice path.

## Core Principle

```text
One Julia
One logical conversation target
Two mutually exclusive surfaces
```

Text Surface and Voice Surface are presentation surfaces. Neither surface owns Julia identity, memory, or the future Conversation Domain.

## Top-Level IA

```text
Julia Electron V2
│
├── App Shell
│   ├── window chrome
│   ├── mode navigation
│   ├── global Julia status
│   └── settings entry
│
├── Text Surface
│   ├── conversation sidebar
│   ├── conversation thread
│   ├── composer
│   └── text-mode actions
│
├── Voice Surface
│   ├── Julia presence
│   ├── state indicator
│   ├── waveform / ambient visualization
│   ├── mic control
│   ├── end / return-to-text
│   └── avatar slot (future)
│
└── Conversation Domain
    └── future M2.3 contract
```

The Conversation Domain is intentionally shown outside Text Surface and Voice Surface:

```text
                  Conversation Domain
                          ▲
                  future M2.3 contract
                          │
             ┌────────────┴────────────┐
             │                         │
       Text Surface               Voice Surface
```

Text UI does not own conversation data.
Voice UI does not own conversation data.
Both will eventually present or emit conversation-relevant turn information through the M2.3 contract.

Voice Surface:

```text
MAY produce conversation-relevant turn information
MUST NOT own Conversation Store persistence semantics
MUST NOT define synchronization between Voice history and the shared conversation
```

Persistence, synchronization, and conversation ownership are defined in M2.3.

## App Shell

App Shell is the persistent desktop frame around the active surface.

Responsibilities:

```text
window chrome / title area
mode navigation entry points
global Julia availability/status
settings entry point
surface host layout
```

App Shell must not own:

```text
PCM capture
PCM forwarding
VAD/STT/TTS
Voice media WebSocket proxy
Conversation Store schema
Julia Brain memory policy
```

## App Mode State

App mode is a presentation-level state:

```text
AppMode = TEXT | VOICE
```

`AppMode` controls which surface is visible.

`AppMode` does not directly define:

```text
microphone capture state
Voice runtime state
Conversation Store state
Julia Brain state
S2S short-term history state
```

A hidden Voice Surface may remain warm, but hidden does not imply active microphone capture.

Cross-mode invariant:

```text
If AppMode != VOICE:
  microphone capture MUST be inactive
  VoicePresentationState MUST NOT be LISTENING
```

`READY`, `RECONNECTING`, or other non-listening runtime states may remain possible depending on later lifecycle implementation.

## Voice Presentation State

Voice presentation state is separate from app mode.

Minimum states:

```text
READY
LISTENING
THINKING
SPEAKING
RECONNECTING
ERROR
```

Meanings:

```text
READY         Voice surface is available; user may start or resume speaking.
LISTENING     Julia is listening for user speech.
THINKING      Julia / backend is processing a completed user turn.
SPEAKING      Julia is speaking.
RECONNECTING  Voice surface is attempting to recover connectivity.
ERROR         Voice interaction is blocked until user action or recovery succeeds.
```

Engineering internals must not be shown as normal Voice states:

```text
VAD active
STT running
LLM streaming
TTS generation
WebSocket 1006
getUserMedia NotAllowedError
```

Those belong to Diagnostics.

## Text Surface

Text Surface is conversation-oriented.

### Text Surface hierarchy

```text
Text Surface
├── Conversation Sidebar
│   ├── New Chat
│   ├── Search entry
│   ├── Recent conversations
│   └── collapsed state for narrow widths
│
├── Conversation Thread
│   ├── user messages
│   ├── Julia messages
│   ├── future voice-history blocks
│   ├── markdown/code rendering
│   └── streaming text placeholder
│
├── Composer
│   ├── text input
│   ├── submit action
│   ├── voice entry action
│   └── future attachments/files
│
└── Text-mode Actions
    ├── copy/export future
    ├── rename/archive/delete future
    └── diagnostics entry future
```

### Text Surface first implementation scope

Visible in IA does not mean implemented in first iteration.

M2.4 first implementation may include only:

```text
sidebar placeholder
conversation thread placeholder
composer placeholder
voice entry
mode switch behavior
```

Deferred:

```text
search
files
complex markdown actions
settings
legacy persistence
conversation rename/archive/delete
full conversation history migration
```

## Voice Surface

Voice Surface is presence-oriented and immersive.

### Voice Surface hierarchy

```text
Voice Surface
├── Top Navigation
│   ├── return to Text
│   └── Julia status / presence
│
├── Julia Presence Area
│   ├── Julia name / identity
│   ├── central presence marker
│   ├── avatar slot future
│   └── ambient background future
│
├── Voice State Area
│   ├── READY / LISTENING / THINKING / SPEAKING / RECONNECTING / ERROR
│   └── short human-readable state text
│
├── Voice Activity Visualization
│   ├── waveform or ambient visualization
│   └── no transcript
│
└── Voice Controls
    ├── mute / unmute
    ├── end active voice interaction
    └── diagnostics entry future
```

Voice Surface must not show:

```text
conversation sidebar
text composer
live transcript
chat timeline
history/search panel
raw engineering state by default
```

## Mode Navigation

### Text -> Voice

Primary entry:

```text
Text composer microphone action
```

Secondary future entries may include:

```text
global shortcut
App Shell mode control
tray action
```

Transition semantics:

```text
leave Text presentation
show Voice presentation
preserve Julia identity
preserve logical conversation target
preserve validated Voice path
do not route PCM through Electron Main/IPC
do not reload Voice Surface during normal switching
```

Illustrative wireframe:

```text
TEXT MODE
┌──────────────────────────────────────────────┐
│ Julia                                   ●    │
│                                              │
│ [history]           conversation             │
│                                              │
│                                              │
│          Message Julia...          🎙  ↑    │
└──────────────────────────────────────────────┘
                                     │
                                     ▼
                                click microphone
```

### Voice -> Text

Primary entry:

```text
return to Text / keyboard / back action
```

Transition semantics:

```text
leave immersive presentation
restore Text presentation
preserve logical conversation target
do not require transcript to have been visible
do not necessarily end the Voice runtime session
do not require Voice Surface teardown under normal operation
```

Illustrative wireframe:

```text
VOICE MODE
┌──────────────────────────────────────────────┐
│ ← Text                                 Julia │
│                                              │
│                                              │
│                    ◉                         │
│                                              │
│                Listening...                  │
│                                              │
│               ~~~~~~~~~~~                    │
│                                              │
│          Mute                    End         │
└──────────────────────────────────────────────┘
```

## Return to Text vs End Voice

`Return to Text` and `End Voice` are distinct actions.

### Return to Text

Means:

```text
AppMode MUST transition to TEXT
microphone capture MUST stop
active listening MUST stop
the Voice Surface MAY remain warm/hidden
the logical conversation MUST be preserved
returning to Text MUST NOT require Voice Surface reload or destruction
```

Does not necessarily mean:

```text
destroy Voice Surface
terminate recoverable Voice runtime resources
clear conversation target
```

### End Voice

Means:

```text
explicitly ends the active Voice interaction/session
microphone capture MUST stop
active listening MUST stop
active voice playback / response MUST terminate as appropriate
the logical conversation MUST be preserved
the default destination is Text Mode unless a future UX decision explicitly defines otherwise
```

Exact runtime behavior belongs to M2.4 implementation and must respect the frozen Voice path.

## Surface Lifecycle

Mode switching should preserve the validated realtime voice session under normal operation.

Preferred behavior:

```text
App startup
  -> prepare App Shell
  -> Text Surface available
  -> Voice Surface may be warmed/loaded when appropriate

Text Mode
  -> Text Surface visible
  -> Voice Surface hidden or inactive presentation

Voice Mode
  -> Voice Surface visible
  -> Text Surface hidden
```

Normal mode switching should prefer:

```text
show/hide
```

over:

```text
destroy/recreate/reload
```

Reload/recreate is reserved for:

```text
explicit recovery
shutdown
unrecoverable voice-session failure
```

Implementation must still preserve this privacy invariant:

```text
hidden/warm Voice Surface != active microphone capture
```

## Failure / Recovery Presentation

User-facing failures should be presented in product language, not raw engineering errors.

### Mic denied

User-facing:

```text
Microphone access is needed for Voice.
```

Diagnostics may include:

```text
getUserMedia NotAllowedError
macOS permission state
Electron permission handler result
```

### S2S disconnected

User-facing:

```text
Reconnecting…
```

Diagnostics may include:

```text
WebSocket close code
network error
S2S health result
```

### Julia Brain unavailable

User-facing:

```text
Julia is temporarily unavailable.
```

Diagnostics may include:

```text
Brain endpoint status
HTTP error
streaming provider error
```

### TTS / audio failure

User-facing:

```text
Julia had trouble speaking. Try again.
```

Diagnostics may include:

```text
TTS error
audio decode/playback error
AudioContext state
```

### Recovery principles

```text
prefer reconnect/retry UI over media pipeline rewrite
never add Electron Main/IPC media path as a recovery shortcut
keep raw errors in Diagnostics
```

## Responsive / Layout Rules

Desktop-first minimum rules:

```text
>= 1000px
  Text Mode: sidebar + conversation thread

< 1000px
  Text Mode: sidebar may collapse

Voice Mode
  always single immersive surface
```

Voice Mode should not split into multiple columns.

## Diagnostics Boundary

Diagnostics may expose raw technical state, but Diagnostics is not part of normal Text or Voice presentation.

Diagnostics may include:

```text
WebSocket state
AudioContext state
AudioWorklet load status
mic permission details
S2S health
Julia Brain health
TTS health
last error payload
```

Diagnostics must not become a reason to move media ownership into Electron Main/IPC.

## Definition of Done for M2.2

M2.2 is PASS when:

```text
Text Surface hierarchy defined
Voice Surface hierarchy defined
mode navigation defined
Text -> Voice transition defined
Voice -> Text transition defined
End Voice semantics defined
warm/hidden lifecycle semantics defined
microphone lifecycle separated
Voice state presentation defined
failure presentation defined
responsive behavior minimally defined
no Conversation Store schema invented
no transport changes
no Voice Core changes
no UI implementation
```

## Explicit Non-Goals

M2.2 does not define or implement:

```text
Conversation Store schema
message_id / turn_id contract
voice transcript persistence mechanism
legacy data migration
search implementation
settings implementation
avatar implementation
visual styling system
component code
Electron Main media changes
Voice Core changes
```

These belong to later phases:

```text
M2.3 Conversation Domain Contract
M2.4 Minimal UI Shell Implementation
M3 Legacy Feature Migration
```
