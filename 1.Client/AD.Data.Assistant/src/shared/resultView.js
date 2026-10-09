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

/**
 * Gráficas disponibles (DevExtreme dxChart / dxPieChart). `help` y `ask` alimentan la ayuda de la pestaña Resultados.
 */
export const CHART_TYPES = [
  { id: 'bar', label: 'Barras', icon: 'fa-chart-column', group: 'Barras', help: 'Comparar categorías o periodos.', ask: 'Muéstralo en barras' },
  { id: 'horizontalbar', label: 'Barras horizontales', icon: 'fa-chart-bar', group: 'Barras', help: 'Rankings o nombres largos.', ask: 'Ponlo en barras horizontales' },
  { id: 'stackedbar', label: 'Barras apiladas', icon: 'fa-layer-group', group: 'Barras', help: 'Cómo se compone un total con varias medidas.', ask: 'Barras apiladas por estado' },
  { id: 'fullstackedbar', label: 'Barras apiladas al 100 %', icon: 'fa-percent', group: 'Barras', help: 'Proporción de cada medida dentro de cada categoría.', ask: 'Barras al 100 %' },
  { id: 'combo', label: 'Barras + línea', icon: 'fa-chart-simple', group: 'Combinadas', help: 'La primera medida en barras y el resto en líneas; una magnitud distinta va al eje derecho.', ask: 'Ventas en barras y monto en línea' },
  { id: 'line', label: 'Líneas', icon: 'fa-chart-line', group: 'Líneas y áreas', help: 'Evolución en el tiempo.', ask: 'Muéstralo en líneas' },
  { id: 'spline', label: 'Curvas', icon: 'fa-wave-square', group: 'Líneas y áreas', help: 'Evolución con trazo suavizado.', ask: 'En curvas suavizadas' },
  { id: 'stepline', label: 'Escalones', icon: 'fa-stairs', group: 'Líneas y áreas', help: 'Valores que cambian por saltos (tarifas, estados).', ask: 'En escalones' },
  { id: 'area', label: 'Áreas', icon: 'fa-chart-area', group: 'Líneas y áreas', help: 'Evolución destacando el volumen.', ask: 'En áreas' },
  { id: 'splinearea', label: 'Áreas suavizadas', icon: 'fa-chart-area', group: 'Líneas y áreas', help: 'Áreas con trazo suavizado.', ask: 'En áreas suavizadas' },
  { id: 'stackedarea', label: 'Áreas apiladas', icon: 'fa-layer-group', group: 'Líneas y áreas', help: 'Evolución de un total y de sus partes.', ask: 'Áreas apiladas por sucursal' },
  { id: 'scatter', label: 'Dispersión', icon: 'fa-braille', group: 'Otras', help: 'Relación entre dos medidas numéricas.', ask: 'Dispersión de monto contra ventas' },
  { id: 'pie', label: 'Pastel', icon: 'fa-chart-pie', group: 'Participación', help: 'Participación de pocas categorías en un total.', ask: 'Participación en pastel' },
  { id: 'doughnut', label: 'Dona', icon: 'fa-circle-notch', group: 'Participación', help: 'Como el pastel, con hueco central.', ask: 'En dona' },
];
/** Lo que se puede añadir a cualquier gráfica de ejes. */
export const CHART_EXTRAS = [
  { label: 'Línea de promedio', help: 'Línea horizontal con el promedio de una medida.', ask: 'Barras con una línea de promedio' },
  { label: 'Meta o umbral', help: 'Línea horizontal en un valor fijo.', ask: 'Agrega una línea de meta en 500' },
  { label: 'Máximo y mínimo', help: 'Líneas en el valor más alto o más bajo.', ask: 'Marca el máximo y el mínimo' },
  { label: 'Segundo eje', help: 'Una medida con otra magnitud en el eje derecho.', ask: 'Monto en el eje derecho' },
];
/** Atajos bajo la respuesta cuando el agente pregunta qué gráfica prefieres. */
export const QUICK_CHART_TYPES = ['bar', 'line', 'pie', 'combo'];
export const POLAR_TYPES = new Set(['pie', 'doughnut']);
const BAR_TYPES = new Set(['bar', 'horizontalbar', 'stackedbar', 'fullstackedbar', 'combo']);
const TYPES = new Set(CHART_TYPES.map((t) => t.id));
const SERIES_TYPES = new Set(['bar', 'line', 'spline', 'area', 'scatter']);
export const chartTypeLabel = (id) => CHART_TYPES.find((t) => t.id === id)?.label ?? id;

export const MAX_BAR = 50;
export const MAX_PIE = 10;
export const INDEX_X = '#';
export const TRANSPOSE_X = 'Indicador';
export const TRANSPOSE_Y = 'Valor';
const REF_LABEL = { average: 'Promedio', max: 'Máximo', min: 'Mínimo', value: 'Referencia' };

const numbers = (rows, i) => rows.map((r) => r[i]).filter((v) => typeof v === 'number' && Number.isFinite(v));
const maxAbs = (vals) => vals.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/**
 * Gráfica del reporte. El reporte siempre grafica si hay alguna columna numérica. Base: la sugerencia del agente si es
 * coherente con los datos; si no, una deducida. Encima va lo que eligió el usuario.
 * @param {string | { type?: string, avg?: boolean }} [choice] elección del usuario: tipo y línea de promedio
 * @returns {{ type: string, x: string, y: string[], rotated: boolean, transpose?: boolean,
 *   series: { column: string, type: string, axis: 'left'|'right' }[],
 *   refLines: { kind: string, column: string, value: number, label: string, axis: 'left'|'right' }[], hasAverage: boolean } | null}
 */
export function chartSpec(columns, rows, hint, choice) {
  if (!columns?.length || !rows?.length) return null;
  const kinds = columnKinds(columns, rows);
  const numeric = columns.filter((c, i) => kinds[i] === 'number');
  if (!numeric.length) return null;
  const pick = typeof choice === 'string' ? { type: choice } : (choice ?? {});
  const userType = TYPES.has(pick.type) ? pick.type : null;

  let base = null;
  if (hint && TYPES.has(hint.type) && columns.includes(hint.x)) {
    const y = (hint.y ?? []).filter((c) => numeric.includes(c) && c !== hint.x);
    // Una serie mezclada cuya columna no venía en y se añade (p. ej. «Monto como línea»).
    for (const s of hint.series ?? []) if (numeric.includes(s.column) && s.column !== hint.x && !y.includes(s.column)) y.push(s.column);
    if (y.length) base = { type: hint.type, x: hint.x, y: y.slice(0, 6), overrides: hint.series ?? [], lines: hint.refLines ?? [] };
  }
  if (!base) {
    const xi = kinds.findIndex((k) => k !== 'number');
    if (xi >= 0) base = { type: kinds[xi] === 'date' ? 'line' : 'bar', x: columns[xi], y: numeric.slice(0, 4) };
    // Solo medidas en una fila (totales): cada columna es una categoría.
    else if (rows.length === 1) base = { type: 'bar', x: TRANSPOSE_X, y: [TRANSPOSE_Y], transpose: true };
    // Varias medidas: la primera hace de eje (p. ej. Año).
    else if (numeric.length > 1) base = { type: 'line', x: numeric[0], y: numeric.slice(1, 5) };
    else base = { type: 'bar', x: INDEX_X, y: numeric.slice(0, 1) };
    base.overrides = [];
    base.lines = [];
  }

  const type = userType ?? base.type;
  const spec = { type, x: base.x, y: base.y, rotated: type === 'horizontalbar', series: [], refLines: [], hasAverage: false };
  if (base.transpose) spec.transpose = true;
  if (POLAR_TYPES.has(type)) {
    spec.y = spec.y.slice(0, 1);
    return spec;
  }

  // Magnitud de cada medida para mandar al eje derecho las que no se comparan con la primera.
  const mag = Object.fromEntries(spec.y.map((c) => [c, maxAbs(numbers(rows, columns.indexOf(c)))]));
  const otherScale = (c) => mag[spec.y[0]] > 0 && mag[c] > 0 && (mag[c] / mag[spec.y[0]] > 5 || mag[spec.y[0]] / mag[c] > 5);
  const overrides = userType && userType !== base.type ? [] : base.overrides;
  spec.series = spec.y.map((column, i) => {
    const o = overrides.find((s) => s.column === column && SERIES_TYPES.has(s.type));
    if (o) return { column, type: o.type, axis: o.axis === 'right' ? 'right' : 'left' };
    if (type === 'combo') return { column, type: i === 0 ? 'bar' : 'line', axis: i > 0 && otherScale(column) ? 'right' : 'left' };
    return { column, type: type === 'horizontalbar' ? 'bar' : type, axis: 'left' };
  });
  const axisOf = (column) => spec.series.find((s) => s.column === column)?.axis ?? 'left';

  // Con totales traspuestos los valores son la única fila.
  const valuesOf = (column) => (spec.transpose ? rows[0].filter((v) => typeof v === 'number' && Number.isFinite(v)) : numbers(rows, columns.indexOf(column)));
  const resolve = (l) => {
    const column = spec.transpose ? TRANSPOSE_Y : (spec.y.includes(l.column) ? l.column : spec.y[0]);
    const vals = valuesOf(column);
    let value = null;
    if (l.kind === 'value') value = typeof l.value === 'number' ? l.value : null;
    else if (vals.length) value = l.kind === 'max' ? Math.max(...vals) : l.kind === 'min' ? Math.min(...vals) : vals.reduce((a, v) => a + v, 0) / vals.length;
    if (value === null || !Number.isFinite(value)) return null;
    const kind = REF_LABEL[l.kind] ? l.kind : 'average';
    return { kind, column, value, label: l.label?.trim() || `${REF_LABEL[kind]}${spec.y.length > 1 ? ` de ${column}` : ''}`, axis: axisOf(column) };
  };
  let lines = base.lines.map(resolve).filter(Boolean);
  if (pick.avg === false) lines = lines.filter((l) => l.kind !== 'average');
  if (pick.avg === true && !lines.some((l) => l.kind === 'average')) lines.push(resolve({ kind: 'average', column: spec.y[0] }));
  spec.refLines = lines.filter(Boolean);
  spec.hasAverage = spec.refLines.some((l) => l.kind === 'average');
  return spec;
}

/** Filas para la gráfica: pastel/dona con «Otros» a partir de MAX_PIE categorías y barras con tope MAX_BAR. */
export function chartData(spec, columns, rows) {
  let data;
  if (spec.transpose) {
    data = columns.map((c, i) => ({ [TRANSPOSE_X]: c, [TRANSPOSE_Y]: rows[0][i] })).filter((d) => typeof d[TRANSPOSE_Y] === 'number');
  } else {
    data = rowsAsObjects(columns, rows).map((d, n) => (spec.x === INDEX_X ? { ...d, [INDEX_X]: n + 1 } : d));
  }
  if (POLAR_TYPES.has(spec.type)) {
    const y = spec.y[0];
    const sorted = data.filter((d) => typeof d[y] === 'number' && d[y] > 0).sort((a, b) => b[y] - a[y]);
    if (sorted.length <= MAX_PIE) return { data: sorted, truncated: false };
    const rest = sorted.slice(MAX_PIE - 1).reduce((sum, d) => sum + d[y], 0);
    return { data: [...sorted.slice(0, MAX_PIE - 1), { [spec.x]: 'Otros', [y]: rest }], truncated: false, grouped: true };
  }
  if (BAR_TYPES.has(spec.type) && data.length > MAX_BAR) return { data: data.slice(0, MAX_BAR), truncated: true };
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
