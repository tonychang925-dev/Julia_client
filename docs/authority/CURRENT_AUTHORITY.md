# Julia Electron Current Authority

STATUS: CANONICAL
UPDATED: 2026-08-11
REPOSITORY: Julia_client
LOCAL PATH: /Users/admin/julia_electron_v2
ROLE: Electron desktop client for Julia Voice/Text interaction
AUTHORITATIVE BRANCH: codex/bugfix/electron-c10-c11-projection
AUTHORITATIVE COMMIT AT CLOSEOUT: 139983cffa41402b307e03ade56acd16487e5209 plus this CC-1 successor commit

## Repository identity

This is the active production/development Electron repository.

Remote:

- `https://github.com/tonychang925-dev/Julia_client.git`

DO-NOT-USE AS PRODUCTION AUTHORITY:

- local `/Users/admin/julia_electron`
- remote `tonychang925-dev/julia_electron`

The old `julia_electron` repository is legacy/historical and must not be used for RMD-3G/RMD-4 production work unless Tony explicitly re-authorizes it.

## Current production/development status

- Electron connects to S2S `:8765` for realtime Voice.
- S2S is now production-supervised on AutoDL.
- Electron should treat S2S startup as potentially long-running and should not classify model cold-start as permanent failure without retry/readiness UX.
- CC-1 canonical conversation convergence is in force for Electron: Text and Voice attach to the same Core/ConversationRuntime conversation identity.

## Authoritative docs

CANONICAL:

- `docs/architecture.md`
- `docs/contracts/Julia-Conversation-Domain-Contract-v1.md`
- `docs/adrs/ADR-UI-001-mutually-exclusive-text-voice-surfaces.md`
- `docs/adrs/ADR-UI-002-voice-microphone-lifecycle.md`
- this file

DERIVED / HISTORICAL AUDIT EVIDENCE:

- `docs/audit/*`
- `docs/e1-validation.md`

## Current production code paths

ACTIVE:

- Electron main process / app bootstrap under the current committed source tree
- active realtime Voice client path that connects to S2S `ws://<host>:8765/v1/realtime`
- active UI path under `src/`, `app/`, `frontend/`, or project-specific equivalent in this repository
- CC-1 Voice binding path: Electron sends the active canonical `conversation_id` to Voice and never uploads copied Voice history back to Core
- Core/ConversationRuntime projection sync: Electron may refresh canonical messages for display, but this is not conversation authority

LEGACY / RETIREMENT TARGETS:

- old workspace/bootstrap semantic authority paths: RETIRED by CC-1; do not reintroduce message snapshot bootstrap into Voice
- client-owned history authority: RETIRED by CC-1; Electron local cache is display/projection only
- Voice external-turn commit path: DEPRECATED SAFETY FENCE ONLY; if invoked, it rejects instead of writing `/external-turns`
- any old LiveKit-only path not referenced by current Voice architecture

## Open remediation items

- RMD-4 will remove any remaining transitional protocol/client authority after RMD-3G LIVE closes.
- Add explicit S2S STARTING/READY reconnect UX if not already complete.
- Remove the deprecated `commitExternalTurns` IPC safety fence after all historical callers are proven absent.
- Keep `.claude-dev/` untracked; it is not production authority.
