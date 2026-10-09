// Telemetría del servidor: estado (GET /api/telemetry/status) y valoración de respuestas (POST /api/feedback).
import { apiFetch } from './http';
import { IS_API } from './mode';

let status = null;

/** true si el servidor registra ejecuciones (Telemetry__ConnectionString). Se consulta una vez. */
export function telemetryEnabled() {
  if (!IS_API) return Promise.resolve(false);
  status ??= apiFetch('/api/telemetry/status').then((r) => r.json()).then((s) => Boolean(s.enabled)).catch(() => {
    status = null;
    return false;
  });
  return status;
}

/** @param {string} runId @param {1|-1} rating */
export async function sendFeedback(runId, rating, { tags = [], comment = null } = {}) {
  return (await apiFetch('/api/feedback', { method: 'POST', body: { runId, rating, tags, comment } })).json();
}
