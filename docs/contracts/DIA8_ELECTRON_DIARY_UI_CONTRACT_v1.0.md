# STORAGE-DIA-8-R0 — Electron Diary UI Contract v1.0

**Status:** CONTRACT (pre-implementation freeze)
**Date:** 2026-08-21
**Program:** Julia Diary — Electron UI (projection layer)
**Authority chain:** Core frozen chain → Electron projection layer → human interaction
**Basis:** DIA-5B/6/7 frozen authority + Electron `conversation-store.js` projection pattern

---

## 0. Iron Rule

```text
UI may display.
UI may request.
UI may not decide.
```

Electron is a **projection layer** between the frozen Core authority chain and the human. It exposes operations without ever re-acquiring authority over truth.

---

## 1. UI ≠ Authority (three verbs)

| Verb | Allowed? | Meaning |
|---|---|---|
| `display` | ✅ | render Core-provided context (disposable projection) |
| `request` | ✅ | issue retrieval / reflection requests into the frozen chain |
| `decide` | ❌ | truth, admission, acceptance, memory formation |

**Forbidden (electron must never):**

```
Electron → modify diary json
Electron → call LLM directly + save result
Electron → DiaryRepository.write / append_accepted
Electron → treat its local cache as canonical diary truth
```

---

## 2. Browse Chain (reuses DIA-7)

```
DiaryRepository
   ↓
DiaryContextSource (ranking)
   ↓
DiaryContextBridge (projection)
   ↓
ContextBlock (admission)
   ↓
Electron projection (disposable)
```

The UI must **not** bypass to `DiaryRepository.list_entries()` and render raw storage. `Stored ≠ Visible` (W3-A5-I01) — the UI is not a raw storage viewer. Electron projection metadata carries `authority: 'disposable_projection'` / `non_canonical` (reuse the conversation-store pattern).

---

## 3. Reflect Chain (walks the frozen chain)

```
User reflection intent (UI request)
   ↓
GenerationInput (5B)
   ↓
DiaryCandidate (5B)
   ↓
GovernanceDecision (DIA-6)
   ↓
AcceptedDiaryEntry (DIA-6)
   ↓
Repository.append_accepted (persistence)
```

`User intent ≠ accepted truth` — clicking "reflect" does **not** save a diary. The reflection request walks the full frozen chain, no shortcut.

---

## 4. RED-UI Sabotage Matrix (6)

| # | RED | Attack | Expected |
|---|---|---|---|
| RED-UI-01 | Direct persistence bypass | renderer → repository write | fail closed — no write path from UI |
| RED-UI-02 | UI state becomes canonical | conversation-store/cache treated as diary truth | UI cache always disposable |
| RED-UI-03 | Browse-to-memory escalation | open diary → LLM summary → memory write | zero persistence on browse |
| RED-UI-04 | Reflection bypass | button click → LLM → accepted diary | must walk 5B → DIA-6 chain |
| RED-UI-05 | Provider-driven UI truth | provider returns different interpretation → UI saves | provider only renders |
| RED-UI-06 | Offline cache resurrection | stale local cache displayed as current truth | cache availability ≠ truth availability |

---

## 5. Acceptance (pre-implementation)

- [ ] UI has display + request surface only, no decide surface
- [ ] no UI path to `DiaryRepository.write` / `append_accepted`
- [ ] browse goes through DiaryContextSource → ContextBlock, not raw list_entries render
- [ ] reflect request walks 5B → DIA-6 chain, no shortcut
- [ ] UI cache marked disposable/non-canonical, never canonical
- [ ] offline cache never displayed as current truth
- [ ] RED-UI-01..06 each has a sabotage test
