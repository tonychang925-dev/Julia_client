# M1 — Text + Research Canonical Continuity — Closure Manifest

Status: CLOSED
Closure date: 2026-09-07
Governance task: M1-GIT-FREEZE-A1

This manifest freezes the exact source/evidence composition that produced
MILESTONE-1 (Text + Research Canonical Continuity = CLOSED). Runtime tags point
at the accepted runtime SHAs; this document is the human-readable cross-repo
authority map. Failures stay in history. Accepted SHAs stay immutable.

---

## 1. Source matrix (mechanical, 2026-09-07)

ROLE        | REPOSITORY                      | BRANCH / RELEASE                        | SHA (git / content)         | M1 TAG
----------- | ------------------------------- | --------------------------------------- | --------------------------- | -------------
Client      | Julia_client (local: /Users/admin/julia_electron_v2, origin github.com/tonychang925-dev/Julia_client.git) | client-a2-r4-product-envelope-dispatch | fe508d04993301666e5985d8070271e4fdd0d9f0 | m1-text-research-continuity-v1 (tag obj 0ad8c0232e300c3146a2d64db4ac5f8ea55e49c6)
Core        | Julia_core (local: /Users/admin/glm-workspace/Julia_core, origin github.com/tonychang925-dev/Julia_core.git) | glm-d/rd1-l1-r10-f2-numeric-representation-normalization | c14f6aa77a50dafc21a97083fac8cb97efc7231d | m1-text-research-continuity-v1 (tag obj d88b0aa950c247dc159a1be7d7f9492f31e6524d)
Brain/Assistant | julia_rd1_controlled release (non-git) assistant-r3-c2-jsonobject-v1 | deepseek_provider.py content sha 1fcbbb0b3e999cd7478d554be2340e8f70314e2f91f852f49fb2a8f573707f43; tree file-manifest metadata/assistant-r3-c2-jsonobject-v1.file-manifest.sha256 (sha 7d917cc20567de5e4a3e1ddc39b963dedc43d85bdd82d1788cc817c7e33f6200, 330 files) | NOT_GIT_TAGGABLE (release tree; no local git commit equals the accepted tree)
Market      | ai_theme_app (local: /Users/admin/Desktop/ai_theme_app, origin github.com/tonychang925-dev/ai_theme_app.git; HEAD f1bc3def7 NOT runtime) | julia_rd1_controlled release market-ca939a08726f45e60fc2c80793076865ce21af7c | pinned launcher env JULIA_MARKET_SOURCE_SHA=ca939a08726f45e60fc2c80793076865ce21af7c | NOT_GIT_TAGGABLE (release tree; accepted commit not present in any local clone)
D1          | julia_rd1_controlled release d1-29a5478ac7e37055b1a89172104473c27cc20b310c9eda542685e5bf4561f705 | pinned launcher env JULIA_D1_SOURCE_SHA=29a5478ac7e37055b1a89172104473c27cc20b310c9eda542685e5bf4561f705 | NOT_GIT_TAGGABLE (release tree)

Release-tree freeze rationale (SOURCE-PROVEN): the controlled Brain executes
from julia_rd1_controlled/releases/ trees pinned by the FINAL-3 launcher
env (JULIA_BRAIN_ROOT / JULIA_MARKET_SOURCE_ROOT+SHA / JULIA_D1_SOURCE_SHA)
and the composition attestation (market_source_sha ca939a08…, resolve/read
available, manager_provider_identity_pass). Those trees carry per-file sha256
file-manifests under julia_rd1_controlled/metadata. The accepted assistant/
market/D1 source commits live on canonical remotes that are NOT present in any
local clone, so no honest annotated git tag can be created for them locally
(no local commit object exists to tag; manufacturing one is forbidden by the
M1 law). Their identity is frozen via release-tree + file-manifest + pinned
launcher env + FINAL-3 attestation — mechanically proven, git-inexpressible.

Julia-AI-Assistant repo (local /Users/admin/julia_ai_assistant, HEAD
47a3e4afe9f50c286c08ed58825234128dba9372 on phase5/rmd-3g-observability) is NOT
the accepted assistant runtime and is intentionally NOT tagged.

Remote state: m1-text-research-continuity-v1 pushed to Julia_client and
Julia_core remotes (tag objects above; each tag push carries its target
accepted commit). Accepted commits were local-only before the freeze push;
no amend/squash/rebase — SHA_BEFORE_PUSH == SHA_AFTER_PUSH.

Working-tree state at freeze: Julia_client and Julia_core have ZERO modified
tracked source files (only untracked audit reports/docs). Runtime-loaded code
equals the accepted HEAD commits.

## 2. Immutable acceptance history (failures included)

Research Desk (Core):
- R10-FINAL-1 = OPEN_FAIL (D1 execution authority)
- R10-FINAL-2 = OPEN_FAIL (D1 response transport truncation 65536)
- R10-FINAL-3 = OPEN_FAIL (C2 judgment contract)
- R10-FINAL-4 = OPEN_FAIL (Research Brief composition)
- R10-FINAL-5 = CLOSED_PASS (event 215257; PROJECT_LIFETIME_CANONICAL_R10_EXECUTIONS = 5)

Client ordinary Text:
- CLIENT-TEXT-E2E-A1 = OPEN_FAIL
- CLIENT-TEXT-E2E-A1-FINAL-2 = CLOSED_PASS

Structured Research:
- A2-FINAL-1 = OPEN_FAIL (instance 1 input transcription mismatch; instance 2 C2 malformed JSON + client idle budget)
- A2-FINAL-2 = OPEN_FAIL (STRUCTURED_PRODUCT_RENDERER; real product = julia.product.events.v1 envelope)
- A2-R3 = CLOSED_PASS (idle 30→120s; C2 json_object; typed error propagation)
- A2-R4 = CLOSED_PASS (julia.product.events.v1 envelope dispatch)
- A2-FINAL-3 = CLOSED_PASS

Cross-audit:
- RD1-CLOSURE-XAUDIT-A1 = CLOSED_PASS

Never summarized as "all tests passed first try."

## 3. Final M1 claims (frozen)

RESEARCH_DESK_V1 = CLOSED
CLIENT_TEXT_ORDINARY_CONVERSATION = CLOSED
CLIENT_TEXT_STRUCTURED_RESEARCH = CLOSED
CLIENT_TEXT_RESEARCH_CONTINUITY = CLOSED

CLIENT_INPUT_TO_RESEARCH_DESK = PROVEN
CLIENT_TRIGGERED_REAL_RESEARCH_EXECUTION = PROVEN
REAL_STRUCTURED_PRODUCT_DELIVERY = PROVEN
JULIA_PRODUCT_EVENTS_V1_TRANSPORT = PROVEN
RESEARCH_BRIEF_STRUCTURED_RENDERING = PROVEN
CORE_CANONICAL_PRODUCT_PERSISTENCE = PROVEN
CORE_TO_CLIENT_CANONICAL_SYNC = PROVEN
RESTART_STRUCTURED_PRODUCT_CONTINUITY = PROVEN

NOT claimed: VOICE_CONTINUITY / CROSS_MODAL_CONTINUITY / POST_RD1.

## 4. Canonical product contract (frozen)

CANONICAL PRODUCT: julia.product.events.v1
nested renderable research product: research_brief → research.brief.v1

Authority law:
- SSE = realtime delivery (same product_payload dict committed to Core)
- Core assistant message.product = durable canonical authority
- Client local product = disposable projection (== Core digest after sync)
- Renderer = presentation authority only

FINAL-3 product evidence (full digests):
- SSE == CORE == LOCAL envelope digest = e18e908fe380478a4522358a047df792421d7cbe523245c6002ef471392da991
- nested research brief digest = f29a3f4c9271a38c29075a91f4eec329ba305e57bcadab9b13db51f936743ab1
- event_id = 215257

## 5. Market authority freeze (XAUDIT closure)

MARKET_ADAPTER_DUPLICATION = NOT_FOUND
MARKET_EVENT_RESOLVER_DUPLICATION = NOT_FOUND
MARKET_TRANSPORT_PARITY = PRESERVED_OR_STRENGTHENED
MARKET_AUTHORITY_UNIQUENESS = UNIQUE
CANONICAL_RESEARCH_INGRESS = UNIQUE
R10_FINAL_5_TO_CURRENT_DRIFT = NONE
legacy MarketToolRouter = RETIRED_NOT_MISSING
POST-RD1 donor assets = NOT PART OF M1 AUTHORITY

## 6. Acceptance artifacts (sha256 + size)

Client reports (local path docs/audit/<name>, repo Julia_client working tree;
included in the governance/evidence commit):

| File | bytes | sha256 |
| ---- | ----- | ------ |
| CLIENT_TEXT_E2E_A1_REPORT_2026-09-07.md | 5776 | a3ad0d53ae9245939e8c13e3a5b9633672094c564f4ea836294016b1af97cdc4 |
| CLIENT_TEXT_E2E_A1_FINAL_2_REPORT_2026-09-07.md | 4144 | 2e38bbfb91b0783bfd95111f2f71097fd77f3810da92c308c1ac88e09663db94 |
| CLIENT_TEXT_E2E_A2_R0_BACKEND_PRODUCT_CONTRACT_REPORT_2026-09-07.md | 9185 | d496a88c7049c296bc64b834adacb5faad35e9a1e03b90ffc86657eac583ce51 |
| CLIENT_TEXT_E2E_A2_R2_REPORT_2026-09-07.md | 6782 | 18c6903d1cb828376302a1fb080a542eac82d97914e0ea19f8755704055467f1 |
| CLIENT_TEXT_E2E_A2_FINAL_1_REPORT_2026-09-07.md | 6834 | 7f9c73e9c625fe47ce83f4a1283e671c9f66d41fd4ad18728d49957c6f89ff0e |
| CLIENT_TEXT_E2E_A2_FINAL_2_REPORT_2026-09-07.md | 6955 | 1ac1e10dc343d9ae4d983dec934081144f03fdeab2dc4ed829dadc964309a8ab |
| CLIENT_TEXT_E2E_A2_R3_REPORT_2026-09-07.md | 8325 | 3ba8e7e05be433f71ed3f9729ae125356a5548dc26e6eaea70cbd503d8f6d797 |
| CLIENT_TEXT_E2E_A2_R4_REPORT_2026-09-07.md | 6888 | be76cb187bbabaa53bbf46f02145804da27133caaca5d1d6a5c720687b42c98a |
| CLIENT_TEXT_E2E_A2_FINAL_3_REPORT_2026-09-07.md | 6901 | 075c787147a771f305192be5ab93b172a5559086a537f0821bec2c92c9d9bab9 |
| CLIENT_TEXT_E2E_R1_REPORT_2026-09-07.md | 4338 | c874512cb8fcd3fee2103b7d122eb69d56c6b541749be4747fddadc93ddc308f |

Cross-repo reports (referenced, hashes protect against silent mutation):

| File (path) | bytes | sha256 |
| ----------- | ----- | ------ |
| ~/glm-workspace/RD1_R10_FINAL_5_CANONICAL_RESEARCH_DESK_ACCEPTANCE_REPORT.md | 4105 | 3117e4687da506e24c2985f6e010da94e6f1ad7c0f75c7e58d094984d1a4fd6a |
| ~/glm-workspace/RD1_CLOSURE_LINEAGE_AUTHORITY_XAUDIT_A1_2026-09-07.md | 23569 | 05662cfb128d1769781e728f3b3b9292a8acf7ac5a347a7a2925078dd728ee96 |
| julia_rd1_controlled/metadata/assistant-r3-c2-jsonobject-v1.file-manifest.sha256 | — | 7d917cc20567de5e4a3e1ddc39b963dedc43d85bdd82d1788cc817c7e33f6200 |

## 7. FINAL-3 acceptance identity (frozen)

conversation: conv_e8e4f62fe78c4eaf98f145e5477c764f
turn: 050c89e7-55c9-47bb-b915-8c74383f5bc3
event_id = 215257
envelope digest = e18e908fe380478a4522358a047df792421d7cbe523245c6002ef471392da991
nested brief digest = f29a3f4c9271a38c29075a91f4eec329ba305e57bcadab9b13db51f936743ab1

## 8. Contaminated historical conversation (frozen record)

FINAL-2 conversation conv_02e70cd874ca43fda8790ac79db51989:
FINAL_2_ACCEPTANCE_PRE_POLLUTION_EVIDENCE = VALID
CONVERSATION_LATER_CONTAMINATED = YES (7 human-keyboard turns 15:47-15:51, 2026-09-07)
USED_FOR_FINAL_3 = NO
Not deleted or rewritten; read-only historical evidence only.

## 9. Governance provenance

Manifest SHA256 (of this file at freeze commit):
(recorded in the governance commit message / git tree)

FINAL LAW: tags never move. Any correction creates
m1-text-research-continuity-v2. M1 ends here; Voice begins from M1.
