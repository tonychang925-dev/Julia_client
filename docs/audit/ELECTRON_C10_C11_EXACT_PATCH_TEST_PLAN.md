# Electron C-10/C-11 Exact Patch and Test Plan

**Date:** 2026-08-10
**Contracts:** C-10 `2d99293`, C-11 `29b2198`
**Mode:** Deterministic implementation plan; no production patch in this block

## Block E1 — Optimistic projection state (Codex)

### Target files/functions

```text
src/main/conversation-store.js
  addMessage()
  normalize/reconcile cache records

src/renderer/shell/app.js
  sendComposerMessage()
  appendMessage()
  renderConversationMessages()

tests/client-c1.test.js
```

### Before

```text
local user render/store
→ status defaults completed
→ Core may still reject/fail
```

### After authority semantics

```text
LOCAL_PENDING
→ Core processing/accepted
→ canonical GET/reconcile
→ CANONICAL_COMPLETED or FAILED
```

No local state may assign canonical `message_id` or canonical completion. Canonical reconcile replaces/correlates presentation records by accepted turn/role identity.

### Tests

1. Optimistic user record is not canonical completed before Core response.
2. Core failure leaves an explicit failed/local projection, not completed history.
3. Successful canonical GET replaces projection identity/status.
4. Restart does not promote pending projection to canonical truth.
5. No history/context is submitted during retry/reconcile.

### Rollback

One Electron feature-block commit; revert restores current UI cache behavior without Core/Brain changes.

## Block E2 — Canonical interrupted rendering (Codex)

### Target files/functions

```text
src/main/text-client.js
  getConversationMessages()

src/main/conversation-store.js
  reconcileCanonicalMessages()

src/renderer/shell/app.js
  renderConversationMessages()
  appendMessage()

src/renderer/shell/styles.css
tests/client-c1.test.js
```

### Acceptance policy

```text
user message       → completed only
assistant message  → completed OR interrupted with non-empty canonical content
pending/failed     → not rendered as normal canonical transcript
```

Electron preserves Core `message_id`, `turn_id`, modality, `created_at`, and status. Interrupted content is styled/labeled but never trimmed or recomputed by Electron.

### Tests

1. Canonical assistant/interrupted survives GET filter.
2. Reconcile preserves `status=interrupted`.
3. Renderer displays emitted canonical content with interrupted indicator.
4. Interrupted does not become completed after restart/reconcile.
5. Empty/failed assistant remains excluded from normal transcript.

### Rollback

Same Electron feature-block commit as E1 or a separate coherent compliance commit; no Voice/Core rollback needed.

## Block E3 — Versioned event/reconnect protocol (Codex + Claude contract implementation dependency)

### Electron targets

```text
src/main/text-client.js
src/main/main.js
src/preload/index.js
src/renderer/shell/app.js
tests/client-c1.test.js
```

### Required server DTO before implementation

```text
protocol_version
event_id
sequence
generation_id
canonical_ref
correlation_id
supported/minimum version behavior
```

### Tests

- duplicate event ignored;
- missing/out-of-order sequence triggers canonical reconcile;
- disconnect does not locally cancel/delete turn;
- same command retry does not duplicate turn;
- incompatible protocol fails explicitly;
- canonical GET recovers after delta loss.

### Status

```text
BLOCKED BY Brain/Gateway production DTO implementation.
Electron must not fabricate Core event metadata.
```

## Block E4 — Disposable cache / canonical discovery (Codex + Claude API dependency)

### Goal

Delete/relocate Electron cache, then recover conversation list/current conversation from Core APIs without uploading local history.

### Targets

```text
src/main/text-client.js       canonical list/detail client
src/main/main.js              list/current IPC implementation
src/main/conversation-store.js presentation cache only
src/renderer/shell/app.js     startup/history discovery
tests/client-c1.test.js
```

### Status

Implementation waits for confirmed Core/Brain list/current/search lifecycle APIs under C-10 production convergence.

## Voice-owner blocks — not Codex patches

### V1 Emitted-content accounting

Correlate `response_id` with TTS transcript segments, audio chunks and played-frame acknowledgements. At barge-in, produce the actually emitted semantic prefix and interruption boundary. Do not infer this in Electron.

### V2 Tool normalization

Replace browser-direct web/camera execution with C-08 CapabilityRequest → authorization/execution/evidence → Context OS → continuation.

### V3 Context/Alignment convergence

Retire local Voice Persona/tool hints and last-10-turn bootstrap as final architecture. Consume Core-governed Context OS/Alignment output for Voice.

## Recommended Electron implementation order

```text
E1 Optimistic projection state
  +
E2 Interrupted canonical rendering
        ↓ one targeted compliance feature block
targeted unit tests
runtime Text regression
runtime Voice→Text reconcile regression
scope review
exact stage/commit

E3/E4 wait for matching Brain/Gateway production APIs.
```

## Release regression

```text
Text success/failure/stream/reconnect
Voice completed/interrupted/user-only turns
Text→Voice→Text same conversation
barge-in canonical status
cache deletion recovery
protocol mismatch
duplicate/out-of-order events
fatal error = 0
Electron PCM/media ownership = 0
```

## Code-unlock assessment

```text
C-10 frozen                         YES
C-11 frozen                         YES
C-10 impact review                  PASS
C-11 impact review                  PASS
E1/E2 exact plan                    READY
E3/E4 server dependency             BLOCKED
Voice-owner compliance work         OUTSIDE CODEX SCOPE
```

E1/E2 are ready for explicit Electron production implementation GO. This planning document does not itself authorize or apply the patch.
