import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SALES_COLUMNS, SALES_ROWS } from '../src/mocks/salesByBranch.js';
import { buildInsights, buildMarkdown, buildReport, monthLabel, topBranches } from '../src/shared/salesReport.js';

const kpi = (r, id) => r.kpis.find((k) => k.id === id);

test('monthLabel convierte yyyy-MM a nombre de mes', () => {
  assert.equal(monthLabel('2026-01'), 'Enero');
  assert.equal(monthLabel('2026-12'), 'Diciembre');
  assert.equal(monthLabel('x'), 'x');
});

test('6 meses: totales, comparación y participación cuadran', () => {
  const r = buildReport(SALES_COLUMNS, SALES_ROWS, { months: 6 });
  assert.deepEqual(r.months.map((m) => m.key), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
  assert.equal(r.current.sales, 1059500);
  assert.equal(r.previous.sales, 950600);
  assert.equal(r.current.opportunities, 1842);
  assert.equal(r.current.won, 516);
  assert.equal(r.months[0].total, 140700);
  assert.equal(r.months[3].total, 171000);
  assert.ok(Math.abs(kpi(r, 'conversion').delta - (516 / 1842 - 427 / 1706)) < 1e-12);
  const shares = r.branchStats.reduce((a, b) => a + b.share, 0);
  assert.ok(Math.abs(shares - 1) < 1e-12);
  assert.equal(r.branchStats.reduce((a, b) => a + b.total, 0), r.current.sales);
});

test('3 meses compara contra los 3 meses previos', () => {
  const r = buildReport(SALES_COLUMNS, SALES_ROWS, { months: 3 });
  assert.equal(r.range.from, 'Abril');
  assert.equal(r.current.sales, 171000 + 202100 + 209500);
  assert.equal(r.previous.sales, 140700 + 156300 + 179900);
});

test('sin periodo anterior completo no hay deltas', () => {
  const r = buildReport(SALES_COLUMNS, SALES_ROWS.slice(-36), { months: 6 });
  assert.equal(r.previous, null);
  assert.ok(r.kpis.every((k) => k.delta === null));
});

test('filtrar sucursales recalcula todos los indicadores con sus propias filas', () => {
  const all = buildReport(SALES_COLUMNS, SALES_ROWS, { months: 6 });
  const top = topBranches(all, 3);
  assert.deepEqual(top, ['Centro', 'Norte', 'Oriente']);
  const r = buildReport(SALES_COLUMNS, SALES_ROWS, { months: 6, branches: top });
  assert.deepEqual(r.branches, top);
  const rows = SALES_ROWS.filter((x) => x[0] >= '2026-01' && top.includes(x[1]));
  assert.equal(r.current.sales, rows.reduce((a, x) => a + x[2], 0));
  assert.equal(r.current.opportunities, rows.reduce((a, x) => a + x[3], 0));
  assert.equal(r.current.won, rows.reduce((a, x) => a + x[4], 0));
  assert.equal(kpi(r, 'ticket').value, r.current.sales / r.current.won);
});

test('insights citan cifras del propio reporte', () => {
  const r = buildReport(SALES_COLUMNS, SALES_ROWS, { months: 6 });
  const ins = buildInsights(r);
  assert.equal(ins.length, 4);
  assert.match(ins[1].title, /^Centro lidera/);
  assert.match(ins[3].title, /Pacífico/);
  assert.match(ins[0].text, /\$1,059,500/);
});

test('buildMarkdown incluye indicadores, detalle, participación y SQL', () => {
  const r = buildReport(SALES_COLUMNS, SALES_ROWS, { months: 6 });
  const md = buildMarkdown(r, { title: 'Ventas', queries: ['SELECT 1'] });
  assert.match(md, /^# Ventas\n/);
  assert.match(md, /\| Ventas totales \| \$1,059,500 \|/);
  assert.match(md, /\| Junio \| 47,100 \|/);
  assert.match(md, /```sql\nSELECT 1\n```/);
});

test('buildMarkdown con gráficas no exporta las tablas de detalle ni participación', () => {
  const r = buildReport(SALES_COLUMNS, SALES_ROWS, { months: 6 });
  const md = buildMarkdown(r, { title: 'Ventas', charts: [{ title: 'Ventas por sucursal', src: 'data:image/svg+xml;base64,AAA' }] });
  assert.match(md, /\| Ventas totales \| \$1,059,500 \|/); // indicadores
  assert.match(md, /### Ventas por sucursal\n\n!\[Ventas por sucursal\]\(data:image/);
  assert.doesNotMatch(md, /Detalle de ventas por sucursal|\| Junio \| 47,100 \|/);
  assert.match(md, /## Insights clave/);
});
