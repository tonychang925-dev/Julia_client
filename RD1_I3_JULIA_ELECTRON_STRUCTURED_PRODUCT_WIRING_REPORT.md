# RD1-I3 Julia Electron Structured Product Wiring Report

## 1. Local/remote identity

- Local repository: `julia_electron_v2`
- Remote repository: `tonychang925-dev/Julia_client`
- Implementation branch: `glm-b/i3-structured-product-wiring`
- The work was performed from an isolated checkout of the frozen base, not from unrelated later local branches.

## 2. Exact base SHA

```text
c44bb7e5ea511f9d4f9081d544c3e8c121e7d307
```

The implementation parent is exactly this SHA.

## 3. Changed files

- `src/main/text-client.js`
- `src/main/product-metadata.js`
- `src/main/main.js`
- `src/preload/index.js`
- `src/renderer/shell/app.js`
- `src/renderer/shell/product-projection.js`
- `src/renderer/shell/index.html`
- `src/renderer/shell/styles.css`
- `tests/text-client.test.js`
- `tests/product-projection.test.js`
- `package.json`
- `RD1_I3_JULIA_ELECTRON_STRUCTURED_PRODUCT_WIRING_REPORT.md`

No Voice media, ASR, S2S, TTS, AudioWorklet, microphone lifecycle, playback, or barge-in file was changed.

## 4. Existing seams reused

The implementation extends the existing path only:

```text
renderer composer
→ preload streamTextMessage
→ ipcMain.handle('julia:text:stream')
→ /v1/chat/completions SSE
→ julia:text:stream-event
→ renderer stream handler
→ existing conversation message persistence
```

No new backend, WebSocket, endpoint, research service, workflow engine, semantic router, or alternate cognition path was added.

## 5. Identity carrier

The stream request carries optional canonical identity as top-level backward-compatible members:

```json
{
  "conversation_id": "...",
  "turn_id": "...",
  "model": "julia-brain",
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": "current user input"
    }
  ]
}
```

The renderer passes its existing canonical conversation ID and its existing request/turn ID. Electron does not send its transcript and does not add model-visible history. The `messages` array remains exactly one current user message.

The non-stream helper accepts the same optional identity carrier for API compatibility, although the product path continues to use SSE.

## 6. Stream carrier

Existing `delta` and final `content` behavior remains unchanged. A new IPC event type is added only for authoritative product events:

```json
{
  "requestId": "...",
  "type": "product_event",
  "productEvent": {
    "type": "capability.started"
  }
}
```

The final `done` event may additionally carry optional validated product metadata. Ordinary responses without metadata retain their prior payload shape and rendering.

## 7. Product event contract

The optional upstream response member is:

```json
{
  "product": {
    "contract_version": "julia.product.events.v1",
    "events": [],
    "research_brief": {},
    "trace": {}
  }
}
```

Supported event types are:

- `capability.started`
- `capability.completed`
- `capability.failed`
- `capability.cancelled`
- `research_brief`
- `trace`

The contract is intentionally minimal and extensible. Unsupported versions and malformed events fail closed. Electron maps only the four capability types to the display labels `researching`, `completed`, `failed`, and `cancelled`; it never derives status from assistant text.

## 8. ResearchBrief projection

The renderer accepts only exact `research.brief.v1` objects and projects:

- event title and headline
- executive summary
- what happened
- why it matters
- drivers and support levels
- evidence snapshot
- contradictions
- uncertainties
- what to watch
- confidence
- reasoning limits
- source references
- trace

`REPORT_ONLY` and every other support/evidence label are rendered as upstream text. The renderer does not reclassify evidence, promote verification state, synthesize claims, or recompute confidence.

## 9. Trace propagation

Available upstream trace objects are retained as structured metadata and displayed as text. The supported identity fields remain distinct and are never replaced by Electron's request ID:

- `conversation_id`
- `turn_id`
- `capability_request_id`
- `capability_call_id`
- `correlation_id`
- `judgment_id`
- `brief_id`

Missing IDs are not invented. Runtime product events also preserve optional identity fields supplied by the authoritative event.

## 10. Transcript/runtime separation

Assistant text deltas continue to update the conversation bubble. Product capability events update a separate `.product-status` element. ResearchBrief and trace metadata render in separate structured panels attached to the same assistant turn when complete.

Product events never become user or assistant semantic messages. No “researching” prose is inserted into `content`.

## 11. Security

- Research metadata projection uses DOM construction and `textContent`.
- It does not assign source-derived `innerHTML`.
- It does not evaluate data or scripts.
- It does not create executable URLs or tool actions.
- Hostile text remains displayed inertly.
- Invalid product metadata versions and malformed ResearchBrief shape fail closed.

## 12. Tests

Command:

```text
npm test
```

Result:

```text
8 tests / 8 passed / 0 failed
```

Additional checks:

```text
node --check src/main/text-client.js
node --check src/main/product-metadata.js
node --check src/renderer/shell/product-projection.js
node --check src/renderer/shell/app.js
git diff --check
```

All passed.

### Case coverage

- I3-F01: ordinary SSE deltas and final content remain unchanged.
- I3-F02: request carries canonical `conversation_id` and `turn_id`; transcript is not forwarded.
- I3-F03/F04/F05/F06: authoritative capability events map to separate status display states.
- I3-F07: `research.brief.v1` projection is schema-checked and rendered structurally.
- I3-F08: `REPORT_ONLY` remains exactly `REPORT_ONLY`.
- I3-F09: contradictions and uncertainties remain exact text.
- I3-F10: all canonical trace IDs remain distinct.
- I3-F11: hostile source content is rendered only through `textContent`.
- I3-F12: absent metadata leaves the result and metadata payload undefined.
- I3-F13: no market/event/capability routing logic exists in client changes.
- I3-F14: changed-file audit proves zero Voice media/lifecycle edits.

## 13. Voice unchanged proof

- `src/main/config.js`, window/Voice lifecycle modules, permissions, and all media-related files are untouched.
- Text and Voice remain separate surfaces and transports.
- The Voice iframe and media pipeline receive no structured product semantics.
- `VOICE_MEDIA_EDITS = 0`.

## 14. Architecture deviations

- `NONE`

The only contract-shaped addition is the versioned optional `product` response object required to carry authoritative structured events and metadata over the existing SSE response.

## 15. Not proven

- Live Brain/Assistant acceptance of the optional identity body members is not proven at this client layer.
- Live emission of `julia.product.events.v1` by the upstream Brain/Assistant boundary is not proven here.
- End-to-end provider fixture execution is outside I3.
- These are upstream integration checks, not Electron runtime or architecture blockers.

## 16. Verdict

```text
I3 = PASS
```
