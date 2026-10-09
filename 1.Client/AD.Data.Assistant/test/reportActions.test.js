import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SALES_COLUMNS, SALES_ROWS } from '../src/mocks/salesByBranch.js';
import { describeScope, segmentSize } from '../src/shared/reportActions.js';

test('segmentSize suma ganadas, no ganadas o todas del periodo y sucursales del reporte', () => {
  assert.equal(segmentSize(SALES_COLUMNS, SALES_ROWS, { months: 6, criterion: 'won' }), 516);
  assert.equal(segmentSize(SALES_COLUMNS, SALES_ROWS, { months: 6, criterion: 'all' }), 1842);
  assert.equal(segmentSize(SALES_COLUMNS, SALES_ROWS, { months: 6, criterion: 'notWon' }), 1842 - 516);
  assert.equal(segmentSize(SALES_COLUMNS, SALES_ROWS, { months: 3, criterion: 'won' }), 84 + 90 + 97);
});

test('segmentSize respeta el filtro de sucursales', () => {
  const rows = SALES_ROWS.filter((r) => r[0] >= '2026-01' && r[1] === 'Centro');
  const expected = rows.reduce((a, r) => a + r[4], 0);
  assert.equal(segmentSize(SALES_COLUMNS, SALES_ROWS, { months: 6, branches: ['Centro'], criterion: 'won' }), expected);
});

test('describeScope', () => {
  assert.equal(describeScope({ months: 3, branches: ['Centro', 'Norte'] }), 'últimos 3 meses · Centro, Norte');
  assert.equal(describeScope({ months: 6 }), 'últimos 6 meses · todas las sucursales');
});
