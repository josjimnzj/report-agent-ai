import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SALES_COLUMNS } from '../src/mocks/salesByBranch.js';
import { chartSpec, columnKinds, formatValue, genericMarkdown, isMoneyColumn, isSalesResult } from '../src/shared/resultView.js';

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
  assert.equal(chartSpec(['N'], [[1], [2]], null), null);
  assert.equal(chartSpec(cols, rows.slice(0, 1), null), null);
  // pie solo con pocas categorías y una serie
  assert.equal(chartSpec(['S', 'N'], [['A', 1], ['B', 2]], { type: 'pie', x: 'S', y: ['N'] }).type, 'pie');
});

test('genericMarkdown incluye respuesta, tabla y SQL', () => {
  const md = genericMarkdown({ title: 'Ventas', answer: 'Subieron.', columns: cols, rows, totalRows: 3, queries: ['SELECT 1'] });
  assert.match(md, /^# Ventas\n\nSubieron\.\n/);
  assert.match(md, /\| 2026-01 \| 10 \| \$1,501 \|/);
  assert.match(md, /```sql\nSELECT 1\n```/);
});
