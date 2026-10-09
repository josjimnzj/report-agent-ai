// Implementación en duro del cliente del agente de datos. Emite la misma secuencia de eventos
// que el SSE de POST /api/agent/query/stream (status… → done) y devuelve el payload de `done`,
// para que la fase 3 solo cambie este módulo por el cliente real.

import { MOCK_PHASES, SALES_COLUMNS, SALES_QUERIES, SALES_ROWS } from '@/mocks/salesByBranch';
import { MODELS_RESPONSE } from '@/mocks/models';
import { buildReport, fmtPct, topBranches } from '@/shared/salesReport';

const wait = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(t);
    reject(new DOMException('Consulta detenida', 'AbortError'));
  }, { once: true });
});

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function answerFor(question) {
  const q = question.toLowerCase();
  const report = buildReport(SALES_COLUMNS, SALES_ROWS, { months: 6 });

  if (q.includes('rentabilidad')) {
    return {
      answer: 'La base del CEM no registra costos ni márgenes por sucursal, así que no se puede calcular la rentabilidad. '
        + 'Te muestro las ventas ganadas, que es lo que sí está disponible.',
      branches: null,
    };
  }
  if (q.includes('creció') || q.includes('crecio')) {
    const best = [...report.branchStats].sort((a, b) => b.growth - a.growth)[0];
    return {
      answer: `${best.name} es la sucursal que más creció: entre ${report.range.from} y ${report.range.to} su venta mensual aumentó ${fmtPct(best.growth, 1)}.`,
      branches: null,
    };
  }
  if (q.includes('principales')) {
    const top = topBranches(report, 3);
    return { answer: `Las 3 sucursales con más ventas son ${top.join(', ')}.`, branches: top };
  }
  if (q.includes('anterior') || q.includes('compara')) {
    const k = report.kpis[0];
    return {
      answer: `Frente a los 6 meses anteriores las ventas variaron ${k.delta >= 0 ? '+' : ''}${fmtPct(k.delta, 1)} y la conversión ${report.kpis[2].delta >= 0 ? 'subió' : 'bajó'} ${Math.abs(report.kpis[2].delta * 100).toFixed(1)} pp.`,
      branches: null,
    };
  }
  return {
    answer: 'Se analizaron las ventas por sucursal de los últimos 6 meses con sus principales indicadores, tendencias y participación.',
    branches: null,
  };
}

/** GET /api/models */
export async function getModels() {
  await wait(250);
  return structuredClone(MODELS_RESPONSE);
}

// La simulación tarda más con más esfuerzo y menos con los modelos rápidos.
const EFFORT_FACTOR = { low: 0.6, medium: 0.8, high: 1, xhigh: 1.3, max: 1.6 };
const MODEL_FACTOR = { 'claude-sonnet-5-5': 0.8, 'claude-haiku-4-5': 0.5, 'claude-fable-5-1': 1.2, 'gemini-2.5-flash': 0.7, 'gemini-2.5-flash-lite': 0.5 };

/**
 * @param {{ question: string, conversationId?: string|null, model?: string, effort?: string|null }} body
 * @param {{ signal?: AbortSignal, onEvent?: (e: object) => void }} [opts]
 */
export async function streamQuery(body, { signal, onEvent = () => {} } = {}) {
  const started = performance.now();
  const factor = (EFFORT_FACTOR[body.effort] ?? 1) * (MODEL_FACTOR[body.model] ?? 1);
  for (const phase of MOCK_PHASES) {
    onEvent({ type: 'status', phase: phase.id, label: phase.label, at: performance.now() });
    await wait(Math.round(phase.ms * factor), signal);
  }
  const { answer, branches } = answerFor(body.question);
  const done = {
    conversationId: body.conversationId || newId(),
    status: 'ok',
    answer,
    columns: SALES_COLUMNS,
    rows: SALES_ROWS,
    queries: SALES_QUERIES,
    view: { branches },
    toolCalls: 3,
    usage: { inputTokens: 0, outputTokens: 0 },
    elapsedMs: Math.round(performance.now() - started),
    runId: newId(),
    // Como el agente real: «muéstramelo en el reporte» abre Resultados.
    openReport: /\b(reporte|gr[aá]fic[ao]|tablero|dashboard)\b/i.test(body.question),
    askChart: false,
  };
  onEvent({ type: 'done', data: done, at: performance.now() });
  return done;
}
