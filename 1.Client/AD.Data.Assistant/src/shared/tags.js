// Etiquetas de conversaciones: texto libre, normalizado para que no se dupliquen.

export const MAX_TAGS = 6;
export const MAX_TAG_LENGTH = 24;

const key = (t) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Limpia espacios, recorta, quita vacías y duplicadas (sin distinguir mayúsculas ni acentos). */
export function normalizeTags(tags) {
  const out = [];
  const seen = new Set();
  for (const raw of tags ?? []) {
    const t = String(raw).replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim();
    if (!t || seen.has(key(t))) continue;
    seen.add(key(t));
    out.push(t);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/** Todas las etiquetas usadas (una por clave normalizada), ordenadas alfabéticamente. */
export function collectTags(chats) {
  const byKey = new Map();
  for (const t of chats.flatMap((c) => c.tags ?? [])) if (!byKey.has(key(t))) byKey.set(key(t), t);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

export const tagKey = key;
