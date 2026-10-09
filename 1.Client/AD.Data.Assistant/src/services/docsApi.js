// Documentos del usuario (chats, reportes, preferencias) guardados en Neon a través de /api/docs.
// En modo maqueta no hace nada: los stores se guardan en localStorage.
import { apiFetch } from './http';
import { IS_API } from './mode';
import { $notify } from '@/shared/notify';

const plain = (doc) => JSON.parse(JSON.stringify(doc));

export const docsApi = {
  async list(collection) {
    if (!IS_API) return null;
    return (await apiFetch(`/api/docs/${collection}`)).json();
  },
  async get(collection, id) {
    if (!IS_API) return null;
    try {
      return await (await apiFetch(`/api/docs/${collection}/${encodeURIComponent(id)}`)).json();
    } catch (err) {
      if (/404/.test(err.message)) return null;
      throw err;
    }
  },
  /** Guarda sin bloquear la interfaz; si falla, avisa. */
  save(collection, doc) {
    if (!IS_API) return Promise.resolve();
    return apiFetch(`/api/docs/${collection}/${encodeURIComponent(doc.id)}`, { method: 'PUT', body: plain(doc) })
      .catch((err) => $notify.error(`No se pudo guardar en el servidor: ${err.message}`));
  },
  remove(collection, id) {
    if (!IS_API) return Promise.resolve();
    return apiFetch(`/api/docs/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .catch((err) => { if (!/404/.test(err.message)) $notify.error(`No se pudo borrar en el servidor: ${err.message}`); });
  },
};
