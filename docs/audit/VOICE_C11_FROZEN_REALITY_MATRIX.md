# Voice C-11 Frozen Contract Reality Matrix

**Date:** 2026-08-10
**Contract:** C-11 Voice / Media `29b2198` — FROZEN
**Voice baseline:** `79f0148` on `feature/voice-c1b-workspace-reconcile`
**Mode:** READ-ONLY cross-repository reality audit
**Write boundary:** Voice/S2S findings are for the Voice owner; Codex modifies Electron only.

## 1. Summary

| Concern | Current reality | Verdict |
|---|---|---|
| Electron owns media | Voice frontend owns mic/audio worklets; no PCM through Electron IPC | COMPLIANT |
| ASR interim/final | Interim updates one workspace item; final marks user turn exportable | COMPLIANT |
| Voice conversation authority | Durable delta commits through Core; workspace is ephemeral | COMPLIANT / TRANSITIONAL |
| Context bootstrap | Electron transports last 10 canonical turns into S2S `conversation.item.create` | C1B COMPATIBILITY; NOT C-11 final architecture |
| Voice-specific instructions | Local `DEFAULT_INSTRUCTIONS`, user-stored instructions and tool hint enter S2S directly | VIOLATION C-03/C-09/C-11 |
| TTS render-only | Audio rendering is media-owned | COMPLIANT |
| Actually emitted content | Response is marked audible when audio delta is received/buffered, not when mapped audio/text is actually played | VIOLATION / MISSING BOUNDARY |
| Completion separation | `response.done` can occur while playback buffer is still draining | PARTIAL GAP |
| Barge-in | Speech start clears playback queue and does not delete canonical history directly | PARTIAL COMPLIANT |
| Interrupted transcript | Workspace stores full available response transcript as interrupted, not played-content prefix | VIOLATION C-11 §8 |
| Media session identity | S2S session ID is distinct from logical conversation/workspace ID | COMPLIANT |
| Reconnect | New S2S connection can bootstrap again; no provider session is durable authority | TRANSITIONAL |
| Tool calls | Browser declares, executes and returns web/camera tool results directly | VIOLATION C-08/C-11 §19 |
| Media retry identity | Stable workspace turn IDs exist; ASR/TTS/playback retry correlation is incomplete | GAP/UNKNOWN |
| Audio provenance | User recording/item ID exists; complete speech/message/provider/interruption provenance is absent | GAP |

## 2. ASR boundary

Evidence:

```text
conversation.item.input_audio_transcription.delta
→ transcript partial=true
→ same itemId updates VoiceWorkspace

conversation.item.input_audio_transcription.completed
→ transcript partial=false
→ user turn becomes final/exportable
```

This correctly prevents interim revisions from becoming multiple exported canonical turns.

Remaining characterization: final ASR retry/reconnect must preserve the same logical turn rather than generate a duplicate.

## 3. Assistant semantic text vs TTS/playback

Current layers are observable but not fully correlated:

```text
assistant transcript delta/done
response audio delta
worklet audio queue
global played-frame counter
response.done
```

The worklet reports total played frames globally, without `response_id` or text/audio alignment. `_audibleResponses` is set when an audio delta arrives and is queued. Therefore current `audible=true` means approximately "audio received/buffered", not "specific semantic content actually rendered by the speaker".

On cancellation, `VoiceWorkspace.onResponseFinished()` stores the available full transcript with `status=interrupted`. This does not satisfy C-11's actually-emitted prefix rule.

## 4. Barge-in reality

On `input_audio_buffer.speech_started`:

```text
playback worklet queue → clear
ai-speaking flag       → false
new user turn          → started
```

Positive boundary: playback cancellation does not directly mutate Core history.

Missing boundary:

- response/text/audio playback correlation;
- exact played prefix at clear time;
- explicit distinction between playback interruption and cognition cancellation;
- canonical interrupted message content based on actual emission.

## 5. Voice tool route — contract violation

Current frontend:

```text
declares web_search/camera_snapshot tools
adds a hidden tool-use instruction
receives provider-native tool call
executes web/camera in browser
sends function_call_output directly
requests provider continuation
```

This bypasses C-08 authorization, evidence, Context OS reinjection, and same-turn Core runtime governance. It must be dispositioned by the Voice/Core owner. Codex must not repair this inside Electron.

## 6. Voice context route — compatibility only

Current Electron-hosted flow:

```text
Core canonical GET
→ Electron transports messages
→ Voice selects last 10 user-boundary turns
→ conversation.item.create into S2S provider session
```

This is bounded and non-durable, but C-11 §12 now freezes the target as:

```text
Context OS
→ CognitiveContextPackage
→ Alignment
→ Voice-capable ModelProvider
```

The current bootstrap must remain marked compatibility and cannot become permanent Voice context policy.

## 7. Required Voice-owner questions are now frozen answers

| Earlier question | C-11 answer | Current implementation impact |
|---|---|---|
| Can interim ASR enter canonical history? | No | Current workspace is compliant |
| Is full generated/TTS text the interrupted fact? | No; actually emitted content only | Current implementation fails |
| Does audio receipt mean played? | No | `_audibleResponses` is insufficient |
| Does barge-in delete/cancel cognition automatically? | No | Playback clear is okay; state correlation incomplete |
| May S2S session own continuity? | No | Current session is ephemeral; bootstrap remains compatibility |
| May Voice execute native tools directly? | No | Current web/camera path fails C-08/C-11 |
| May Voice inject its own persona/instructions? | No | Current local instructions/tool hint fail C-03/C-09/C-11 |

## 8. Ownership disposition

### Codex / Electron

- Render Core canonical interrupted messages.
- Keep Electron media ownership at zero.
- Preserve conversation/turn IDs and canonical reconcile.
- Do not infer actually emitted text locally.

### Voice owner / Claude

- Implement media-grounded emitted-content boundary.
- Separate generated, synthesized, buffered, and played lifecycles.
- Normalize Voice tools through C-08.
- Remove direct Voice persona/context/instruction authority.
- Replace compatibility bootstrap when Core Context OS Voice package is production-bound.

## 9. Gate

```text
C-11 frozen reality review          PASS
Electron-owned compliance patches   IDENTIFIED
Voice-owner gaps                     REGISTERED
Voice/S2S files modified             0
Core/Brain files modified            0
```
