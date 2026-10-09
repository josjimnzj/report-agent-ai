// Utilidades de persistencia en localStorage (Pinia + pinia-plugin-persistedstate).

export const SCHEMA_VERSION = 1;
export const MAX_SAVED_ROWS = 500;

/** Recorta un turno para guardarlo: máximo MAX_SAVED_ROWS filas y sin datos efímeros. */
export function compactTurn(turn) {
  const rows = turn.rows ?? [];
  const truncated = rows.length > MAX_SAVED_ROWS;
  return {
    ...turn,
    rows: truncated ? rows.slice(0, MAX_SAVED_ROWS) : rows,
    totalRows: turn.totalRows ?? rows.length,
    truncated: truncated || Boolean(turn.truncated),
  };
}

/**
 * Lleva un estado persistido a la versión actual. Un estado desconocido o corrupto
 * se descarta y se usan los valores por defecto.
 */
export function migrate(persisted, defaults) {
  if (!persisted || typeof persisted !== 'object') return defaults;
  if (persisted.version === SCHEMA_VERSION) return { ...defaults, ...persisted };
  // Sin versiones anteriores todavía: cualquier otra versión se reinicia.
  return defaults;
}

/** localStorage que no rompe la app si se llena la cuota o el navegador lo bloquea. */
export function createSafeStorage(onQuotaExceeded) {
  return {
    getItem(key) {
      try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
    },
    setItem(key, value) {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch (err) {
        const quota = err?.name === 'QuotaExceededError' || err?.code === 22;
        if (quota) onQuotaExceeded?.(key);
      }
    },
  };
}
