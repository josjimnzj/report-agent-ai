// Reportes publicados con enlace (token y caducidad). Gestión con la API key; lectura pública sin clave.
import { API_URL, apiFetch } from './http';

// Dónde se abre el enlace: VITE_PUBLIC_URL si se define; si la API está en otro dominio, ese dominio (la imagen de
// Docker sirve la SPA en /); si no, este mismo front. Dentro del CEM el front va detrás del login y no serviría.
const PUBLIC_BASE = String(import.meta.env.VITE_PUBLIC_URL ?? '').trim().replace(/\/+$/, '');

/** URL completa del enlace público: …/p/{token}. */
export function publicUrl(token) {
  if (PUBLIC_BASE) return `${PUBLIC_BASE}/p/${token}`;
  if (/^https?:\/\//.test(API_URL)) return `${API_URL}/p/${token}`;
  return new URL(`${import.meta.env.BASE_URL}p/${token}`, window.location.origin).href;
}

export const publicationsApi = {
  /** { reportId, title, expiresAt, filters, result } → { id, token, path, expiresAt, createdAt } */
  async create(body) {
    return (await apiFetch('/api/publications', { method: 'POST', body })).json();
  },
  /** Cambia título, caducidad o filtros sin cambiar el enlace. */
  async update(id, patch) {
    return (await apiFetch(`/api/publications/${id}`, { method: 'PATCH', body: patch })).json();
  },
  async revoke(id) {
    try {
      await apiFetch(`/api/publications/${id}`, { method: 'DELETE' });
    } catch (err) {
      if (!/404/.test(err.message)) throw err; // ya no existía
    }
  },
  /**
   * Lectura pública: sin API key. Devuelve { ok, status, data | error }.
   * 404 = no existe o revocado; 410 = caducado.
   */
  async view(token) {
    let res;
    try {
      res = await fetch(`${API_URL}/api/public/reports/${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } });
    } catch {
      return { ok: false, status: 0, error: 'No se pudo conectar con el servidor. Si acaba de despertar, vuelve a intentarlo en un minuto.' };
    }
    let body = null;
    try { body = await res.json(); } catch { /* sin cuerpo */ }
    if (res.ok) return { ok: true, status: res.status, data: body };
    const fallback = res.status === 429 ? 'Demasiadas consultas seguidas; espera un minuto.' : `Error ${res.status} del servidor.`;
    return { ok: false, status: res.status, error: body?.error || fallback };
  },
};
