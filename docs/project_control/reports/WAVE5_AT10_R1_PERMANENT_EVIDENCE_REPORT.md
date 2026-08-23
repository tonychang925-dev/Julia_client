# Wave5 AT-10 — R1 Permanent Evidence Report

Status: R1 PERMANENT EVIDENCE GREEN / IA HOLD  
Date: 2026-08-23  
Repository: `/Users/admin/julia_electron_v2`  
Branch: `codex/bugfix/at10-electron-cache-boundary`  
Base remediation commit: `06ce23c`  
Acceptance item: AT-10 — Electron Cache Destruction

## 1. Gate Position

```text
AT-10 Audit: COMPLETE ✅
R0 Contract: READY FOR FREEZE ✅
Minimal Remediation: GREEN ✅
R1 Permanent Evidence: GREEN ✅
Integration Acceptance: HOLD ⚠️
Freeze: NOT READY
```

This report closes R1 sabotage evidence only. It does not claim Integration Acceptance or Final Freeze.

## 2. R1 Sabotage Matrix

| R1 ID | Sabotage | Expected authority result | Permanent test | Status |
| --- | --- | --- | --- | --- |
| AT10-R1-001 | Delete Electron cache after local poison exists | Projection is rebuilt from Core canonical messages only | `AT10-R1-001 cache deletion recovery rebuilds projection from Core canonical history` | GREEN ✅ |
| AT10-R1-002 | Inject `FAKE_CLIENT_MESSAGE` into Electron cache | Fake message never enters provider turn body or canonical projection | `AT10-R1-002 client-only transcript sabotage never enters provider turn body or canonical projection` | GREEN ✅ |
| AT10-R1-003 | Use `conv_fake_001` client-generated id against Core 404 | No POST promotion; fail closed with `CORE_CONVERSATION_NOT_FOUND` | `AT10-R1-003 client-generated id sabotage is not promoted into Core canonical existence` | GREEN ✅ |
| AT10-R1-004 | Core mutates while Electron has stale cache | Core messages replace stale cache; old cached copy disappears | `AT10-R1-004 stale cache after Core mutation is replaced by Core canonical state` | GREEN ✅ |
| AT10-R1-005 | Core unavailable while cache exists | Cache remains stale disposable projection, not canonical history | `AT10-R1-005 Core unavailable fails closed and keeps cache labeled as stale projection` | GREEN ✅ |

## 3. Evidence Boundary

R1 validates sabotage resistance at the Electron cache/projection boundary:

```text
Electron/client cache
  ≠
conversation authority
```

Positive direction preserved:

```text
Core canonical state
  → Electron projection
  → UI-visible state
```

Forbidden direction rejected:

```text
Electron cache/local transcript/client id
  → Core canonical truth / provider-visible history
```

## 4. Verification Command

```bash
cd /Users/admin/julia_electron_v2
node --test --test-name-pattern 'AT10-R1' tests/client-c1.test.js
```

Expected result:

```text
pass 5
fail 0
```

## 5. Scope Discipline

Still explicitly out of scope:

```text
AT-11
Electron UI redesign
Context OS policy changes
transcript redesign
search optimization
Voice bind lifecycle / CC-1-C2
```

## 6. Next Gate

```text
AT-10 R1 Permanent Evidence GREEN
  ↓
AT-10 Integration Acceptance
  ↓
AT-10 Final Freeze Record
```

IA must later prove the real governed path through Electron main/preload IPC and Assistant/Core canonical API. R1 intentionally remains sabotage evidence, not full integration acceptance.
