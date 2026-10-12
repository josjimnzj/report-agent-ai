// Dictado por voz: ¿el servidor tiene Whisper en Groq? (GET /api/dictation). En modo maqueta solo hay motor del navegador.
import { API_URL, apiFetch, authHeaders } from './http';
import { IS_API } from './mode';

let status = null;

/** { groq, maxBytes }. Se consulta una vez por sesión; si falla, se reintenta la próxima vez. */
export function dictationStatus() {
  if (!IS_API) return Promise.resolve({ groq: false, maxBytes: 0 });
  status ??= apiFetch('/api/dictation').then((r) => r.json()).catch(() => {
    status = null;
    return { groq: false, maxBytes: 0 };
  });
  return status;
}

export const TRANSCRIBE_URL = `${API_URL}/api/transcribe`;
export { authHeaders };
