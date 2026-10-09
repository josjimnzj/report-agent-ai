import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capLog, capture, conversationLogText, entryText, fullReportText, MAX_ENTRY_CHARS, traceText, turnFromRun } from '../src/shared/runLog.js';

test('capture fusiona deltas por bloque y registra herramientas, fases y fin', () => {
  const log = [];
  capture(log, 'request', { t: 0, provider: 'anthropic', model: 'claude-opus-5-5', effort: 'high', maxTokens: 64000, maxIterations: 12, systemChars: 900, tools: ['schema_search', 'execute_query'] });
  capture(log, 'status', { t: 1, phase: 'interpret', label: 'Interpretando tu consulta' });
  capture(log, 'thinking', { t: 2, delta: 'Busco ' });
  capture(log, 'thinking', { t: 3, delta: 'ventas.' });
  capture(log, 'block', { t: 4, kind: 'thinking' });
  capture(log, 'thinking', { t: 5, delta: 'Otro bloque' });
  capture(log, 'tool_call', { t: 6, tool: 'execute_query', input: { query: 'SELECT 1' } });
  capture(log, 'tool_result', { t: 9, tool: 'execute_query', durationMs: 3, isError: false, result: '{"rows":[]}' });
  capture(log, 'turn_end', { t: 10, iteration: 1, stopReason: 'end_turn', inputTokens: 5, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0, ms: 9 });
  capture(log, 'done', { t: 11, status: 'ok', usage: { inputTokens: 5, outputTokens: 2 }, elapsedMs: 11 });
  capture(log, 'keepalive', { t: 12 });
  assert.deepEqual(log.map((e) => e.k), ['request', 'phase', 'think', 'think', 'tool_call', 'tool_result', 'turn_end', 'done']);
  assert.equal(log[2].text, 'Busco ventas.');
  assert.match(entryText(log[0]), /^\[\+0\.00s\] solicitud: proveedor=anthropic modelo=claude-opus-5-5 esfuerzo=high .*herramientas=\[schema_search, execute_query\]/);
  assert.match(entryText(log[4]), /herramienta -> execute_query\n {4}\| \{/);
  assert.match(entryText(log[5]), /herramienta <- execute_query \(3 ms\)\n {4}\| \{"rows":\[\]\}/);
});

test('traza, log de la conversación y reporte completo', () => {
  const turn = {
    question: 'Ventas por mes', answer: 'Subieron.', status: 'ok', model: 'm', effort: 'high', runId: 'r1', askedAt: 0,
    usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 1, cacheCreationTokens: 0 }, iterations: 2, elapsedMs: 1200,
    toolCalls: [{ tool: 'execute_query', input: { query: 'SELECT 1' }, durationMs: 7, isError: false, resultPreview: 'ok' }],
    queries: ['SELECT 1'], log: [{ t: 0, k: 'status', text: 'hola' }],
  };
  assert.match(traceText(turn), /^Tokens: entrada 10 · salida 4 · caché leída 1 · caché creada 0 · 2 iteraciones · 1200 ms\n1\. execute_query \(7 ms\)/);
  const report = { kind: 'report', question: 'Editar', log: [] };
  assert.match(conversationLogText([report, turn]), /^=== Turno 1 · .*ejecución=r1 ===\nPetición: Ventas por mes\n\[\+0\.00s\] estado: hola$/);
  assert.match(fullReportText([turn]), /## SQL\n```sql\nSELECT 1\n```[\s\S]*## Traza[\s\S]*## Log/);
});

test('capLog recorta entradas largas y el total del turno', () => {
  const long = 'x'.repeat(MAX_ENTRY_CHARS + 10);
  const capped = capLog([{ t: 0, k: 'text', text: long, closed: true }]);
  assert.ok(capped[0].text.endsWith('… [recortado]'));
  assert.equal(capped[0].closed, undefined);
  const many = Array.from({ length: 100 }, (_, i) => ({ t: i, k: 'tool_result', tool: 'x', result: long }));
  const out = capLog(many);
  assert.ok(out.length < many.length);
  assert.match(out.at(-1).text, /Log recortado/);
});

test('turnFromRun convierte una ejecución guardada en la telemetría', () => {
  const turn = turnFromRun({
    id: 'abc', question: 'q', answer: 'a', status: 'ok', model: 'm', effort: 'low', created_at: '2026-10-09T10:00:00Z',
    iterations: 1, elapsed_ms: 50, input_tokens: 3, output_tokens: 2, cache_read_tokens: 0, cache_creation_tokens: 0,
    sql_queries: ['SELECT 1'], trace: [{ tool: 't', durationMs: 1, isError: false, input: {}, resultPreview: 'r' }],
    events: [
      { t: 0, k: 'request', model: 'm' }, { t: 1, k: 'thinking', text: 'pienso' }, { t: 2, k: 'tool_result', tool: 't', durationMs: 1, result: 'r' },
      { t: 3, k: 'truncated', text: 'Log recortado al superar 300000 bytes.' },
    ],
  });
  assert.equal(turn.runId, 'abc');
  assert.equal(turn.usage.inputTokens, 3);
  assert.deepEqual(turn.log.map((e) => e.k), ['request', 'think', 'tool_result', 'status']);
  assert.equal(turn.toolCalls.length, 1);
});
