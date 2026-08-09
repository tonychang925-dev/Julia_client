# Electron V2 — C-10 Frozen Contract Impact Review

**Date:** 2026-08-10
**Contract:** C-10 Gateway / Client `2d99293` — FROZEN
**Electron production baseline:** `6cc1b1d`
**Mode:** READ-ONLY impact review; production behavior changes = 0

## 1. Executive result

```text
Authority direction                 COMPLIANT
Projection/cache implementation     TRANSITIONAL
GAP-1 / GAP-2                       CONFIRMED
Versioned event/reconnect protocol  INCOMPLETE
```

The authority direction is correct: Electron sends current interaction plus identifiers and reconciles from Core. The remaining work is primarily projection-state correctness, canonical interrupted rendering, disposable-cache recovery, and a versioned/deduplicated event protocol.

## 2. Clause matrix

| C-10 clause | Current Electron behavior | Verdict | Future patch location | Characterization / regression |
|---|---|---|---|---|
| §1 Client/Gateway/Core roles | Client renders and transports; Core endpoint owns cognition | COMPLIANT | None | Native request contains no history/persona/memory |
| §2 Command Plane | Native turn carries conversation/turn/input/modality, but no command envelope/version/client instance/correlation | TRANSITIONAL | `src/main/text-client.js`, preload/main IPC | Validate command identity; protocol fields after Brain support |
| §3 Event Plane | Stream IPC has request/conversation/turn/type/content, but no event ID, sequence, generation, canonical ref | GAP | `text-client.js`, `main.js`, preload, renderer stream handler | Duplicate/out-of-order/missing-sequence fixture |
| §4 Canonical IDs | conversation/turn validated; local message ID kept separate during canonical reconcile | COMPLIANT | Preserve | Mismatched response IDs reject |
| §5 Optimistic UI | Local user cache record defaults to `completed` before canonical acknowledgement | VIOLATION GAP-1 | `conversation-store.js:addMessage`, `app.js:sendComposerMessage`, render helpers | Core failure leaves LOCAL/FAILED, never canonical completed |
| §6 Disposable cache | Cache is labeled presentation-only, but sidebar/discovery and active selection depend on it | GAP | conversation list/current IPC and renderer initialization | Remove cache, reopen Core conversation by canonical discovery/ID |
| §7 Reconnect reconcile | Open/sync GETs canonical messages; no complete reconnect state machine | TRANSITIONAL | `syncCanonicalConversation`, startup/open flow | Disconnect/reconnect; no history upload; canonical replacement |
| §8 No client context selection | Text sends current input only | COMPLIANT | None | Assert no messages/history/system/persona fields |
| §9 Gateway not Context OS | Electron does not assemble prompt/context | COMPLIANT | None | Static request-shape gate |
| §10 Event ordering | Renderer correlates request IDs but has no sequence-gap detection | GAP | stream event schema/handler | Out-of-order and missing sequence must trigger reconcile |
| §11 At-least-once dedup | Canonical reconcile dedupes message IDs/turn-role; command retry/event dedup not implemented | GAP | client command/event transport | Same command retry no duplicate turn; duplicate event ignored |
| §12 Disconnect ≠ cancel | No explicit disconnect policy or turn-status reconciliation | UNKNOWN/GAP | transport adapter after Brain C-10 implementation | Disconnect mid-turn then canonical reconcile |
| §13 Interrupted visibility | GET/reconcile filters everything except `completed` | VIOLATION GAP-2 | `text-client.js:getConversationMessages`, `conversation-store.js:reconcileCanonicalMessages`, renderer message styling | Canonical interrupted assistant remains visible with status |
| §14 Delta ≠ canonical | Delta is DOM-only while streaming; final response is also written optimistically before canonical GET | TRANSITIONAL | `app.js:sendComposerMessage` | Lost delta followed by canonical GET restores final truth |
| §15 Text/Voice same protocol | Same logical conversation ID; Voice uses workspace/external-turn compatibility path | TRANSITIONAL | Electron Voice coordinator after C-11/C-03 production convergence | Text→Voice→Text identity and chronology |
| §16 Presence = execution | UI states are renderer/media states | COMPLIANT | None | Presence state does not persist as cognition |
| §17 Auth ≠ relationship | Electron has no relationship-based authorization | COMPLIANT/UNKNOWN auth | C-10 gateway security implementation | Caller identity cannot be self-asserted as Tony authorization |
| §18 Multi-client concurrency | Stale Voice base is rejected; broader event/conversation concurrency absent | TRANSITIONAL | transport reconciliation | Two projections; canonical conflict resolved by Core |
| §19 No unfinished cognition persistence | Assistant pending DOM is not persisted, but user optimistic cache is marked completed | GAP (same root as GAP-1) | `sendComposerMessage`, cache status model | Failed/aborted turn cannot appear canonical completed |
| §20 Protocol versioning | No protocol handshake/version/feature flags | GAP | Brain client adapter + IPC DTOs | Unsupported version fails explicitly |
| §21 No direct Core persistence | Electron uses HTTP API; local JSON is presentation cache | COMPLIANT | None | Static path/no Core DB access |
| §22 API classification | No full prompt/history/persona/memory POST | COMPLIANT | Preserve | Request-schema tests |
| §23 GAP dispositions | GAP-1/GAP-2 independently reproduced | GAP CONFIRMED | See exact plan | Dedicated tests |
| §24 C-10/C-11 boundary | Electron controls surface/lifecycle; Voice owns media | COMPLIANT | Preserve | PCM/media IPC remains zero |

## 3. Exact current evidence

### GAP-1

```text
app.js:sendComposerMessage()
→ addConversationMessage(user)
→ ConversationStore.addMessage()
→ status defaults to completed
→ Core turn may still fail
```

The renderer's assistant placeholder is correctly ephemeral DOM state, but the user record is persisted with canonical-looking completion before Core authority confirms it.

### GAP-2

```text
text-client.js:getConversationMessages()
→ message.status === completed only

conversation-store.js:reconcileCanonicalMessages()
→ message.status === completed only
→ normalized status hardcoded completed
```

This erases canonical `assistant/interrupted` from the client projection.

### Protocol gaps

Current stream IPC correlation has `requestId`, `conversationId`, and `turnId`, but lacks C-10 `event_id`, monotonic `sequence`, `generation_id`, `canonical_ref`, and `protocol_version`. These require matching Brain/Gateway production support; Electron must not invent values that pretend to be Core events.

## 4. Patch readiness

```text
GAP-1 projection-state patch       READY from C-10
GAP-2 interrupted-render patch     READY from C-10 + C-11
Protocol event/version patch       BLOCKED by Brain/Gateway implementation DTO
Canonical list/discovery patch     BLOCKED by frozen API implementation availability
Voice context replacement          Voice/Core owner; not Electron patch
```

## 5. Gate

```text
C-10 impact review                 PASS
Exact Electron patch locations     IDENTIFIED
Tests specified                    YES
Production files modified          0
```
