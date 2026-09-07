'use strict';
/* CLIENT-TEXT-E2E-A2-R3 — stream liveness + typed research-error transport.
 * Component tests over a local SSE harness. LOGIC_ONLY: no live Brain, no
 * canonical user turn, no renderer DOM. The harness speaks the same
 * /internal/v1/conversations/{id}/turns SSE dialect as the Brain route.
 */
const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const {
  streamTextMessage,
  parseOpenAiSseChunk,
} = require('../src/main/text-client');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sseFrame(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

// Harness: local SSE server simulating a Brain native turn stream.
function startHarness(behavior) {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && /\/turns$/.test(req.url)) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      // The real Brain (Starlette StreamingResponse) sends response headers
      // immediately, before the turn generator's silent research phase. Flush
      // headers here so the client's connect phase resolves right away and the
      // silent interval is observed under the IDLE budget (not the connect one).
      res.flushHeaders();
      (async () => {
        try {
          if (behavior.silentBeforeMs) await sleep(behavior.silentBeforeMs);
          if (behavior.holdOpen) {
            // Intentionally send nothing; the client's governed idle budget must
            // terminate the true stall (no infinite hang).
            return;
          }
          for (const frame of behavior.frames || []) {
            res.write(frame);
            if (behavior.interFrameMs) await sleep(behavior.interFrameMs);
          }
          res.end();
        } catch (_err) {
          res.destroy();
        }
      })();
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const close = () => new Promise((r) => server.close(r));
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ port: server.address().port, close });
    });
  });
}

const CONVERSATION = { conversationId: 'conv-r3-liveness', turnId: 'turn-r3-1' };

async function runTurn(port, options) {
  try {
    const result = await streamTextMessage(
      { ...CONVERSATION, input: 'hi', modality: 'text' },
      {},
      { brainEndpoint: `http://127.0.0.1:${port}`, ...options }
    );
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error };
  }
}

// ── VALID_SILENT_INTERVAL_TEST ─────────────────────────────────────────────
// A valid backend turn with a silent cognition interval > the OLD 30 s budget
// must NOT be aborted under the new governed idle contract, and must then
// complete with text + product + done.
test('r3_valid_silence_over_30s_survives_and_completes', async () => {
  const { port, close } = await startHarness({
    silentBeforeMs: 35000, // > old 30 s threshold
    frames: [
      sseFrame({ choices: [{ index: 0, delta: { content: '这是研究简报。' } }] }),
      sseFrame({ product: { contract_version: 'research.brief.v1', headline: 'Token 出海' } }),
      'data: [DONE]\n\n',
    ],
  });
  try {
    const out = await runTurn(port); // default idle contract applies (120 s)
    assert.equal(out.ok, true, out.error && out.error.message);
    assert.equal(out.result.status, 'completed');
    assert.match(out.result.content, /这是研究简报/);
    assert.equal(out.result.product.contract_version, 'research.brief.v1');
  } finally {
    await close();
  }
});

// Negative control: the OLD 30 s idle budget would abort the same valid turn.
test('r3_old_30s_idle_budget_would_have_aborted_valid_silence', async () => {
  const { port, close } = await startHarness({
    silentBeforeMs: 35000,
    frames: [sseFrame({ choices: [{ index: 0, delta: { content: 'x' } }] }), 'data: [DONE]\n\n'],
  });
  try {
    const out = await runTurn(port, { streamIdleTimeoutMs: 30000 });
    assert.equal(out.ok, false);
    assert.equal(out.error.code, 'request_timeout');
    assert.equal(out.error.phase, 'stream_idle');
  } finally {
    await close();
  }
});

// ── REAL_STALL_TIMEOUT_TEST ────────────────────────────────────────────────
// Connection established, no bytes at all → governed idle budget fires a typed
// timeout. No infinite hang.
test('r3_real_stall_still_times_out', async () => {
  const { port, close } = await startHarness({ holdOpen: true });
  try {
    const out = await runTurn(port, { streamIdleTimeoutMs: 1500, streamTotalTimeoutMs: 20000 });
    assert.equal(out.ok, false);
    assert.equal(out.error.code, 'request_timeout');
    assert.equal(out.error.phase, 'stream_idle');
  } finally {
    await close();
  }
});

// ── C2_TYPED_ERROR_PROPAGATION + PRECEDENCE ────────────────────────────────
// A terminal typed Brain SSE error (research_judgment_failed) arriving before
// the idle budget expires must surface as the exact typed error — not masked
// by an idle timeout.
test('r3_c2_judgment_failure_typed_error_not_masked_by_idle', async () => {
  const { port, close } = await startHarness({
    silentBeforeMs: 400,
    frames: [
      sseFrame({ choices: [{ index: 0, delta: { content: '[系统错误: research_judgment_failed]' }, finish_reason: 'error' }] }),
      'data: [DONE]\n\n',
    ],
  });
  try {
    const out = await runTurn(port, { streamIdleTimeoutMs: 30000 });
    assert.equal(out.ok, false);
    assert.equal(out.error.code, 'stream_semantic_error');
    assert.match(out.error.message, /research_judgment_failed/);
  } finally {
    await close();
  }
});

test('r3_brief_composition_failure_typed_error_transports', async () => {
  const { port, close } = await startHarness({
    silentBeforeMs: 200,
    frames: [
      sseFrame({ choices: [{ index: 0, delta: { content: '[系统错误: research_brief_composition_failed]' }, finish_reason: 'error' }] }),
      'data: [DONE]\n\n',
    ],
  });
  try {
    const out = await runTurn(port, { streamIdleTimeoutMs: 30000 });
    assert.equal(out.ok, false);
    assert.equal(out.error.code, 'stream_semantic_error');
    assert.match(out.error.message, /research_brief_composition_failed/);
  } finally {
    await close();
  }
});

// Resolve-phase terminal error (the instance-1 class) also stays typed.
test('r3_resolution_failure_typed_error_transports', async () => {
  const { port, close } = await startHarness({
    silentBeforeMs: 200,
    frames: [
      sseFrame({ choices: [{ index: 0, delta: { content: '[系统错误: market_event_resolution_unresolved]' }, finish_reason: 'error' }] }),
      'data: [DONE]\n\n',
    ],
  });
  try {
    const out = await runTurn(port, { streamIdleTimeoutMs: 30000 });
    assert.equal(out.ok, false);
    assert.equal(out.error.code, 'stream_semantic_error');
    assert.match(out.error.message, /market_event_resolution_unresolved/);
  } finally {
    await close();
  }
});

// Parser-level: an error frame maps to a typed error; content preserved.
test('r3_parser_error_frame_is_typed', () => {
  const parsed = parseOpenAiSseChunk(
    'data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: '[系统错误: research_judgment_failed]' }, finish_reason: 'error' }] })
  );
  assert.ok(parsed.error);
  assert.match(parsed.error, /research_judgment_failed/);
});
