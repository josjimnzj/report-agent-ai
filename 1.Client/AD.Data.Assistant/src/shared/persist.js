// Utilidades de persistencia en localStorage (Pinia + pinia-plugin-persistedstate).

export const SCHEMA_VERSION = 2;
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
 * Lleva un estado persistido a la versión actual aplicando `upgrades[v]` (de v a v + 1) en orden.
 * Un estado corrupto, de una versión futura o sin camino de migración se descarta.
 */
export function migrate(persisted, defaults, upgrades = {}) {
  if (!persisted || typeof persisted !== 'object' || typeof persisted.version !== 'number') return defaults;
  let state = persisted;
  while (state.version < SCHEMA_VERSION) {
    const up = upgrades[state.version];
    if (!up) return defaults;
    state = { ...up(state), version: state.version + 1 };
  }
  if (state.version !== SCHEMA_VERSION) return defaults;
  return { ...defaults, ...state };
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
