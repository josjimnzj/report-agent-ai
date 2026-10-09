import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayOf, turnFromDone } from '../src/shared/turnResult.js';

const prev = {
  columns: ['Mes', 'Ventas'], rows: [['2026-01', 1], ['2026-02', 2]], totalRows: 2, queries: ['SELECT 1'],
  view: { chart: { type: 'line', x: 'Mes', y: ['Ventas'] } }, insights: [{ kind: 'finding', title: 'Sube', text: 'Febrero duplica enero.' }],
};

test('displayOf entiende display y el showChart anterior', () => {
  assert.equal(displayOf({ display: 'table_only' }), 'table_only');
  assert.equal(displayOf({ showChart: false }), 'table_first');
  assert.equal(displayOf({}), 'chart');
});

test('«solo tabla» sobre el resultado anterior: reutiliza datos y fija la tabla', () => {
  const t = turnFromDone({ status: 'ok', answer: 'Aquí está en tabla.', columns: [], rows: [], queries: [], display: 'table_only', reusePrevious: true, view: { chart: null }, askChart: true }, prev);
  assert.equal(t.reused, true);
  assert.deepEqual(t.columns, prev.columns);
  assert.deepEqual(t.queries, ['SELECT 1']);
  assert.equal(t.view.chartType, 'table');
  assert.equal(t.showChart, false);
  assert.equal(t.askChart, false);
  assert.deepEqual(t.insights, prev.insights); // sin insights nuevos se conservan
  assert.deepEqual(t.view.chart, prev.view.chart);
});

test('otra gráfica sobre el anterior y consulta nueva', () => {
  const bars = turnFromDone({ status: 'ok', answer: 'En barras.', columns: [], rows: [], display: 'chart', reusePrevious: true, view: { chart: { type: 'bar', x: 'Mes', y: ['Ventas'] } } }, prev);
  assert.equal(bars.showChart, true);
  assert.equal(bars.view.chart.type, 'bar');
  assert.equal(bars.view.chartType, undefined);
  const fresh = turnFromDone({ status: 'ok', answer: 'x', columns: ['A'], rows: [[1]], totalRows: 1, queries: ['SELECT 2'], display: 'table_first', insights: [{ kind: 'alert', title: 'a', text: 'b' }], view: { chart: null } }, prev);
  assert.equal(fresh.reused, false);
  assert.deepEqual(fresh.columns, ['A']);
  assert.equal(fresh.display, 'table_first');
  assert.equal(fresh.insights[0].kind, 'alert');
  // reusePrevious sin turno anterior: no inventa datos.
  assert.deepEqual(turnFromDone({ status: 'ok', columns: [], rows: [], reusePrevious: true }, null).columns, []);
});
