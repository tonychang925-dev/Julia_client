# CLIENT-C2A — Voice Authority Cutover Execution Card

## Mode

Automatic execution. Do not ask Tony for micro-step approvals.

## Frozen authority decision

Do not reopen architecture discovery unless runtime evidence contradicts the frozen contract.

Canonical Voice semantic path:

```text
Electron canonical conversation_id
→ julia.voice.host.attach / matching positive bind ACK
→ S2S session metadata
→ Brain /v1/chat/completions
→ Core ConversationRuntime
→ canonical persistence
```

Electron owns no Voice semantic history and performs no external-turn commit.

## Repository / branch

Repository: `tonychang925-dev/Julia_client`

Work only on:

```text
client-c2a-voice-authority-cutover
```

Do not mutate `glm-d/julia-client-c1-transport-hardening` or `main`.

## Phase 1 — apply frozen runtime cutover

From the branch root:

```bash
git status --short
git rev-parse HEAD
git apply --check docs/project_control/CLIENT_C2A_RUNTIME_CUTOVER.patch
git apply docs/project_control/CLIENT_C2A_RUNTIME_CUTOVER.patch
```

If `git apply --check` fails, STOP and report the exact first conflicting hunk. Do not hand-edit around the conflict until the mismatch is diagnosed.

The patch must change only:

- `src/renderer/shell/app.js`
- the two stale assertions in `tests/client-c1.test.js`

Governance/docs/test characterization files are already committed on this branch.

## Required runtime result

### Voice bind

`bindVoiceConversation()` must:

- retain Core existence/projection sync;
- send `julia.voice.host.attach`;
- send `protocol: 'julia-electron-v2'`;
- send canonical `conversationId`;
- send no `messages[]`, `history`, `external_history`, or `baseLastMessageId`;
- wait for ACK;
- require `ack.ok === true`;
- require ACK conversation identity equals the requested conversation;
- assign `boundVoiceConversationId` only after successful validation;
- retain VOICE-WS-LIFECYCLE-001 bounded 1008 handoff behavior.

### Voice persistence

`flushVoiceWorkspace()` is retained as a transitional function name only. It must be projection refresh, not persistence authority:

```text
bound conversation
→ syncCanonicalConversation(Core)
→ local disposable projection refresh
```

It must not call:

- `julia.voice.workspace.flush`
- `julia.voice.workspace.committed`
- `textClient.commitExternalTurns`

Do not delete the fail-closed `commitExternalTurns` fence in C2A; removal belongs to later exposure cleanup after caller absence is proven.

## Phase 2 — static first-bad-boundary checks

Required:

```bash
grep -n "julia.voice.host.attach" src/renderer/shell/app.js
grep -n "protocol: 'julia-electron-v2'" src/renderer/shell/app.js
```

The canonical bind function must have zero hits for copied history / workspace bootstrap.

The renderer must have zero semantic external-turn commit call sites:

```bash
! grep -R "textClient\.commitExternalTurns[[:space:]]*(" src/renderer
```

Do not classify the definition/fail-closed fence in `src/main/text-client.js` as a renderer call site.

## Phase 3 — tests

Do NOT run `ec_acceptance.test.js` yet. It requires a live Brain and mutates external state.

Run the pure test set:

```bash
node --test \
  tests/at10-ia.test.js \
  tests/client-c1.test.js \
  tests/client-c1-env-presence.test.js \
  tests/client-c1-fetch-authority.test.js \
  tests/client-c1-redirect.test.js \
  tests/client-c1-transport.test.js \
  tests/diary-ui.test.js \
  tests/client-c2a-voice-authority.test.js
```

Expected relative to the audited baseline:

```text
previous: 73 pass / 2 stale-assertion fail
new C2A characterization: +6
expected after cutover: 81 pass / 0 fail
```

If any test fails, use the automatic insertion walker and stop at the first exact bad boundary. Do not modify unrelated tests to get green.

## Phase 4 — source diff gate

Required:

```bash
git diff --check
git diff -- src/renderer/shell/app.js tests/client-c1.test.js
```

Reject if the runtime diff includes unrelated UI, Diary, CSP, Brain endpoint, Research Desk, or security sidequests.

## Phase 5 — commit

Only after all gates pass:

```bash
git add src/renderer/shell/app.js tests/client-c1.test.js
git commit -m "fix(client): cut Voice authority to Phase 5 Core persistence"
```

Do not merge the Draft PR yet.

## Phase 6 — qualification report

Return:

```text
TASK: CLIENT-C2A VOICE AUTHORITY CUTOVER

AUTHORITY_DECISION: PROVEN
RUNTIME_PATCH: PASS / FAIL

VOICE_BIND_PROTOCOL: julia.voice.host.attach
VOICE_BIND_ID_ONLY: YES / NO
BIND_ACK_REQUIRED: YES / NO
BIND_IDENTITY_MATCH_REQUIRED: YES / NO
BOUND_BEFORE_ACK_REACHABLE: NO / YES

WORKSPACE_HISTORY_SNAPSHOT: 0 / >0
WORKSPACE_FLUSH_AS_PERSISTENCE: 0 / >0
RENDERER_EXTERNAL_TURN_COMMIT_CALLS: 0 / >0

S2S_DIRECT_BRAIN_CORE_AUTHORITY: PRESERVED
CORE_FIRST_TEXT_AUTHORITY: PRESERVED
LOCAL_CACHE_AUTHORITY: DISPOSABLE_PROJECTION

VOICE_1008_LIFECYCLE_GUARD: PRESERVED / REGRESSED

PURE_TESTS_PASS: ...
PURE_TESTS_FAIL: ...
NEW_FAILURES: 0 / ...

EC_ACCEPTANCE_EXECUTIONS: 0
NORMAL_BRAIN_18089_TOUCHED: NO

UNRELATED_SOURCE_CHANGES: 0 / ...

COMMIT: ...

CLIENT_C2A_STATUS:
CLOSED_PASS / OPEN_FAIL

CLIENT_C2C_E2E_ELIGIBLE:
YES / NO
```

## Hard laws

- No copied conversation history into Voice.
- No Electron Voice semantic commit.
- No local canonical truth.
- No fallback path.
- No synthetic Voice persistence.
- No live Client E2E until C2A is source-qualified.
- Failure stays failure; stop at the first bad boundary.
