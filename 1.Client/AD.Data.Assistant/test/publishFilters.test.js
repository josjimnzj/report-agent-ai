import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SALES_COLUMNS, SALES_ROWS } from '../src/mocks/salesByBranch.js';
import {
  applyFilters, dateKeys, datePresets, dateRange, defaultValue, describeValue, formatDateKey, isActive, suggestFilters,
} from '../src/shared/publishFilters.js';

test('suggestFilters: fechas primero y marcadas; listas cortas marcadas; números como rango sin marcar', () => {
  const f = suggestFilters(SALES_COLUMNS, SALES_ROWS);
  assert.deepEqual(f.map((x) => [x.column, x.kind, x.suggested]), [
    ['Mes', 'date', true],
    ['Sucursal', 'select', true],
    ['Monto', 'range', false],
    ['Oportunidades', 'range', false],
    ['Ganadas', 'range', false],
  ]);
});

test('suggestFilters: año numérico como lista; columnas con un solo valor no se ofrecen; máximo dos listas marcadas', () => {
  const columns = ['Año', 'Región', 'Canal', 'Producto', 'Fijo', 'Ventas'];
  const rows = [[2024, 'N', 'Web', 'A', 'x', 1], [2025, 'S', 'Tienda', 'B', 'x', 2], [2025, 'N', 'Web', 'C', 'x', 3]];
  const f = suggestFilters(columns, rows);
  assert.deepEqual(f.map((x) => [x.column, x.kind, x.suggested]), [
    ['Año', 'select', true],
    ['Región', 'select', true],
    ['Canal', 'select', true],
    ['Producto', 'select', false],
    ['Ventas', 'range', false],
  ]);
});

test('dateRange: últimos N meses desde la fecha más reciente de los datos', () => {
  const keys = dateKeys(SALES_COLUMNS, SALES_ROWS, 'Mes');
  const last = keys.at(-1);
  assert.equal(dateRange({ preset: 'all' }, keys).from, null);
  assert.equal(dateRange({ preset: 'last3' }, keys).from, keys.at(-3));
  assert.equal(dateRange({ preset: 'ytd' }, keys).from, `${last.slice(0, 4)}-01`);
  assert.deepEqual(dateRange({ preset: 'custom', from: '2026-01', to: '2026-02' }, keys), { from: '2026-01', to: '2026-02' });
});

test('datePresets omite los que no cambian nada', () => {
  assert.deepEqual(datePresets(['2026-01', '2026-02', '2026-03', '2026-04']).map((p) => p.id), ['all', 'last3', 'custom']);
  assert.deepEqual(datePresets(['2025-11', '2026-04']).map((p) => p.id), ['all', 'last3', 'ytd', 'custom']);
});

test('applyFilters combina periodo, lista y rango; días comparan con meses', () => {
  const keys = dateKeys(SALES_COLUMNS, SALES_ROWS, 'Mes');
  const filters = [{ column: 'Mes', kind: 'date' }, { column: 'Sucursal', kind: 'select' }, { column: 'Monto', kind: 'range' }];
  const all = applyFilters(SALES_COLUMNS, SALES_ROWS, filters, {});
  assert.equal(all, SALES_ROWS);
  const out = applyFilters(SALES_COLUMNS, SALES_ROWS, filters, { Mes: { preset: 'last3' }, Sucursal: ['Centro'] });
  assert.equal(out.length, 3);
  assert.ok(out.every((r) => r[1] === 'Centro' && r[0] >= keys.at(-3)));
  const min = Math.max(...out.map((r) => r[2]));
  assert.equal(applyFilters(SALES_COLUMNS, SALES_ROWS, filters, { Mes: { preset: 'last3' }, Sucursal: ['Centro'], Monto: { min, max: null } }).length, 1);

  const days = [['2026-01-31T00:00:00', 1], ['2026-02-01T00:00:00', 2], [null, 3]];
  const dayOut = applyFilters(['Fecha', 'N'], days, [{ column: 'Fecha', kind: 'date' }], { Fecha: { preset: 'custom', from: '2026-02-01', to: null } });
  assert.deepEqual(dayOut.map((r) => r[1]), [2]);
});

test('defaultValue, isActive y describeValue', () => {
  const date = { column: 'Mes', kind: 'date', default: { preset: 'last6' } };
  assert.deepEqual(defaultValue(date), { preset: 'last6', from: null, to: null });
  assert.ok(isActive(date, defaultValue(date)));
  assert.equal(describeValue(date, defaultValue(date)), 'últimos 6 meses');
  const list = { column: 'Sucursal', kind: 'select' };
  assert.deepEqual(defaultValue(list), []);
  assert.equal(isActive(list, []), false);
  assert.equal(describeValue(list, ['A', 'B']), 'A, B');
  assert.equal(formatDateKey('2026-09'), 'sep 2026');
  assert.equal(formatDateKey('2026-09-15'), '15/09/2026');
});
