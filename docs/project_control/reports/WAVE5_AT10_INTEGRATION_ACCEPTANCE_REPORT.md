# Wave5 AT-10 — Integration Acceptance Report

Status: INTEGRATION ACCEPTANCE GREEN / FINAL FREEZE HOLD  
Date: 2026-08-23  
Repository: `/Users/admin/julia_electron_v2`  
Branch: `codex/bugfix/at10-electron-cache-boundary`  
Base R1 commit: `a338212`  
Acceptance item: AT-10 — Electron Cache Destruction

## 1. Gate Position

```text
AT-10 Audit: COMPLETE ✅
R0 Contract: READY FOR FREEZE ✅
Minimal Remediation: GREEN ✅
R1 Permanent Evidence: GREEN ✅
Integration Acceptance: GREEN ✅
Freeze: NOT READY
```

This report closes AT-10 Integration Acceptance only. It does not claim the Final Freeze Record.

## 2. Integration Path Under Test

IA exercises the main-process product boundary instead of store-only sabotage fixtures:

```text
Electron IPC conversation handler
  ↓
text-client Core HTTP contract
  ↓
mock Assistant/Core canonical conversation API
  ↓
ConversationStore disposable projection/reconcile layer
  ↓
renderer/preload-visible conversation result shape
```

The handler layer was factored into:

```text
src/main/conversation-ipc-handlers.js
```

`src/main/main.js` registers the same handlers with Electron `ipcMain`, so tests execute the same conversation handler logic used by product IPC channels.

## 3. IA Test Matrix

| IA ID | Product path | Assertion | Status |
| --- | --- | --- | --- |
| TC-AT10-IA-001 | list/current/open handlers → Core list/detail/messages → projection | Local poison cache does not become current/list/open truth | GREEN ✅ |
| TC-AT10-IA-002 | create through Core → clear local cache → simulated app restart → open | Canonical messages restore from Core after cache destruction | GREEN ✅ |
| TC-AT10-IA-003 | sync handler with client-only `conv_*` id | Core 404 fails closed; no Core POST creation occurs | GREEN ✅ |
| TC-AT10-IA-004 | open handler with stale projection after Core mutation | Core canonical message snapshot replaces stale cached canonical projection | GREEN ✅ |
| TC-AT10-IA-005 | Core unavailable while cache exists | Existing cache is marked stale disposable projection, not canonical truth | GREEN ✅ |

## 4. IA-Discovered Integration Gap and Fix

IA found one real integration gap:

```text
reconcileCanonicalMessages() inserted/updated Core messages but retained stale cached
julia-core-canonical projection entries that were absent from the latest Core snapshot.
```

Risk:

```text
Core mutation
  ↓
Electron old projection remains alongside new Core messages
  ↓
UI projection can display stale history as if still canonical
```

Minimal fix:

```text
ConversationStore.reconcileCanonicalMessages()
  now removes stale cached canonical projection entries absent from the accepted Core snapshot.
```

This preserves AT-10 authority direction:

```text
Core canonical snapshot
  > Electron projection cache
```

## 5. Verification Evidence

### IA direct gate

Command:

```bash
cd /Users/admin/julia_electron_v2
node --test tests/at10-ia.test.js
```

Result:

```text
pass 5
fail 0
```

### Combined AT-10 gate

Command:

```bash
cd /Users/admin/julia_electron_v2
node --test --test-name-pattern 'AT10-' tests/client-c1.test.js tests/at10-ia.test.js
```

Result:

```text
pass 14
fail 0
skipped 21
```

### Full client-c1 observation

Command:

```bash
npm run test:client-c1
```

Result:

```text
pass 29
fail 1
```

Known failure:

```text
CC-1-C2 Electron waits for Voice bind acknowledgement before marking bound
```

Classification:

```text
Out of AT-10 scope. Voice bind lifecycle is not Electron cache authority, not AT-10 IA, and must not be folded into this lineage.
```

## 6. Files Changed for IA

```text
src/main/conversation-ipc-handlers.js
src/main/main.js
src/main/conversation-store.js
tests/client-c1.test.js
tests/at10-ia.test.js
docs/project_control/reports/WAVE5_AT10_INTEGRATION_ACCEPTANCE_REPORT.md
```

## 7. Scope Discipline

Still explicitly out of scope:

```text
AT-11
Electron UI redesign
Context OS policy changes
transcript redesign
search optimization
Voice bind lifecycle / CC-1-C2
```

## 8. Next Gate

```text
AT-10 Integration Acceptance GREEN
  ↓
AT-10 Final Freeze Record
```

Final Freeze Record must freeze this boundary:

```text
Electron/client cache can accelerate or display conversation access,
but cannot create, delete, hide, fork, mutate, or re-author canonical conversation reality.
```
