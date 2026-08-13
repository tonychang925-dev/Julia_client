# M0-A — Electron Legacy Migration Dry-Run Report

**Date:** 2026-08-10 (Asia/Shanghai)
**Mode:** READ-ONLY / ZERO canonical writes
**Scope owner:** Codex, Electron source side only
**Governing contract:** `julia_core/docs/architecture/C-02_CONVERSATION_AUTHORITY_CONTRACT.md`

## 1. Side-effect statement

This audit read the Electron UI cache and a canonical snapshot for collision comparison. It did not invoke an import endpoint or mutate any repository/runtime data.

| Side effect | Count |
|---|---:|
| Canonical Conversation writes | 0 |
| Memory formation | 0 |
| Continuity classification | 0 |
| Context mutation | 0 |
| LLM invocation | 0 |

## 2. Source snapshot

```text
Source: /Users/admin/Library/Application Support/julia-electron-v2/julia-conversations-v1.json
Schema version: 1
SHA-256: 2ad338398243dd42156238b611d983499feda61e5177ffe2fcdc58fb0015b29f
Top-level fields: version, currentConversationId, conversations
```

The hash freezes this report's input snapshot. A later run must report a new hash rather than silently treating changed local data as the same dataset.

## 3. Inventory

| Conversation | Title | Local messages | Legacy-local text | Core-canonical cache mirror | Disposition |
|---|---|---:|---:|---:|---|
| `conv_mslmplx6_25cc8cea` | New Conversation | 0 | 0 | 0 | Empty local draft; inventory only |
| `conv_msl6wfc3_4f654159` | 你是谁啊 | 40 | 34 | 6 | 34 text messages are M0-A candidates; 6 voice messages are excluded |

The known case remains exactly:

```text
conv_msl6wfc3_4f654159
34 legacy-local text messages
17 complete user/assistant turns
```

The current cache contains 40 messages because CLIENT-C1B has also mirrored six canonical Voice messages. Those six records carry `metadata.source=julia-core-canonical`; importing them as legacy data would duplicate canonical facts.

## 4. Source schema

Conversation fields observed:

```text
conversation_id
title
title_updated_by_user
created_at
updated_at
messages[]
```

Message fields observed:

```text
message_id
conversation_id
turn_id
role
modality
content
status
created_at
metadata
```

Timestamp format is ISO-8601 UTC with millisecond precision. All 34 migration candidates parse successfully and are monotonically ordered in source array order.

## 5. Validation result

| Check | Result |
|---|---|
| Invalid timestamp | 0 |
| Non-monotonic timestamp | 0 |
| Duplicate source message ID | 0 |
| Duplicate role within a turn | 0 |
| Incomplete turn | 0 |
| Empty/malformed content | 0 |
| Unsupported candidate modality | 0 |
| Proposed message-ID collision | 0 |
| Proposed turn-ID collision | 0 |
| Collision with current canonical IDs | 0 |

## 6. Deterministic ID simulation

Simulation only; C-02 deliberately defers the normative hash algorithm to the migration implementation contract.

Simulation tuple:

```text
message:
legacy_source
+ legacy_conversation_id
+ original_timestamp
+ role
+ stable_message_sequence
+ SHA-256(content)

turn:
legacy_source
+ legacy_conversation_id
+ first_message_timestamp
+ stable_turn_sequence
+ SHA-256(ordered turn content)
```

The tuple is encoded deterministically, SHA-256 hashed, and represented with a 24-hex suffix for preview. Running the simulation twice over the frozen snapshot produced the same aggregate digest:

```text
57cbefa48dc15258e0c460823e1cb95826f26299a1cf053d19b35acd290a0224
```

Provenance preview for every candidate:

```text
source/provenance = legacy-electron
```

## 7. Chronology preview

Message contents are intentionally omitted from this report. Lengths are `user/assistant` characters.

| # | Source turn | Proposed canonical turn | User time | Assistant time | Lengths |
|---:|---|---|---|---|---:|
| 1 | `3b6d1441-5502-4e44-873d-78a72861d89e` | `turn_legacy_547d9b14050fc884ae61bbcd` | 2026-08-09T03:22:32.239Z | 2026-08-09T03:22:33.758Z | 4/21 |
| 2 | `c8e7d5ff-c1d1-49e8-94ce-8842446c8328` | `turn_legacy_bca89d16550bb2721fc8e844` | 2026-08-09T03:22:46.589Z | 2026-08-09T03:22:49.172Z | 7/224 |
| 3 | `f5f98bcd-189d-4c53-95c6-38b9a7309202` | `turn_legacy_cf8bdf29c5340516c46ed192` | 2026-08-09T03:40:18.745Z | 2026-08-09T03:40:20.400Z | 2/18 |
| 4 | `a2f35fa4-4290-43a5-aa4b-ffdf4d8550fc` | `turn_legacy_7b94cd945e26c465d425e402` | 2026-08-09T03:55:22.310Z | 2026-08-09T03:55:24.132Z | 10/54 |
| 5 | `feaca26a-1d9e-4df7-94b1-3ded0c2434d1` | `turn_legacy_ebd3352ee7debf88a45db290` | 2026-08-09T03:55:44.216Z | 2026-08-09T03:55:46.944Z | 13/14 |
| 6 | `64c4f2d2-41f1-44a9-9212-34f223bbfef6` | `turn_legacy_8ecdb55bcf992c24c5a27d12` | 2026-08-09T03:56:11.970Z | 2026-08-09T03:56:15.794Z | 16/92 |
| 7 | `41349f28-6c23-4d30-87c9-ae2fad752990` | `turn_legacy_7b9cf6c9997bdbad8fd9bf93` | 2026-08-09T03:56:32.698Z | 2026-08-09T03:56:34.235Z | 7/14 |
| 8 | `0b240825-9bda-4c83-9acb-e5600b106e2f` | `turn_legacy_871bc7ebca20f2da6b35f40c` | 2026-08-09T03:56:44.073Z | 2026-08-09T03:56:46.115Z | 4/110 |
| 9 | `2e579697-5c27-425c-a09f-79db745685fe` | `turn_legacy_feeaf43a4537ae5677cd65fd` | 2026-08-09T03:57:08.763Z | 2026-08-09T03:57:12.304Z | 11/183 |
| 10 | `0fc4378e-b0d3-47ed-be34-fab5ffcdf63a` | `turn_legacy_6f7f8a1d1846254c270361d2` | 2026-08-09T04:22:19.701Z | 2026-08-09T04:22:24.331Z | 27/371 |
| 11 | `e622fc57-4361-4031-b519-70c0761599ad` | `turn_legacy_8bf466483e43f38130e3fea7` | 2026-08-09T04:23:19.159Z | 2026-08-09T04:23:22.792Z | 33/223 |
| 12 | `fcb5b880-1c5f-4f8c-9a1e-adc04fcaa224` | `turn_legacy_00ef64e565e9932e554c2453` | 2026-08-09T04:23:54.883Z | 2026-08-09T04:23:56.420Z | 8/22 |
| 13 | `b83003ad-2c1d-4667-a1eb-2d743950a57f` | `turn_legacy_69a406483ea436524dd83028` | 2026-08-09T04:24:33.887Z | 2026-08-09T04:24:38.065Z | 12/328 |
| 14 | `536e963e-cc16-4c90-b6fc-c0f60118bc22` | `turn_legacy_77f41aa1911b170fa3811773` | 2026-08-09T04:25:14.915Z | 2026-08-09T04:25:18.954Z | 16/202 |
| 15 | `5092e29a-0fa7-4cc6-b5ee-e0ad9eddfc5d` | `turn_legacy_0213e561987065086132d8b1` | 2026-08-09T04:25:50.381Z | 2026-08-09T04:25:53.879Z | 11/101 |
| 16 | `ef46e207-36b5-4e91-bca4-a9c30a8a3794` | `turn_legacy_317d0ebcf88264e59231862e` | 2026-08-09T04:26:16.976Z | 2026-08-09T04:26:20.384Z | 13/58 |
| 17 | `c948c5f6-d846-4298-bb17-859b1ff83ff6` | `turn_legacy_8e67c8330830a25c9011dba7` | 2026-08-09T04:45:11.760Z | 2026-08-09T04:45:14.990Z | 23/120 |

## 8. Conflict and migration-risk report

1. **Mixed-origin cache:** the same Electron file now contains legacy-local text and Core-canonical Voice mirrors. M0-B must select records by provenance/origin and must not import the six Voice mirrors.
2. **Existing canonical conversation:** Core already contains `conv_msl6wfc3_4f654159` with six Voice messages. M0-B is therefore an ordered merge into an existing conversation, not creation of a blank conversation.
3. **Current sync has side effects:** Electron `ensureConversationMessages()` creates a missing Core conversation. A dry-run tool must never call this runtime sync path.
4. **Snapshot drift:** the local cache is mutable. M0-B must require an approved source snapshot hash or regenerate/re-review the dry-run.
5. **Hash algorithm not frozen:** the IDs above are preview IDs only. Claude/Core must freeze the exact canonical implementation algorithm before M0-B.

## 9. M0-A disposition

```text
Electron source inventory       PASS
Schema/timestamp/order analysis PASS
Duplicate/incomplete detection  PASS
Deterministic ID simulation     PASS (non-normative preview)
Chronology preview              PASS
Conflict report                 PASS
Provenance preview              PASS
Canonical writes                0
```

Electron-source M0-A work is complete for the discovered snapshot. M0-B remains blocked by the WBS gates and Claude-owned canonical migration implementation.
