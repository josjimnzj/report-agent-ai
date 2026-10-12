// Filtros de un reporte publicado: qué se sugiere al publicar y cómo se aplican en el enlace público.
// Trabajan sobre la copia de filas publicada (el enlace no vuelve a consultar la base).
import { columnKinds } from './resultView.js';

export const MAX_FILTERS = 6;
/** Más valores distintos que esto: la lista deja de ser útil como filtro. */
export const MAX_OPTIONS = 100;
/** Hasta este número de valores distintos, la lista se sugiere marcada. */
const SUGGEST_OPTIONS = 30;
const YEAR_NAME = /^(a[ñn]o|anio|year|ejercicio)$/i;

export const FILTER_KINDS = {
  date: { label: 'Periodo', icon: 'fa-calendar-days' },
  select: { label: 'Lista de valores', icon: 'fa-list-check' },
  range: { label: 'Rango numérico', icon: 'fa-sliders' },
};

/** Periodos rápidos; los «últimos N meses» se cuentan desde la fecha más reciente de los datos, no desde hoy. */
export const DATE_PRESETS = [
  { id: 'all', text: 'Todo el periodo' },
  { id: 'last3', text: 'Últimos 3 meses', months: 3 },
  { id: 'last6', text: 'Últimos 6 meses', months: 6 },
  { id: 'last12', text: 'Últimos 12 meses', months: 12 },
  { id: 'ytd', text: 'Último año natural' },
  { id: 'custom', text: 'Rango personalizado' },
];

const present = (v) => v !== null && v !== undefined && v !== '';
const valuesOf = (columns, rows, column) => {
  const i = columns.indexOf(column);
  return i < 0 ? [] : rows.map((r) => r[i]).filter(present);
};
const compare = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'es', { numeric: true }));

/**
 * Filtros que se pueden ofrecer al publicar, con `suggested` = marcado de entrada.
 * Orden: fechas, años, listas y rangos. Se sugieren las fechas y hasta dos listas cortas.
 * @returns {{ column: string, kind: 'date'|'select'|'range', label: string, distinct: number, suggested: boolean }[]}
 */
export function suggestFilters(columns = [], rows = []) {
  const kinds = columnKinds(columns, rows);
  const found = [];
  columns.forEach((column, i) => {
    const values = rows.map((r) => r[i]).filter(present);
    const distinct = new Set(values).size;
    if (distinct < 2) return;
    let kind = null;
    let rank = 0;
    let suggested = false;
    if (kinds[i] === 'date') { kind = 'date'; suggested = true; }
    else if (kinds[i] === 'number' && YEAR_NAME.test(column) && values.every((v) => Number.isInteger(v) && v >= 1900 && v <= 2100)) {
      kind = 'select'; rank = 1; suggested = true;
    } else if (kinds[i] === 'text' && distinct <= MAX_OPTIONS) { kind = 'select'; rank = 2; suggested = distinct <= SUGGEST_OPTIONS; }
    else if (kinds[i] === 'number') { kind = 'range'; rank = 3; }
    if (kind) found.push({ column, kind, label: column, distinct, suggested, rank, i });
  });
  found.sort((a, b) => a.rank - b.rank || a.i - b.i);
  let lists = 0;
  return found.map(({ rank, i, ...f }) => {
    if (f.suggested && rank === 2 && (lists += 1) > 2) f.suggested = false;
    return f;
  });
}

/** 'month' si todas las fechas son AAAA-MM; si no, 'day'. */
export function dateGranularity(values) {
  return values.length && values.every((v) => /^\d{4}-\d{2}$/.test(String(v))) ? 'month' : 'day';
}
const keyOf = (v, granularity) => String(v).slice(0, granularity === 'month' ? 7 : 10);

/** Fechas distintas de la columna, ordenadas (AAAA-MM o AAAA-MM-DD). */
export function dateKeys(columns, rows, column) {
  const values = valuesOf(columns, rows, column);
  const g = dateGranularity(values);
  return [...new Set(values.map((v) => keyOf(v, g)))].sort();
}

function addMonths(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const monthSpan = (from, to) => {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
};

/** Periodos rápidos que cambian algo con estos datos (p. ej. sin «últimos 12 meses» si solo hay 6). */
export function datePresets(keys) {
  if (!keys.length) return DATE_PRESETS.filter((p) => p.id === 'all');
  const span = monthSpan(keys[0].slice(0, 7), keys.at(-1).slice(0, 7));
  return DATE_PRESETS.filter((p) => (p.months ? span > p.months : p.id !== 'ytd' || keys[0].slice(0, 4) !== keys.at(-1).slice(0, 4)));
}

/** Rango { from, to } (inclusive, mismo formato que las claves) de un valor de filtro de fecha. */
export function dateRange(value, keys) {
  const preset = DATE_PRESETS.find((p) => p.id === value?.preset) ?? DATE_PRESETS[0];
  if (!keys.length || preset.id === 'all') return { from: null, to: null };
  if (preset.id === 'custom') return { from: value.from ?? null, to: value.to ?? null };
  const last = keys.at(-1).slice(0, 7);
  return { from: preset.id === 'ytd' ? `${last.slice(0, 4)}-01` : addMonths(last, 1 - preset.months), to: null };
}

/** Valor inicial de un filtro (el `default` elegido al publicar o «todo»). */
export function defaultValue(filter) {
  const d = filter.default;
  if (filter.kind === 'date') return { preset: d?.preset ?? 'all', from: d?.from ?? null, to: d?.to ?? null };
  if (filter.kind === 'select') return Array.isArray(d) ? [...d] : [];
  return { min: typeof d?.min === 'number' ? d.min : null, max: typeof d?.max === 'number' ? d.max : null };
}

/** El filtro restringe algo (no es «todo»). */
export function isActive(filter, value) {
  if (filter.kind === 'date') return (value?.preset ?? 'all') !== 'all';
  if (filter.kind === 'select') return Boolean(value?.length);
  return value?.min != null || value?.max != null;
}

/** Valores de una lista, ordenados. */
export function selectOptions(columns, rows, column) {
  return [...new Set(valuesOf(columns, rows, column))].sort(compare);
}

/** Mínimo y máximo de una columna numérica. */
export function numericBounds(columns, rows, column) {
  const nums = valuesOf(columns, rows, column).filter((v) => typeof v === 'number' && Number.isFinite(v));
  return nums.length ? { min: Math.min(...nums), max: Math.max(...nums) } : { min: null, max: null };
}

/**
 * Filas que pasan todos los filtros. `values` va por columna. Con un filtro activo, las celdas vacías no pasan.
 * @param {{ column: string, kind: string }[]} filters
 * @param {Record<string, any>} values
 */
export function applyFilters(columns, rows, filters = [], values = {}) {
  const tests = filters.flatMap((f) => {
    const i = columns.indexOf(f.column);
    const value = values[f.column];
    if (i < 0 || !isActive(f, value)) return [];
    if (f.kind === 'date') {
      const keys = dateKeys(columns, rows, f.column);
      const { from, to } = dateRange(value, keys);
      const g = dateGranularity(keys);
      return [(r) => {
        if (!present(r[i])) return false;
        const k = keyOf(r[i], g);
        return (!from || k >= keyOf(from, g)) && (!to || k <= keyOf(to, g));
      }];
    }
    if (f.kind === 'select') {
      const set = new Set(value);
      return [(r) => set.has(r[i])];
    }
    return [(r) => typeof r[i] === 'number' && (value.min == null || r[i] >= value.min) && (value.max == null || r[i] <= value.max)];
  });
  return tests.length ? rows.filter((r) => tests.every((t) => t(r))) : rows;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** «sep 2026» para AAAA-MM; «15/09/2026» para AAAA-MM-DD. */
export function formatDateKey(key) {
  const [y, m, d] = String(key).split('-');
  if (!m) return String(key);
  return d ? `${d}/${m}/${y}` : `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/** Resumen de un filtro para la lista del diálogo y el enlace: «Periodo · últimos 6 meses». */
export function describeValue(filter, value) {
  if (!isActive(filter, value)) return 'todo';
  if (filter.kind === 'date') {
    if (value.preset !== 'custom') return DATE_PRESETS.find((p) => p.id === value.preset)?.text.toLowerCase() ?? '';
    return `${value.from ? formatDateKey(value.from) : '…'} – ${value.to ? formatDateKey(value.to) : '…'}`;
  }
  if (filter.kind === 'select') return value.length <= 3 ? value.join(', ') : `${value.length} seleccionados`;
  return `${value.min ?? '…'} – ${value.max ?? '…'}`;
}

/** «Enlace público · hasta 12 nov» o «Enlace caducado» (menú lateral y cabecera del reporte). */
export function publishedLabel(published, now = Date.now()) {
  if (published.expiresAt <= now) return 'Enlace caducado';
  return `Enlace público · hasta ${new Date(published.expiresAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`;
}
