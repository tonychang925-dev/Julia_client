# RD1-L0A-F2 Client Controlled-Live Reconciliation Report

## 1. Exact reconciliation bases

- Repository: `tonychang925-dev/Julia_client`
- Current-line base: `2eed98d9e54394b7de79a2e2c802222354cf8c0a`
- Current-line subject: `fix(client): enforce explicit JULIA_TEXT_API_URL presence semantics (C1-R3)`
- Frozen I3 structured-product source: `59732e6af4f1a9da1da1728e2d7db7697f592986`
- The current line was not reset, replaced, rebased, or merged. I3 was not an ancestor of the current line, so its product contract was reconciled additively onto the exact current-line base.

## 2. Reconciliation result

`CURRENT_LINE_PRESERVED`

- The canonical `/internal/v1/conversations/{conversation_id}/turns` route remains the text route.
- `conversationId`, `turnId`, `turn_id`, modality, and current-input-only request construction remain unchanged.
- The current `brainFetch` endpoint policy, explicit `JULIA_TEXT_API_URL` presence semantics, redirect rejection, timeout hierarchy, external abort handling, and stream cancellation behavior remain unchanged.

`I3_PRODUCT_CONTRACT_PRESENT`

- Restored `julia.product.events.v1` main-process validation/normalization.
- Preserved event types: `capability.started`, `capability.completed`, `capability.failed`, `capability.cancelled`, `research_brief`, and `trace`.
- Restored `research.brief.v1` renderer validation and projection.
- Product events travel as `julia:text:stream-event` payloads of type `product_event`; transcript deltas remain type `delta`.
- `conversation_id`, `turn_id`, capability IDs, correlation ID, judgment ID, brief ID, evidence refs, and source refs are projected without replacement when supplied.
- `ownsMediaPipeline` remains `false` in the preload boundary.

`NO_VOICE_REBUILD`

- No Voice, ASR, TTS, S2S, AudioWorklet, microphone, playback, barge-in, reconnect, or media-lifecycle files were changed.

`NO_CLIENT_COGNITION`

- Electron does not decide whether research is needed, select an event, select a capability, invoke a provider, classify evidence, or alter brief semantics.
- It only normalizes transport metadata and renders authoritative product data as inert display content.

## 3. Product integration

- `src/main/product-metadata.js` validates the frozen product contract and fail-closes unsupported versions, malformed events, invalid trace strings, and non-object payloads.
- `src/main/text-client.js` accepts optional product metadata in normal and SSE responses while preserving ordinary text behavior and all current transport controls.
- `src/main/main.js` forwards authoritative product events over the existing stream IPC and includes terminal metadata in the existing `done` event.
- `src/renderer/shell/product-projection.js` validates and renders `research.brief.v1` using `textContent` only.
- `src/renderer/shell/app.js` renders machine status outside the transcript bubble and renders the ResearchBrief/trace only after successful contract validation.

## 4. Tests

Focused reconciliation:

```text
node --test tests/l0a-f2-product-reconciliation.test.js
```

Coverage:

- ordinary canonical text stream without metadata;
- exact conversation route and request body;
- `conversation_id` and `turn_id` propagation;
- structured product event alongside text deltas;
- machine status/transcript separation;
- ResearchBrief projection and trace retention;
- hostile source-derived text inertness;
- malformed product contract failure;
- optional non-stream product metadata.

Endpoint/security/transport regressions:

```text
node --test tests/l0a-f2-product-reconciliation.test.js \
  tests/client-c1-env-presence.test.js \
  tests/client-c1-fetch-authority.test.js \
  tests/client-c1-redirect.test.js \
  tests/client-c1-transport.test.js
```

Result: 39 tests passed, 0 failed.

Syntax and diff:

```text
node --check src/main/text-client.js
node --check src/main/product-metadata.js
node --check src/main/main.js
node --check src/renderer/shell/product-projection.js
node --check src/renderer/shell/app.js
git diff --check
```

Result: all passed.

A broader run also exercised current conversation, cache, Voice projection, acceptance, and security suites: 81 passed and the same 2 `tests/client-c1.test.js` static expectations failed. Those two failures reproduce identically at the exact current-line base before this candidate and are therefore pre-existing, not reconciliation regressions.

## 5. Live execution

- Live Brain connections: 0
- Provider calls: 0
- External network calls: 0
- Tests used local loopback fixture HTTP servers only.

## 6. Verdict

- Blockers: NONE
- Architecture deviations: NONE
- Voice media edits: 0

RD1-L0A-F2 = PASS
