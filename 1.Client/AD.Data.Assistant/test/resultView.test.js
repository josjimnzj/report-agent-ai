import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SALES_COLUMNS } from '../src/mocks/salesByBranch.js';
import { chartData, chartSpec, columnKinds, MAX_BAR, MAX_PIE, formatValue, genericMarkdown, isMoneyColumn, isSalesResult } from '../src/shared/resultView.js';

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

test('chartSpec usa la sugerencia si es coherente y si no la deduce', () => {
  assert.deepEqual(chartSpec(cols, rows, { type: 'bar', x: 'Mes', y: ['Monto', 'Inventada'] }), { type: 'bar', x: 'Mes', y: ['Monto'] });
  assert.deepEqual(chartSpec(cols, rows, null), { type: 'line', x: 'Mes', y: ['Ventas', 'Monto'] });
  assert.deepEqual(chartSpec(['Sucursal', 'N'], [['A', 1], ['B', 2]], { type: 'none', x: '', y: [] }), { type: 'bar', x: 'Sucursal', y: ['N'] });
  assert.equal(chartSpec(['Sucursal'], [['A'], ['B']], null), null); // sin medidas no hay gráfica
  assert.equal(chartSpec(cols, [], null), null);
  assert.deepEqual(chartSpec(cols, rows.slice(0, 1), null), { type: 'line', x: 'Mes', y: ['Ventas', 'Monto'] });
  assert.deepEqual(chartSpec(['S', 'N', 'M'], [['A', 1, 2]], { type: 'pie', x: 'S', y: ['N', 'M'] }), { type: 'pie', x: 'S', y: ['N'] });
});

test('el reporte siempre grafica: solo medidas, una medida suelta y el tipo elegido por el usuario', () => {
  const totals = chartSpec(['Ventas', 'Monto'], [[12, 5000]], null);
  assert.deepEqual(totals, { type: 'bar', x: 'Indicador', y: ['Valor'], transpose: true });
  assert.deepEqual(chartData(totals, ['Ventas', 'Monto'], [[12, 5000]]).data, [{ Indicador: 'Ventas', Valor: 12 }, { Indicador: 'Monto', Valor: 5000 }]);
  assert.deepEqual(chartSpec(['Anio', 'Ventas'], [[2025, 1], [2026, 2]], null), { type: 'line', x: 'Anio', y: ['Ventas'] });
  const single = chartSpec(['N'], [[1], [2]], null);
  assert.equal(single.x, '#');
  assert.deepEqual(chartData(single, ['N'], [[1], [2]]).data.map((d) => d['#']), [1, 2]);
  assert.equal(chartSpec(cols, rows, { type: 'bar', x: 'Mes', y: ['Monto'] }, 'pie').type, 'pie');
  assert.equal(chartSpec(cols, rows, null, 'otro').type, 'line');
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

test('genericMarkdown incluye respuesta, tabla y SQL', () => {
  const md = genericMarkdown({ title: 'Ventas', answer: 'Subieron.', columns: cols, rows, totalRows: 3, queries: ['SELECT 1'] });
  assert.match(md, /^# Ventas\n\nSubieron\.\n/);
  assert.match(md, /\| 2026-01 \| 10 \| \$1,501 \|/);
  assert.match(md, /```sql\nSELECT 1\n```/);
});
