// Log y traza de cada respuesta, igual que en workflow-agent-api: cada evento SSE es una entrada del log
// (los deltas de texto y razonamiento se fusionan) y la traza resume tokens y llamadas a herramientas.

/** Tope por entrada y por turno al guardar el chat (el log completo queda en la telemetría del servidor). */
export const MAX_ENTRY_CHARS = 4000;
export const MAX_LOG_CHARS = 120000;

/**
 * Añade un evento SSE al log del turno.
 * @param {object[]} entries entradas del turno (se modifica)
 * @param {string} type tipo de evento SSE
 * @param {object} d datos del evento (con `t`, ms desde el inicio)
 */
export function capture(entries, type, d = {}) {
  const last = entries.at(-1);
  const push = (e) => entries.push({ t: d.t ?? null, ...e });
  const delta = (k) => {
    if (last && last.k === k && !last.closed) last.text += d.delta ?? '';
    else push({ k, text: d.delta ?? '' });
  };
  const close = () => { if (last && (last.k === 'text' || last.k === 'think')) last.closed = true; };
  switch (type) {
    case 'status': close(); return push(d.phase ? { k: 'phase', text: d.label } : { k: 'status', text: d.message ?? d.label ?? '' });
    case 'request': close(); return push({ k: 'request', ...strip(d) });
    case 'block': return close();
    case 'thinking': return delta('think');
    case 'text': return delta('text');
    case 'tool_use_start': close(); return push({ k: 'tool_prep', tool: d.tool });
    case 'tool_call': close(); return push({ k: 'tool_call', tool: d.tool, input: d.input });
    case 'tool_result': close(); return push({ k: 'tool_result', tool: d.tool, ms: d.durationMs, isError: Boolean(d.isError), result: d.result ?? d.preview ?? '' });
    case 'turn_end': close(); return push({ k: 'turn_end', ...strip(d) });
    case 'done': close(); return push({ k: 'done', status: d.status, usage: d.usage, ms: d.elapsedMs });
    case 'error': close(); return push({ k: 'error', text: d.error });
    default: return undefined;
  }
}

const strip = ({ t, ...rest }) => rest;
const indent = (s) => String(s ?? '').split('\n').map((l) => `    | ${l}`).join('\n');
export const fmtT = (ms) => (ms == null ? '      ' : `+${(ms / 1000).toFixed(2)}s`);

export function entryLabel(e) {
  switch (e.k) {
    case 'phase': return `fase: ${e.text}`;
    case 'status': return `estado: ${e.text}`;
    case 'request': return `solicitud: proveedor=${e.provider ?? 'anthropic'} modelo=${e.model} esfuerzo=${e.effort ?? 'n/a'}${e.fallback ? ` respaldo=${e.fallback}` : ''} max_tokens=${e.maxTokens} max_iteraciones=${e.maxIterations} prompt_sistema=${e.systemChars} caracteres herramientas=[${(e.tools || []).join(', ')}]`;
    case 'think': return 'razonamiento';
    case 'text': return 'respuesta del modelo';
    case 'tool_prep': return `preparando herramienta: ${e.tool}`;
    case 'tool_call': return `herramienta -> ${e.tool}`;
    case 'tool_result': return `herramienta <- ${e.tool} (${e.ms} ms${e.isError ? ', ERROR' : ''})`;
    case 'turn_end': return `fin de iteración ${e.iteration}: stop=${e.stopReason}${e.servedBy ? ` servido_por=${e.servedBy}` : ''} tokens entrada/salida/cacheLeida/cacheCreada=${e.inputTokens}/${e.outputTokens}/${e.cacheReadTokens}/${e.cacheCreationTokens} duración=${e.ms} ms`;
    case 'done': return `completado: estado=${e.status ?? 'ok'} tokens entrada/salida=${e.usage?.inputTokens ?? 0}/${e.usage?.outputTokens ?? 0} total=${e.ms} ms`;
    case 'error': return `ERROR: ${e.text}`;
    default: return e.k;
  }
}

/** Cuerpo largo de la entrada (razonamiento, texto, entrada o resultado de herramienta) o null. */
export function entryBody(e) {
  if (e.k === 'think' || e.k === 'text') return e.text;
  if (e.k === 'tool_call') return JSON.stringify(e.input, null, 2);
  if (e.k === 'tool_result') return e.result;
  return null;
}

export function entryText(e) {
  const body = entryBody(e);
  return `[${fmtT(e.t)}] ${entryLabel(e)}${body != null ? `\n${indent(body)}` : ''}`;
}

const turnHeader = (turn, n) => `=== Turno ${n} · ${turn.askedAt ? new Date(turn.askedAt).toISOString() : ''} · modelo=${turn.model ?? 'por defecto'} · esfuerzo=${turn.effort ?? 'n/a'}${turn.runId ? ` · ejecución=${turn.runId}` : ''} ===\nPetición: ${turn.question}`;

export const turnLogText = (turn, n = 1) => `${turnHeader(turn, n)}\n${(turn.log ?? []).map(entryText).join('\n')}`;

export const conversationLogText = (turns) => turns.filter((t) => t.kind !== 'report').map((t, i) => turnLogText(t, i + 1)).join('\n\n');

export function traceText(turn) {
  const u = turn.usage ?? {};
  const head = `Tokens: entrada ${u.inputTokens ?? 0} · salida ${u.outputTokens ?? 0} · caché leída ${u.cacheReadTokens ?? 0} · caché creada ${u.cacheCreationTokens ?? 0} · ${turn.iterations ?? '?'} iteraciones · ${turn.elapsedMs ?? 0} ms${turn.servedBy ? ` · servido por ${turn.servedBy}` : ''}`;
  const calls = (turn.toolCalls ?? []).map((c, i) => `${i + 1}. ${c.tool} (${c.durationMs} ms${c.isError ? ', ERROR' : ''})\n   entrada: ${JSON.stringify(c.input)}\n   resultado: ${c.resultPreview ?? ''}`);
  return [head, ...(calls.length ? calls : ['Sin llamadas a herramientas.'])].join('\n');
}

/** Petición, respuesta, SQL, traza y log de toda la conversación (Markdown). */
export function fullReportText(turns) {
  return turns.filter((t) => t.kind !== 'report').map((t, i) => [
    `# Turno ${i + 1}`,
    `- Fecha: ${t.askedAt ? new Date(t.askedAt).toISOString() : ''}\n- Modelo: ${t.model ?? 'por defecto'}\n- Esfuerzo: ${t.effort ?? 'n/a'}\n- Estado: ${t.status}${t.runId ? `\n- Ejecución: ${t.runId}` : ''}`,
    `## Petición\n${t.question}`,
    `## Respuesta\n${t.answer ?? ''}`,
    t.queries?.length ? `## SQL\n${t.queries.map((q) => `\`\`\`sql\n${q}\n\`\`\``).join('\n')}` : null,
    `## Traza\n${traceText(t)}`,
    `## Log\n${(t.log ?? []).map(entryText).join('\n')}`,
  ].filter(Boolean).join('\n\n')).join('\n\n---\n\n');
}

/** Recorta el log para guardarlo con el chat: textos largos por entrada y un tope total por turno. */
export function capLog(entries = []) {
  let total = 0;
  const out = [];
  for (const e of entries) {
    const c = { ...e };
    delete c.closed;
    for (const k of ['text', 'result']) {
      if (typeof c[k] === 'string' && c[k].length > MAX_ENTRY_CHARS) c[k] = `${c[k].slice(0, MAX_ENTRY_CHARS)}… [recortado]`;
    }
    total += JSON.stringify(c).length;
    if (total > MAX_LOG_CHARS) {
      out.push({ t: c.t, k: 'status', text: 'Log recortado al guardar el chat. El detalle completo está en Historial y métricas.' });
      break;
    }
    out.push(c);
  }
  return out;
}

/**
 * Ejecución guardada en la telemetría (GET /api/telemetry/runs/{id}, columnas de la tabla runs) con la forma de un
 * turno del chat, para reutilizar las vistas de Traza y Log.
 */
export function turnFromRun(run) {
  const entries = [];
  for (const ev of Array.isArray(run.events) ? run.events : []) {
    if (ev.k === 'thinking' || ev.k === 'text') entries.push({ t: ev.t ?? null, k: ev.k === 'thinking' ? 'think' : 'text', text: ev.text ?? '' });
    else if (ev.k === 'truncated') entries.push({ t: ev.t ?? null, k: 'status', text: ev.text ?? 'Log recortado.' });
    else capture(entries, ev.k, ev);
  }
  return {
    id: run.id, runId: run.id, question: run.question ?? '', answer: run.answer ?? '', status: run.status,
    askedAt: run.created_at ? Date.parse(run.created_at) : null, model: run.model, modelLabel: run.model, effort: run.effort,
    servedBy: null, iterations: run.iterations, elapsedMs: run.elapsed_ms, queries: Array.isArray(run.sql_queries) ? run.sql_queries : [],
    usage: {
      inputTokens: run.input_tokens, outputTokens: run.output_tokens,
      cacheReadTokens: run.cache_read_tokens, cacheCreationTokens: run.cache_creation_tokens,
    },
    toolCalls: Array.isArray(run.trace) ? run.trace : [],
    log: entries.concat(run.error ? [{ t: null, k: 'error', text: run.error }] : []),
  };
}
