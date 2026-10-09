// Acceso HTTP al backend AD.Data.Assistant.Api. La clave va en el bundle (solo detrás de la sesión del CEM).
// Sin valor: la API está en el mismo servidor que el front y las llamadas van a /api.
// También acepta una URL completa, una ruta (/agent, proxy de Vite) o solo el host.
const rawUrl = String(import.meta.env.VITE_DATA_API_URL ?? '').trim().replace(/\/+$/, '');
export const API_URL = !rawUrl || /^(https?:)?\/\//.test(rawUrl) || rawUrl.startsWith('/') ? rawUrl : `https://${rawUrl}`;
const API_KEY = import.meta.env.VITE_DATA_API_KEY || '';

export const authHeaders = () => (API_KEY ? { 'X-Api-Key': API_KEY } : {});

export async function apiFetch(path, { method = 'GET', body, signal, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: { ...authHeaders(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error('No se pudo conectar con el servidor del asistente. Si está en el plan gratuito de Render puede tardar ~1 minuto en despertar.');
  }
  if (!res.ok) throw new Error(await errorMessage(res));
  return res;
}

export async function errorMessage(res) {
  let detail = '';
  try { detail = (await res.json())?.error ?? ''; } catch { /* sin cuerpo JSON */ }
  if (res.status === 401) return 'El servidor rechazó la clave de acceso (VITE_DATA_API_KEY).';
  return detail || `Error ${res.status} del servidor.`;
}
