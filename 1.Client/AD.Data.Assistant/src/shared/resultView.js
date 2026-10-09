// Presentación de un resultado cualquiera del agente (columnas + filas): tipo de columna, formato y gráfica.

const SALES_SHAPE = ['Mes', 'Sucursal', 'Monto', 'Oportunidades', 'Ganadas'];

/** El dashboard de ventas (KPI, insights…) solo aplica a resultados con esta forma. */
export const isSalesResult = (columns = []) => SALES_SHAPE.every((c) => columns.includes(c));

const PERIOD = /^\d{4}-\d{2}(-\d{2})?([T ][\d:.]+Z?)?$/;

/** 'number' | 'date' | 'text' por columna, mirando los valores no nulos. */
export function columnKinds(columns, rows) {
  return columns.map((_, i) => {
    const values = rows.map((r) => r[i]).filter((v) => v !== null && v !== undefined && v !== '');
    if (!values.length) return 'text';
    if (values.every((v) => typeof v === 'number')) return 'number';
    if (values.every((v) => typeof v === 'string' && PERIOD.test(v))) return 'date';
    return 'text';
  });
}

// «Ventas» suele ser un conteo; los importes van como Monto, Importe, Total…
const MONEY = /(monto|importe|total|precio|saldo|ingreso|pago|costo|cobro|valor)/i;
const COUNT = /(cantidad|num|n[úu]mero|casos|conteo|count|cuentas|clientes|oportunidades|ganadas|llamadas|registros|d[ií]as|porcentaje|pct|tasa|%)/i;

/** Columna numérica que se muestra como moneda (por su nombre). */
export const isMoneyColumn = (name) => MONEY.test(name) && !COUNT.test(name);

const integer = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export function formatValue(value, column) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return isMoneyColumn(column) ? money.format(value) : integer.format(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export const CHART_TYPES = [
  { id: 'bar', label: 'Barras', icon: 'fa-chart-column' },
  { id: 'line', label: 'Líneas', icon: 'fa-chart-line' },
  { id: 'pie', label: 'Pastel', icon: 'fa-chart-pie' },
];
const TYPES = CHART_TYPES.map((t) => t.id);
export const MAX_BAR = 50;
export const MAX_PIE = 10;
export const INDEX_X = '#';
export const TRANSPOSE_X = 'Indicador';
export const TRANSPOSE_Y = 'Valor';

/**
 * Gráfica del reporte: el reporte siempre grafica si hay alguna columna numérica. Se usa el tipo elegido por
 * el usuario, si no la sugerencia del agente (si es coherente con los datos) y si no una deducida.
 * @param {string} [type] tipo elegido por el usuario: 'bar' | 'line' | 'pie'
 * @returns {{ type: 'bar'|'line'|'pie', x: string, y: string[], transpose?: boolean } | null}
 */
export function chartSpec(columns, rows, hint, type) {
  if (!columns?.length || !rows?.length) return null;
  const kinds = columnKinds(columns, rows);
  const numeric = columns.filter((c, i) => kinds[i] === 'number');
  if (!numeric.length) return null;

  let spec = null;
  if (hint && TYPES.includes(hint.type) && columns.includes(hint.x)) {
    const y = (hint.y ?? []).filter((c) => numeric.includes(c) && c !== hint.x);
    if (y.length) spec = { type: hint.type, x: hint.x, y: y.slice(0, 6) };
  }
  if (!spec) {
    const xi = kinds.findIndex((k) => k !== 'number');
    if (xi >= 0) spec = { type: kinds[xi] === 'date' ? 'line' : 'bar', x: columns[xi], y: numeric.slice(0, 4) };
    // Solo medidas en una fila (totales): cada columna es una categoría.
    else if (rows.length === 1) spec = { type: 'bar', x: TRANSPOSE_X, y: [TRANSPOSE_Y], transpose: true };
    // Varias medidas: la primera hace de eje (p. ej. Año).
    else if (numeric.length > 1) spec = { type: 'line', x: numeric[0], y: numeric.slice(1, 5) };
    else spec = { type: 'bar', x: INDEX_X, y: numeric.slice(0, 1) };
  }
  if (TYPES.includes(type)) spec.type = type;
  if (spec.type === 'pie') spec.y = spec.y.slice(0, 1);
  return spec;
}

/** Filas para la gráfica: pastel con «Otros» a partir de MAX_PIE categorías y barras con tope MAX_BAR. */
export function chartData(spec, columns, rows) {
  let data;
  if (spec.transpose) {
    data = columns.map((c, i) => ({ [TRANSPOSE_X]: c, [TRANSPOSE_Y]: rows[0][i] })).filter((d) => typeof d[TRANSPOSE_Y] === 'number');
  } else {
    data = rowsAsObjects(columns, rows).map((d, n) => (spec.x === INDEX_X ? { ...d, [INDEX_X]: n + 1 } : d));
  }
  if (spec.type === 'pie') {
    const y = spec.y[0];
    const sorted = data.filter((d) => typeof d[y] === 'number' && d[y] > 0).sort((a, b) => b[y] - a[y]);
    if (sorted.length <= MAX_PIE) return { data: sorted, truncated: false };
    const rest = sorted.slice(MAX_PIE - 1).reduce((sum, d) => sum + d[y], 0);
    return { data: [...sorted.slice(0, MAX_PIE - 1), { [spec.x]: 'Otros', [y]: rest }], truncated: false, grouped: true };
  }
  if (spec.type === 'bar' && data.length > MAX_BAR) return { data: data.slice(0, MAX_BAR), truncated: true };
  return { data, truncated: false };
}

/** Filas como objetos para DevExtreme (dxChart / dxDataGrid). */
export const rowsAsObjects = (columns, rows) =>
  rows.map((r, n) => Object.fromEntries([['__row', n], ...columns.map((c, i) => [c, r[i]])]));

export function genericMarkdown({ title, answer, columns, rows, totalRows, queries = [] }) {
  const esc = (v) => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lines = [`# ${title}`, ''];
  if (answer) lines.push(answer, '');
  if (columns.length) {
    lines.push('## Resultado', '', `| ${columns.map(esc).join(' | ')} |`, `|${columns.map(() => '---').join('|')}|`);
    for (const r of rows.slice(0, 200)) lines.push(`| ${r.map((v, i) => esc(formatValue(v, columns[i]))).join(' | ')} |`);
    const total = totalRows ?? rows.length;
    if (total > Math.min(rows.length, 200)) lines.push('', `_Se muestran ${Math.min(rows.length, 200)} de ${total} filas._`);
  }
  if (queries.length) {
    lines.push('', '## SQL', '');
    for (const q of queries) lines.push('```sql', q, '```', '');
  }
  return lines.join('\n').trimEnd() + '\n';
}
