// Cliente real del agente: GET /api/models y POST /api/agent/query/stream (SSE leído con fetch + ReadableStream).
import { apiFetch } from './http';
import { createSseParser } from '@/shared/sse';

export async function getModels() {
  return (await apiFetch('/api/models')).json();
}

/**
 * @param {{ question: string, conversationId?: string|null, model?: string, effort?: string|null }} body
 * @param {{ signal?: AbortSignal, onEvent?: (e: object) => void }} [opts]
 * @returns {Promise<object>} payload del evento «done»
 */
export async function streamQuery(body, { signal, onEvent = () => {} } = {}) {
  const res = await apiFetch('/api/agent/query/stream', { method: 'POST', body, signal, headers: { Accept: 'text/event-stream' } });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  let done = null;

  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    for (const { event, data } of parser.feed(decoder.decode(value, { stream: true }))) {
      let d;
      try { d = JSON.parse(data); } catch { continue; }
      const at = performance.now();
      if (event === 'status') {
        onEvent({ type: 'status', phase: d.phase ?? `msg-${d.t}`, label: d.label ?? d.message ?? '', at });
      } else if (event === 'done') {
        done = d;
        onEvent({ type: 'done', data: d, at });
      } else if (event === 'error') {
        throw new Error(d.error || 'El agente falló.');
      } else {
        onEvent({ type: event, data: d, at });
      }
    }
  }
  if (!done) throw new Error('La conexión se cerró antes de terminar la respuesta.');
  return { ...done, view: { branches: null, chart: done.chart ?? null } };
}
