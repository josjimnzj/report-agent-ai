// Telemetría del servidor (misma API que workflow-agent-api): estado, valoraciones, historial, métricas y exportación.
import { apiFetch } from './http';
import { IS_API } from './mode';

let status = null;

/** { enabled, lastError, retentionDays }. Se consulta una vez por sesión. */
export function telemetryStatus() {
  if (!IS_API) return Promise.resolve({ enabled: false, lastError: null, retentionDays: 0 });
  status ??= apiFetch('/api/telemetry/status').then((r) => r.json()).catch((err) => {
    status = null;
    return { enabled: false, lastError: err.message, retentionDays: 0 };
  });
  return status;
}

/** true si el servidor registra ejecuciones (Telemetry__ConnectionString). */
export const telemetryEnabled = () => telemetryStatus().then((s) => Boolean(s.enabled));

/** @param {string} runId @param {1|-1} rating */
export async function sendFeedback(runId, rating, { tags = [], comment = null } = {}) {
  return (await apiFetch('/api/feedback', { method: 'POST', body: { runId, rating, tags, comment } })).json();
}

/** Filtros del historial → query string (vacíos fuera). */
export function historyQuery(filters = {}, extra = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) {
    if (v !== '' && v !== null && v !== undefined) p.set(k, String(v).trim());
  }
  return p.toString();
}

const getJson = async (path) => (await apiFetch(path)).json();

export const getSummary = (filters) => getJson(`/api/telemetry/summary?${historyQuery(filters)}`);
export const getRuns = (filters, limit = 50, offset = 0) => getJson(`/api/telemetry/runs?${historyQuery(filters, { limit, offset })}`);
export const getFacets = () => getJson('/api/telemetry/facets');
export const getRun = (id) => getJson(`/api/telemetry/runs/${encodeURIComponent(id)}`);

/** CSV (Excel) o JSON completo con filas de muestra, eventos y traza. */
export async function exportRuns(filters, format) {
  const res = await apiFetch(`/api/telemetry/export?${historyQuery(filters, { format, detail: format === 'json' ? 1 : '' })}`);
  return res.blob();
}
