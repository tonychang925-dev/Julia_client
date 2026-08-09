# Electron C-10 / C-11 Characterization and Test Preparation

**Date:** 2026-08-10
**Mode:** Test preparation only
**Contract status:** C-10 `2d99293` and C-11 `29b2198` are frozen.
**Constraint:** Characterization may now derive deterministic semantics from the frozen contracts; production patches remain a separate gate.

## 1. Existing baseline

Command:

```bash
npm run test:client-c1
```

Observed result on Electron HEAD `6cc1b1d`:

```text
tests 10
pass  10
fail  0
```

Existing coverage includes native turn shape, no caller-owned history, identity validation, SSE error handling, canonical reconciliation, external Voice commit, stale-base failure, and registration of a local-only conversation.

## 2. Characterization tests allowed now

These describe current reality or enforce C-00 through C-06; they do not assume unfrozen C-10/C-11 API names.

| ID | Characterization | Expected invariant |
|---|---|---|
| CHAR-01 | Text JSON vs SSE | Same conversation/turn semantics; delivery differs only by chunking |
| CHAR-02 | Reconnect after completed turn | Same `conversation_id`; canonical messages refetched |
| CHAR-03 | Missing local cache | No local history is sent as cognition input |
| CHAR-04 | Same turn retry | Same `turn_id`; no duplicate canonical turn |
| CHAR-05 | Different input with same turn ID | Conflict surfaced; no local fallback |
| CHAR-06 | Voice flush stale base | `conversation_advanced` blocks commit/switch |
| CHAR-07 | Voice empty delta | No Core external-turn commit |
| CHAR-08 | Voice/Text identity mismatch | Reject before render/commit |
| CHAR-09 | Interrupted canonical assistant | Preserve/render interrupted status and emitted content (currently expected to expose a gap) |
| CHAR-10 | Failed Text turn | Optimistic record must not masquerade as canonical completed (currently expected to expose a gap) |
| CHAR-11 | Barge-in | Media interruption does not rewrite completed canonical history |
| CHAR-12 | Client cache removal | Core conversation remains authoritative and recoverable by ID |
| CHAR-13 | Native request field boundary | No model/provider session/tools/persona/system/history fields leave Electron |
| CHAR-14 | Capability-shaped natural language | Uses the same Julia-native turn path; Electron performs no semantic routing |
| CHAR-15 | Preload capability surface | No generic MCP/tool execution or authorization bridge is exposed |
| CHAR-16 | Provider-envelope isolation | OpenAI-shaped SSE decoding changes transport only, never Persona/context/tool policy |

## 3. C-10 implementation-impact checklist

Activate only after C-10 freezes:

```text
[ ] create/open/list/search/rename/delete authority and API ownership
[ ] reconnect state machine
[ ] active turn retry/cancel semantics
[ ] cache freshness/staleness markers
[ ] optimistic UI status model
[ ] canonical interrupted/failed rendering
[ ] conversation_id and turn_id correlation across IPC
[ ] offline behavior and explicit non-authoritative cache semantics
```

## 4. C-11 implementation-impact checklist

Activate only after C-11 freezes:

```text
[ ] microphone ownership and release invariants
[ ] Voice/Text same logical conversation semantics
[ ] speech interruption vs canonical message status
[ ] barge-in generation/speech correlation
[ ] Voice bootstrap replacement path once Context OS package exists
[ ] hide/tray/close privacy behavior
[ ] reconnect without Voice-only conversation authority
[ ] no PCM/media data through Electron main/IPC
```

## 5. Mandatory sequence tests after contract freeze

### Reconnect sequence

```text
complete turn
→ disconnect/reload client surface
→ reopen same conversation_id
→ fetch Core canonical transcript
→ no client-history submission
```

### Text/Voice parity sequence

```text
Text turn in conv-A
→ Voice interaction in conv-A
→ Core canonical reconciliation
→ Text reopen conv-A
→ same logical chronology and IDs
```

### Interruption sequence

```text
assistant emits partial content
→ barge-in/media cancel
→ canonical assistant status=interrupted
→ reconnect
→ emitted content remains visible
→ no completed-history rewrite
```

### Cache-authority sequence

```text
Core contains conv-A
→ remove Electron cache snapshot
→ client reconnects by canonical discovery/ID
→ Core history remains available
→ no cache upload as truth
```

## 6. Hold boundary

```text
Characterization design                 COMPLETE
Existing Electron tests                 10/10 PASS
New production behavior                 0
C-10/C-11 guessed interface code        0
Core/Brain modifications                0
```

Implementation begins only after the governing frozen contract and explicit GO.
