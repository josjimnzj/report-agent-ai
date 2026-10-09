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
 * Gráfica para el resultado: la que sugiere el agente si es coherente con los datos; si no, una deducida.
 * @returns {{ type: 'bar'|'line'|'pie', x: string, y: string[] } | null}
 */
export function chartSpec(columns, rows, hint) {
  if (!columns.length || rows.length < 2) return null;
  const kinds = columnKinds(columns, rows);
  const numeric = columns.filter((c, i) => kinds[i] === 'number');

  if (hint && hint.type !== 'none' && columns.includes(hint.x)) {
    const y = (hint.y ?? []).filter((c) => numeric.includes(c) && c !== hint.x);
    if (y.length && (hint.type !== 'pie' || (rows.length <= 8 && y.length === 1)) && rows.length <= 200) {
      return { type: hint.type, x: hint.x, y: y.slice(0, 6) };
    }
  }

  const xi = kinds.findIndex((k) => k !== 'number');
  if (xi < 0) return null;
  const y = numeric.slice(0, 4);
  if (!y.length) return null;
  const type = kinds[xi] === 'date' ? 'line' : 'bar';
  if (type === 'bar' && rows.length > 50) return null;
  return { type, x: columns[xi], y };
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
