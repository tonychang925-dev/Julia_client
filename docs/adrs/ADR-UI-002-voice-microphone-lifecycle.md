# ADR-UI-002: Voice Microphone Lifecycle for Text / Voice Mode Switching

## Status

```text
Proposed
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

M2.2 Information Architecture
  commit: 5744cb3
  decision: Return to Text must stop microphone capture while preserving logical conversation

M2.3 Conversation Domain Contract
  commit: e3a6d24
  decision: Persistent conversation history is separate from realtime runtime history
```

## Context

M2.4 will introduce a local Julia Desktop shell with mutually exclusive Text and Voice surfaces.

The intended M2.4 shape is:

```text
BrowserWindow
└── Julia Local Shell
    ├── Text Surface
    └── Voice Surface
          └── existing HF Web Voice
```

M1 validated the existing HF Web Voice page directly inside Electron Chromium. M2.4 must preserve that validated realtime media path and must not introduce an Electron-owned audio pipeline.

ADR-UI-001 and M2.2 jointly require two properties during normal mode switching:

```text
Return to Text MUST release microphone capture.
Normal Text / Voice switching SHOULD preserve the validated realtime Voice session where technically supported.
```

A read-only lifecycle audit of the currently running Golden frontend found:

```text
Golden frontend path:
/root/julia_voice_v2/golden/frontend

Golden frontend commit:
17e7387577b1b2208c5bd2a246e44e6814a5f2a0

main.js sha256:
12234f68b52a15f714e28756aca2d77ef6249689cbed83dd29fb50249d8e52f1
```

The audit confirmed that the Golden frontend has:

```text
Mute:
  track.enabled = false
  client.setMuted(true)

Stop / teardown:
  client.close()
  MediaStreamTrack.stop()
```

It did not expose a verified lifecycle seam equivalent to:

```text
pauseMicCapture()
resumeMicCapture()
```

that stops microphone capture while preserving the active realtime S2S client/session.

Therefore, simply hiding or removing the Voice surface is not a valid microphone lifecycle mechanism. A hidden web surface can continue owning an active `getUserMedia()` stream unless the Voice runtime explicitly releases it.

## Decision

Julia Desktop adopts:

```text
Option 2D — Warm-session first via derived candidate
```

Meaning:

```text
Golden frontend
/root/julia_voice_v2/golden/frontend
@ 17e7387577...
🔒 never modified

        ↓ exact copy / clone

Derived lifecycle candidate
/root/julia_voice_v2/candidates/m2.4-lifecycle/frontend
🧪 lifecycle seam changes only
```

The Golden frontend remains the validated reference and rollback source. Any lifecycle experimentation must occur in an exact-derived candidate.

This decision defines the target lifecycle architecture. It does NOT assert that session-preserving microphone release is already technically proven on the current Golden-derived frontend.

M2.4-LC MUST prove that capability before M2.4-B may depend on it.

## Normative Requirements

### 1. Return to Text releases microphone capture

Returning from Voice Mode to Text Mode MUST release active microphone capture.

This means the implementation must ensure that active `MediaStreamTrack` objects used for microphone capture are stopped or otherwise no longer capturing.

Released microphone capture means, at minimum:

```text
microphone MediaStream audio tracks are stopped / ended
capture is not represented merely by track.enabled = false
the Voice Surface is not actively acquiring microphone audio
```

Exact internal object cleanup belongs to the M2.4-LC implementation proof.

### 2. Normal Return to Text preserves session where technically supported

Normal Return to Text MUST preserve the active realtime Voice session where technically supported by the Voice frontend/client architecture.

The intended behavior is:

```text
Voice active
  ↓
pause microphone capture
  ↓
keep realtime client/session alive
  ↓
hide Voice Surface
  ↓
show Text Surface
```

If this cannot be proven without invasive Voice changes, the architecture decision must be revisited rather than weakening the microphone privacy invariant.

### 3. Muting is not microphone release

Muting is NOT equivalent to releasing microphone capture.

The following is insufficient for Return to Text:

```text
track.enabled = false
client.setMuted(true)
```

Muted tracks may still keep the operating system microphone permission/capture indicator active and do not satisfy the M2.2 cross-mode invariant.

### 4. Hiding/removing a view is not microphone lifecycle

Hiding, detaching, resizing, or removing the Voice view MUST NOT be used as the mechanism for stopping microphone capture.

Presentation lifecycle and microphone lifecycle are separate.

### 5. Frozen Golden is immutable

The frozen Golden frontend MUST NOT be modified for M2.4 lifecycle experimentation.

Any candidate implementation MUST begin from an exact-derived copy/clone of the Golden frontend and must preserve enough provenance to compare against Golden.

### 6. Lifecycle seam must be explicit and narrow

The candidate lifecycle seam SHOULD expose semantics equivalent to:

```text
pauseMicCapture()
resumeMicCapture()
```

`pauseMicCapture()` SHOULD:

```text
mark lifecycle paused
mute client input first
stop microphone capture tracks
clear active microphone stream references
preserve realtime client/session when technically possible
```

`pauseMicCapture()` MUST NOT:

```text
close the realtime client merely because the UI is returning to Text
close the WebSocket merely because the UI is returning to Text
reset S2S short-term runtime history
reset the logical conversation
route PCM through Electron Main/IPC
```

`resumeMicCapture()` SHOULD:

```text
reacquire getUserMedia()
rebuild only microphone capture resources required for input
attach the new capture path to the existing realtime client/session where technically possible
restore explicit mute state correctly
resume sending user input
```

`resumeMicCapture()` MUST NOT:

```text
create a second realtime client accidentally
create a second S2S session accidentally
create duplicate microphone streams
create duplicate AudioContext / AudioWorklet input senders
reset S2S short-term runtime history
```

### 7. Electron may coordinate lifecycle control only

Electron may coordinate lifecycle control signals such as:

```text
show voice surface
hide voice surface
pause microphone capture
resume microphone capture
query voice lifecycle status
```

Electron MUST NOT own or transport:

```text
PCM
audio chunks
VAD media state
STT media buffers
TTS playback buffers
Voice media WebSocket payloads
```

Control IPC is allowed.

Media IPC is prohibited.

### 8. Candidate proof is required before M2.4-B

M2.4-B Minimal UI Shell MUST NOT depend on session-preserving Return to Text until a dedicated lifecycle seam proof passes.

The lifecycle proof belongs to M2.4-LC and must run before UI shell implementation relies on this behavior.

### 9. Failed proof returns to architecture decision

If session-preserving microphone release is proven impossible without invasive Voice changes, the project MUST return to architecture decision.

The fallback must be explicit. It must not silently weaken:

```text
If AppMode != VOICE:
  microphone capture MUST be inactive
```

## Required Transition Ordering

### Voice -> Text

The privacy transition must complete before the presentation transition.

Required order:

```text
Voice Mode active
  ↓
request pauseMicCapture()
  ↓
verify / receive PAUSED
  ↓
hide Voice Surface
  ↓
show Text Surface
```

If pause fails, Julia Desktop MUST NOT silently show Text while microphone capture remains active.

The implementation should either remain in Voice Mode, enter a user-visible recovery state, or explicitly end the Voice interaction/session.

### Text -> Voice

Text to Voice may use this order:

```text
Text Mode active
  ↓
show Voice Surface
  ↓
explicit user activation / resume
  ↓
getUserMedia()
  ↓
VoicePresentationState = LISTENING when capture is active
```

The view may be warm before microphone capture resumes.

Warm view does not imply active capture.

A warm Voice Surface MUST NOT reacquire microphone capture merely because it remains loaded, reconnects, becomes ready, or exists in memory.

Microphone reacquisition MUST follow an explicit transition into active Voice interaction initiated by the user.

## M2.4-LC Lifecycle Seam Proof

Before M2.4-B can depend on this decision, a derived lifecycle candidate must prove the following technical proposition:

```text
An active Voice session can stop microphone capture, keep the realtime client/session alive,
then reacquire microphone capture and continue the same realtime conversation without media duplication.
```

Minimum proof sequence:

```text
Voice session #1
  ↓
normal conversation works
  ↓
pauseMicCapture()
  ↓
MediaStream tracks stopped
OS mic indicator off
WebSocket/client remains alive
S2S session identity unchanged where observable
  ↓
wait 5-10 seconds
  ↓
resumeMicCapture()
  ↓
new getUserMedia stream
capture path attached to same realtime client/session where technically possible
  ↓
continue conversation
```

Minimum acceptance checks:

```text
PAUSE
  every microphone MediaStreamTrack readyState == ended
  no active microphone capture remains
  OS microphone indicator disappears
  realtime client is not closed
  WebSocket is not recreated unless explicitly documented as unavoidable
  S2S session identity remains unchanged where observable

RESUME
  exactly one new microphone stream
  no duplicate AudioContext / AudioWorklet input path
  no duplicate audio append/input sender
  same realtime session where technically possible
  STT works
  assistant answers
  barge-in works
  second pause/resume works
```

Minimum stress check:

```text
pause/resume x 5
```

Regression symptoms that fail the proof:

```text
duplicate microphone stream
duplicate AudioWorklet
double audio append
echo/self-input
lost VAD
WebSocket reconnect not explicitly accepted
stale track reference
barge-in regression
assistant response missing
TTS regression
```

## Alternatives Considered

### Option 1 — Privacy first: Return to Text ends active Voice runtime

Rejected for M2.4 as the default target because it satisfies microphone privacy but breaks the ADR-UI-001 session-continuity requirement for normal mode switching.

It remains a possible explicit fallback only if M2.4-LC proves that session-preserving mic release is not technically viable without invasive Voice changes.

### Option 2 — Modify Golden directly

Rejected.

The Golden frontend is the validated reference and must remain immutable.

### Option 2D — Derived lifecycle candidate

Accepted.

This preserves Golden while allowing a narrow proof of the missing lifecycle seam.

### Option 3 — Hide + mute only

Rejected.

It preserves apparent session continuity but violates the microphone privacy invariant because muting is not equivalent to releasing capture.

## Consequences

Positive:

```text
protects M1 Golden rollback point
preserves privacy invariant
preserves target session-continuity invariant where technically possible
keeps Electron out of PCM/audio transport
creates a narrow proof gate before UI code depends on lifecycle behavior
```

Trade-offs:

```text
M2.4-B UI shell remains blocked until M2.4-LC proof completes
candidate frontend lifecycle may require careful input-path reattachment
full Voice regression is required after candidate seam changes
session-preserving pause/resume may prove technically infeasible without revisiting architecture
```

## Non-Goals

ADR-UI-002 does not define:

```text
Julia_client UI implementation
WebContentsView implementation details
Conversation Store schema
Text transport
legacy feature migration
S2S protocol changes
VAD/STT/TTS changes
Julia Brain changes
Avatar implementation
latency optimization
production deployment strategy
```

ADR-UI-002 does not authorize:

```text
modifying /root/julia_voice_v2/golden/frontend
routing PCM/audio through Electron Main/IPC
hiding a still-capturing Voice page behind Text UI
weakening the AppMode != VOICE microphone invariant
```

## Follow-up Decisions

```text
M2.4-LC  Derived lifecycle seam proof
M2.4-B   Minimal UI Shell implementation after lifecycle proof
M2.5     Full Voice regression after lifecycle candidate integration
```
