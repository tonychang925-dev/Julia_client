# Wave5 AT-10 — Minimal Remediation Report

Status: MINIMAL REMEDIATION COMPLETE / R1 HOLD  
Date: 2026-08-23  
Repository: `/Users/admin/julia_electron_v2`  
Branch: `codex/bugfix/at10-electron-cache-boundary`  
Base observed before remediation evidence: `643e44f`  
Acceptance item: AT-10 — Electron Cache Destruction

## 1. Gate Position

```text
AT-10 Audit: COMPLETE ✅
R0 Contract: READY FOR FREEZE ✅
Minimal Remediation: COMPLETE ✅
R1 Permanent Evidence: HOLD ⚠️
Integration Acceptance: HOLD ⚠️
Freeze: NOT READY
```

This report closes only the Minimal Remediation gate. It does not claim AT-10 R1, Integration Acceptance, or Final Freeze.

## 2. R0 Gap Closure Matrix

| R0 Gap | Required Direction | Remediation Evidence | Status |
| --- | --- | --- | --- |
| P0-GAP-1 local list/current/open/search backed by cache | Core canonical storage → Electron reload projection → UI state | IPC list/current/open/search now route through Core canonical list/detail/messages helpers before rebuilding local projection | CLOSED ✅ |
| P0-GAP-2 client-generated conversation id promoted to Core | client proposal → Core validation/creation → canonical id | `ensureConversationMessages()` no longer POSTs a missing client id to Core on 404; it raises `CORE_CONVERSATION_NOT_FOUND` | CLOSED ✅ |
| P0-GAP-3 cache destruction proves deletion but not governed recovery | delete cache → restart/reload → Core governed reload → history preserved | empty cache lookup no longer creates a local conversation implicitly; current/list reload from Core or Core create path | CLOSED ✅ |

## 3. Files Changed

```text
src/main/conversation-store.js
src/main/main.js
src/main/text-client.js
tests/client-c1.test.js
docs/project_control/reports/WAVE5_AT10_MINIMAL_REMEDIATION_REPORT.md
```

## 4. Implementation Summary

### 4.1 Electron reload source of truth

Product IPC surfaces were moved away from local cache truth:

```text
julia:conversation:list    -> listCoreConversationProjection()
julia:conversation:current -> getCurrentCoreConversationProjection()
julia:conversation:open    -> syncCoreConversationProjection(conversationId)
julia:conversation:search  -> listCoreConversationProjection(query)
```

The allowed direction is now:

```text
Core canonical list/detail/messages
  ↓
Electron projection cache rebuild/reconcile
  ↓
UI state
```

### 4.2 Client-only conversation identity rejection

`ensureConversationMessages()` no longer creates a Core conversation from a missing client/local id.

On Core 404:

```text
CORE_CONVERSATION_NOT_FOUND
```

The former forbidden direction is blocked:

```text
local conv_*
  ↓
sync helper POST
  ↓
canonical Core existence
```

### 4.3 Cache destruction governed recovery

`getCachedCurrentConversation()` was introduced as a non-authoritative cache lookup that returns `null` when cache is empty. The older `getCurrentConversation()` local-create behavior remains available for legacy direct store callers, but AT-10 product handlers no longer use it as current conversation truth.

Cache deletion now supports this governed direction:

```text
delete Electron cache
  ↓
restart / current / list
  ↓
Core canonical list/detail/messages
  ↓
projection rebuilt from Core
```

## 5. Regression Tests Added / Updated

```text
AT10-REMED-TC01 local-only conversation id is not promoted to Core existence
AT10-REMED-TC02 Core conversation list is the reload source after local cache destruction
AT10-REMED-TC03 empty cache lookup does not create a local conversation implicitly
AT10-REMED-TC04 Electron product handlers are not backed by local cache truth
```

## 6. Verification Evidence

### 6.1 AT-10 directed test gate

Command:

```bash
cd /Users/admin/julia_electron_v2
node --test --test-name-pattern 'AT10-REMED' tests/client-c1.test.js
```

Result:

```text
# pass 4
# fail 0
# skipped 21
```

### 6.2 Full local client-c1 regression observation

Command:

```bash
cd /Users/admin/julia_electron_v2
npm run test:client-c1
```

Result:

```text
# pass 24
# fail 1
```

Failure observed:

```text
CC-1-C2 Electron waits for Voice bind acknowledgement before marking bound
```

Classification:

```text
Out of AT-10 Minimal Remediation scope.
Existing Voice bind static contract mismatch in src/renderer/shell/app.js.
No AT-10 test failed.
Do not fold CC-1-C2/AT-11/Voice bind remediation into AT-10.
```

### 6.3 Missing npm default test script

Command:

```bash
npm test -- --runInBand
```

Result:

```text
Missing script: "test"
```

Classification:

```text
Repository script shape, not AT-10 remediation failure.
Valid local gate is npm run test:client-c1 or node --test tests/client-c1.test.js.
```

## 7. Root Cause

Root cause one-liner:

```text
Electron product conversation surfaces and sync helpers allowed disposable local projection state to act as conversation authority after cache loss or Core 404.
```

Bug type:

```text
Schema / contract authority mismatch + state mutation bug
```

Mechanism:

1. `julia:conversation:list/current/open/search` previously read from `ConversationStore` local cache.
2. Empty cache could cause local current conversation creation rather than Core-governed reload.
3. `ensureConversationMessages()` treated Core 404 as permission to POST the same client id into Core.
4. This allowed client-generated identity to become canonical existence.
5. AT-10 requires Electron cache to be disposable projection only.

Severity:

```text
P0 — conversation authority and identity correctness risk.
```

## 8. Risk / Boundary

Risk level: Medium

Reason:

- Touches Electron main IPC conversation surfaces and text-client Core conversation helpers.
- Does not change Core transcript schema, Context OS policy, Electron UI layout, Voice S2S storage, or transcript format.
- Fails closed when Core rejects/misses a conversation instead of fabricating local canonical state.

Explicitly not included:

```text
AT-11
Electron UI redesign
Context OS policy changes
transcript redesign
search optimization
Voice bind contract remediation
```

## 9. Rollback

Rollback command after commit:

```bash
git revert <AT10_MINIMAL_REMEDIATION_COMMIT>
```

No data migration or irreversible storage mutation is introduced by this remediation.

## 10. Next Gate

```text
Minimal Remediation COMPLETE
  ↓
AT-10 R1 Permanent Evidence
  ↓
AT-10 Integration Acceptance
  ↓
AT-10 Final Freeze Record
```

R1 must provide permanent sabotage evidence for cache destruction recovery, client-only transcript sabotage, client-generated id sabotage, stale cache after Core change, and Core unavailable fail-closed behavior.
