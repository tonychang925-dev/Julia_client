# CLIENT-C2A — gen-2 Voice Contract Reconciliation Task

STATUS: READY FOR LOCAL EXECUTION
DATE: 2026-09-07
RUNTIME CHANGE AUTHORIZED: NO

## Objective

Reconcile Julia_client documentation/tests to the proven current gen-2 Voice conversation contract without changing the working runtime path.

## Frozen authority

Current runtime path:

```text
Electron workspace.bootstrap {conversationId, baseLastMessageId, messages[]}
→ S2S strips copied history from semantic authority
→ bindCanonicalConversation(conversationId)
→ realtime session metadata.conversation_id
→ per-turn Brain request {conversation_id, voice_trace_id, turn_id}
→ Brain/Core ConversationRuntime canonical commit
→ Electron live-message display only
→ Electron debounced Core sync
```

`julia.voice.host.attach` is NOT the current Electron protocol. It is a future gen-3 migration candidate.

## Do not change

Do not modify:

- `src/renderer/shell/app.js`
- S2S runtime
- Brain/Core runtime
- Voice persistence behavior
- Research Desk
- Diary/CSP/security side quests

Do not remove `messages[]` from bootstrap in this task. It is redundant transport debt, but runtime cleanup requires a separate compatibility-qualified change.

## Required changes

### 1. Fix stale Client tests

Locate tests that assert current Electron must send:

```text
julia.voice.conversation.bind
```

or assert that the current runtime must not use `workspace.bootstrap`.

Replace those assertions with current-gen-2 characterization assertions:

- Electron current Voice bind entry uses `julia.voice.workspace.bootstrap`.
- payload includes canonical `conversationId`.
- copied `messages[]` / `baseLastMessageId` are transport fields only and must not be described as canonical authority.
- `commitExternalTurns` is not a current persistence authority.

Do not write a test that requires copied history to affect S2S behavior; cross-repo evidence proves S2S strips it.

### 2. Preserve stale-vs-current distinction

Historical tests/fixtures may retain old protocol evidence only if clearly labelled historical/non-authoritative.

Current acceptance tests must not mix gen-2 and gen-3 message names as though they are one protocol.

### 3. Static contract checks

Prove:

- renderer contains current `julia.voice.workspace.bootstrap` path
- renderer does not claim realtime `live-message` cache is canonical
- Client canonical sync remains Core-readback projection refresh
- `commitExternalTurns` remains fail-closed/deprecated and is not exercised by the current real loop

### 4. Pure test gate

Run the Client pure/unit suite relevant to:

- conversation authority
- Voice lifecycle
- Voice bootstrap
- Core projection sync

No live E2E is required for this documentation/test reconciliation task.

## Failure rules

If changing tests exposes a genuine runtime contradiction with the frozen cross-repo contract, stop and report the exact first-bad boundary.

Do not modify runtime merely to make tests green.

Do not reinterpret `host.attach` as current authority unless a new coordinated Electron+S2S migration is explicitly authorized.

## Completion report

Report:

```text
CLIENT_C2A_GEN2_RECONCILIATION = PASS | FAIL | NOT_PROVEN
RUNTIME_CHANGED = NO
CURRENT_GEN2_TESTS = <pass/fail counts>
STALE_DIRECT_BIND_ASSERTIONS = 0 current-authority assertions
GEN3_HOST_ATTACH_CLASSIFICATION = MIGRATION_CANDIDATE
CORE_CANONICAL_AUTHORITY = PRESERVED
```

If PASS, C2A documentation/test drift is closed and the next step is real Client continuity E2E on the existing gen-2 runtime.
