# Electron V2 Voice Shell Validation

## Commit under test

```text
a0611a4 feat: initialize Julia Electron V2 shell
```

## Date

```text
2026-08-08
```

## Reference

```text
Safari + existing HF Web Voice
http://localhost:7860
ws://localhost:8765
```

## Electron under test

```text
Electron V2 Clean Shell
BrowserWindow -> http://localhost:7860
```

## Voice Core

```text
Canonical VAD = 800ms
HF S2S unchanged
faster-whisper unchanged
Julia Brain unchanged
Qwen3-TTS unchanged
```

## E0 — Electron Chromium Compatibility

```text
PASS
```

Confirmed:

```text
Electron main              PASS
Renderer                   PASS
Audio service              PASS
Video capture service      PASS
http://localhost:7860      PASS
macOS mic permission       PASS
HF page                    PASS
Voice input                PASS preliminary
WebSocket                  PASS implied by successful call
STT                        PASS
Julia response             PASS
TTS                        PASS
Code changes               0
Voice Core changes         0
```

## E1 — 5-turn smoke

```text
PASS
```

Covered:

```text
T1 ordinary short utterance           PASS
T2 ordinary short utterance           PASS
T3 longer Chinese + natural breathing PASS
T4 500-800ms thinking pause           PASS
T5 barge-in                           PASS
```

## E1 — 20-turn regression

```text
PASS
```

Covered:

```text
5 × ordinary short utterance
5 × longer Chinese / natural breathing
4 × thinking pause
3 × multi-segment expression
3 × barge-in
```

## Results

```text
obvious interruption        0
obvious truncation          0
STT failure                 0
missing Julia response      0
TTS discontinuity           0
echo/self-input             0
barge-in regression         0
WebSocket fatal error       0
```

## Code changes during test

```text
0
```

## Known observation

```text
E0-ENV-001
sandbox launch SIGABRT
severity P3
classification: environment / launch-context specific
normal GUI launch PASS
no fix required
```

## Scope not covered

This validation does NOT cover:

```text
legacy conversation migration
persistence/search
avatar
latency optimization
local LLM replacement
```

## Conclusion

```text
Clean Shell + existing HF Web Voice architecture validated.
Electron V2 Voice Shell is a baseline candidate.
```
