import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SALES_COLUMNS } from '../src/mocks/salesByBranch.js';
import { CHART_TYPES, chartData, chartSpec, chartTypeLabel, resultDisplay, columnKinds, MAX_BAR, MAX_PIE, formatValue, genericMarkdown, isMoneyColumn, isSalesResult } from '../src/shared/resultView.js';

const cols = ['Mes', 'Ventas', 'Monto'];
const rows = [['2026-01', 10, 1500.5], ['2026-02', 12, 1800], ['2026-03', 9, null]];

test('isSalesResult reconoce la forma del dashboard de ventas', () => {
  assert.equal(isSalesResult(SALES_COLUMNS), true);
  assert.equal(isSalesResult(cols), false);
});

test('columnKinds distingue número, periodo y texto', () => {
  assert.deepEqual(columnKinds(cols, rows), ['date', 'number', 'number']);
  assert.deepEqual(columnKinds(['Sucursal', 'X'], [['Centro', null], ['Norte', null]]), ['text', 'text']);
});

test('formato: moneda solo en columnas de importe, no en conteos', () => {
  assert.equal(isMoneyColumn('Monto'), true);
  assert.equal(isMoneyColumn('Ventas'), false);
  assert.equal(isMoneyColumn('Total de casos'), false);
  assert.equal(formatValue(1500.5, 'Monto'), '$1,501');
  assert.equal(formatValue(1234, 'Casos'), '1,234');
  assert.equal(formatValue('2026-01-05T00:00:00Z', 'Fecha'), '2026-01-05');
  assert.equal(formatValue(null, 'Monto'), '');
});

const base = (spec) => spec && { type: spec.type, x: spec.x, y: spec.y, ...(spec.transpose ? { transpose: true } : {}) };

test('chartSpec usa la sugerencia si es coherente y si no la deduce', () => {
  assert.deepEqual(base(chartSpec(cols, rows, { type: 'bar', x: 'Mes', y: ['Monto', 'Inventada'] })), { type: 'bar', x: 'Mes', y: ['Monto'] });
  assert.deepEqual(base(chartSpec(cols, rows, null)), { type: 'line', x: 'Mes', y: ['Ventas', 'Monto'] });
  assert.deepEqual(base(chartSpec(['Sucursal', 'N'], [['A', 1], ['B', 2]], { type: 'none', x: '', y: [] })), { type: 'bar', x: 'Sucursal', y: ['N'] });
  assert.equal(chartSpec(['Sucursal'], [['A'], ['B']], null), null); // sin medidas no hay gráfica
  assert.equal(chartSpec(cols, [], null), null);
  assert.deepEqual(base(chartSpec(cols, rows.slice(0, 1), null)), { type: 'line', x: 'Mes', y: ['Ventas', 'Monto'] });
  assert.deepEqual(base(chartSpec(['S', 'N', 'M'], [['A', 1, 2]], { type: 'pie', x: 'S', y: ['N', 'M'] })), { type: 'pie', x: 'S', y: ['N'] });
});

test('el reporte siempre grafica: solo medidas, una medida suelta y el tipo elegido por el usuario', () => {
  const totals = chartSpec(['Ventas', 'Monto'], [[12, 5000]], null);
  assert.deepEqual(base(totals), { type: 'bar', x: 'Indicador', y: ['Valor'], transpose: true });
  assert.deepEqual(chartData(totals, ['Ventas', 'Monto'], [[12, 5000]]).data, [{ Indicador: 'Ventas', Valor: 12 }, { Indicador: 'Monto', Valor: 5000 }]);
  assert.deepEqual(base(chartSpec(['Anio', 'Ventas'], [[2025, 1], [2026, 2]], null)), { type: 'line', x: 'Anio', y: ['Ventas'] });
  const single = chartSpec(['N'], [[1], [2]], null);
  assert.equal(single.x, '#');
  assert.deepEqual(chartData(single, ['N'], [[1], [2]]).data.map((d) => d['#']), [1, 2]);
  assert.equal(chartSpec(cols, rows, { type: 'bar', x: 'Mes', y: ['Monto'] }, 'pie').type, 'pie');
  assert.equal(chartSpec(cols, rows, null, 'otro').type, 'line');
  assert.equal(chartSpec(cols, rows, null, { type: 'horizontalbar' }).rotated, true);
});

test('mezcla de series, segundo eje y líneas de referencia', () => {
  const r = [['2026-01', 10, 1000], ['2026-02', 20, 3000]];
  // Sugerencia del agente: barras de Ventas con Monto en línea al eje derecho, promedio y meta.
  const hint = {
    type: 'bar', x: 'Mes', y: ['Ventas'],
    series: [{ column: 'Monto', type: 'line', axis: 'right' }],
    refLines: [{ kind: 'average', column: 'Ventas', value: null, label: '' }, { kind: 'value', column: 'Ventas', value: 18, label: 'Meta' }, { kind: 'value', column: 'Ventas', value: null, label: 'x' }],
  };
  const spec = chartSpec(cols, r, hint);
  assert.deepEqual(spec.y, ['Ventas', 'Monto']);
  assert.deepEqual(spec.series, [{ column: 'Ventas', type: 'bar', axis: 'left' }, { column: 'Monto', type: 'line', axis: 'right' }]);
  assert.deepEqual(spec.refLines.map((l) => [l.kind, l.value, l.label]), [['average', 15, 'Promedio de Ventas'], ['value', 18, 'Meta']]);
  assert.ok(spec.hasAverage);
  // El usuario quita el promedio; cambiar de tipo descarta las series mezcladas.
  assert.equal(chartSpec(cols, r, hint, { avg: false }).refLines.length, 1);
  assert.deepEqual(chartSpec(cols, r, hint, { type: 'line' }).series.map((x) => x.type), ['line', 'line']);
  // Combinada deducida: Monto (otra magnitud) va al eje derecho; el promedio se agrega a pedido.
  const combo = chartSpec(cols, r, null, { type: 'combo', avg: true });
  assert.deepEqual(combo.series, [{ column: 'Ventas', type: 'bar', axis: 'left' }, { column: 'Monto', type: 'line', axis: 'right' }]);
  assert.equal(combo.refLines[0].value, 15);
  // Sin pedirlas no hay líneas de referencia.
  assert.deepEqual(chartSpec(cols, r, null).refLines, []);
  assert.deepEqual(chartSpec(cols, r, { type: 'bar', x: 'Mes', y: ['Ventas'] }).refLines, []);
  // Las del usuario reemplazan a las del agente: [] las quita; conserva la etiqueta del agente para la misma meta.
  assert.deepEqual(chartSpec(cols, r, hint, { lines: [] }).refLines, []);
  const own = chartSpec(cols, r, hint, { lines: [{ kind: 'max' }, { kind: 'value', value: 18 }] });
  assert.deepEqual(own.refLines.map((l) => [l.kind, l.value, l.label]), [['max', 20, 'Máximo de Ventas'], ['value', 18, 'Meta']]);
  assert.equal(chartSpec(cols, r, null, { lines: [{ kind: 'value', value: 7 }] }).refLines[0].label, 'Meta de Ventas');
  // Pastel no lleva líneas ni series.
  assert.deepEqual(chartSpec(cols, r, hint, { type: 'pie', avg: true }).refLines, []);
  // Máximo y mínimo se calculan con los datos.
  const mm = chartSpec(cols, r, { type: 'bar', x: 'Mes', y: ['Monto'], refLines: [{ kind: 'max', column: 'Monto' }, { kind: 'min', column: 'Monto' }] });
  assert.deepEqual(mm.refLines.map((l) => l.value), [3000, 1000]);
  assert.equal(chartTypeLabel('combo'), 'Barras + línea');
  assert.ok(CHART_TYPES.every((t) => t.label && t.help && t.ask));
});

test('sin gráfica pedida se ven primero los datos en tabla, con la sugerencia lista', () => {
  const r = { columns: cols, rows, chart: { type: 'bar', x: 'Mes', y: ['Ventas'] } };
  const first = resultDisplay({ ...r, showChart: false });
  assert.equal(first.table, true);
  assert.equal(first.chart, null);
  assert.equal(first.suggestion.type, 'bar');
  // El usuario la lleva a gráfica (o elige otro tipo).
  assert.equal(resultDisplay({ ...r, showChart: false, chartType: 'bar' }).chart.type, 'bar');
  assert.equal(resultDisplay({ ...r, showChart: false, chartType: 'line' }).chart.type, 'line');
  // Pedida en el chat: gráfica directa; «Solo tabla» la quita.
  assert.equal(resultDisplay({ ...r, showChart: true }).table, false);
  assert.equal(resultDisplay(r).table, false); // turnos y reportes anteriores
  assert.equal(resultDisplay({ ...r, showChart: true, chartType: 'table' }).table, true);
  // Sin medidas no hay gráfica posible: tabla.
  assert.equal(resultDisplay({ columns: ['A'], rows: [['x']], chart: null }).table, true);
  assert.equal(chartTypeLabel('table'), 'Solo tabla (sin gráfica)');
});

test('chartData agrupa el pastel en «Otros» y recorta las barras', () => {
  const many = Array.from({ length: 70 }, (_, i) => [`S${i}`, 100 - i]);
  const pie = chartData({ type: 'pie', x: 'S', y: ['N'] }, ['S', 'N'], many);
  assert.equal(pie.data.length, MAX_PIE);
  assert.equal(pie.data.at(-1).S, 'Otros');
  assert.equal(pie.data.reduce((a, d) => a + d.N, 0), many.reduce((a, r) => a + r[1], 0));
  const bar = chartData({ type: 'bar', x: 'S', y: ['N'] }, ['S', 'N'], many);
  assert.equal(bar.data.length, MAX_BAR);
  assert.ok(bar.truncated);
});

test('genericMarkdown no incluye la respuesta del chat; tabla solo si no hay gráfica', () => {
  const md = genericMarkdown({ title: 'Ventas', answer: '¿Lo llevamos a una gráfica?', columns: cols, rows, totalRows: 3, queries: ['SELECT 1'], insights: [{ kind: 'alert', title: 'Caída', text: 'Marzo bajó.' }] });
  assert.match(md, /^# Ventas\n\n## Resultado\n/);
  assert.doesNotMatch(md, /Lo llevamos/);
  assert.match(md, /\| 2026-01 \| 10 \| \$1,501 \|/);
  assert.match(md, /- \*\*Alerta · Caída:\*\* Marzo bajó\./);
  assert.match(md, /```sql\nSELECT 1\n```/);
  // Con gráfica: la imagen y no la tabla.
  const withChart = genericMarkdown({ title: 'Ventas', columns: cols, rows, charts: [{ title: 'Ventas por Mes', src: 'data:image/svg+xml;base64,AAA', legend: ['Enero: 10'] }] });
  assert.match(withChart, /## Gráfica\n\n### Ventas por Mes\n\n!\[Ventas por Mes\]\(data:image\/svg\+xml;base64,AAA\)\n\n- Enero: 10/);
  assert.doesNotMatch(withChart, /## Resultado|\| 2026-01/);
});
