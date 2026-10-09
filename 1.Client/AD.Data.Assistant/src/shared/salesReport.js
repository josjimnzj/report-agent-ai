// Funciones puras: del resultado tabular (columns/rows del agente) al modelo del reporte.
// Todas las cifras del dashboard, los insights y el Markdown salen de aquí, así que siempre cuadran.

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const PERIODS = [
  { value: 3, text: 'Últimos 3 meses' },
  { value: 6, text: 'Últimos 6 meses' },
];

export function monthLabel(key) {
  const [y, m] = String(key).split('-').map(Number);
  return m >= 1 && m <= 12 ? MONTHS[m - 1] : String(key);
}

export function monthShort(key) {
  return monthLabel(key).slice(0, 3);
}

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

export const fmtMoney = (v) => money.format(v ?? 0);
export const fmtInt = (v) => integer.format(v ?? 0);
export const fmtPct = (v, digits = 0) => `${(v * 100).toFixed(digits)}%`;

export function fmtCompactMoney(v) {
  if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}K`;
  return `$${v}`;
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const change = (cur, prev) => (prev ? (cur - prev) / prev : null);

// Agrupa filas «una por mes y sucursal» en meses ordenados con el detalle por sucursal.
function readMonths(columns, rows, branches) {
  const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
  const byMonth = new Map();
  for (const r of rows) {
    const branch = r[idx.Sucursal];
    if (!branches.includes(branch)) continue;
    const key = r[idx.Mes];
    if (!byMonth.has(key)) {
      byMonth.set(key, { key, label: monthLabel(key), byBranch: Object.fromEntries(branches.map((b) => [b, 0])), total: 0, opportunities: 0, won: 0 });
    }
    const m = byMonth.get(key);
    const amount = Number(r[idx.Monto]) || 0;
    m.byBranch[branch] += amount;
    m.total += amount;
    m.opportunities += Number(r[idx.Oportunidades]) || 0;
    m.won += Number(r[idx.Ganadas]) || 0;
  }
  return [...byMonth.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

function kpisFor(months) {
  const sales = sum(months.map((m) => m.total));
  const opportunities = sum(months.map((m) => m.opportunities));
  const won = sum(months.map((m) => m.won));
  return {
    sales,
    opportunities,
    won,
    conversion: opportunities ? won / opportunities : 0,
    ticket: won ? sales / won : 0,
  };
}

/**
 * @param {string[]} columns  ['Mes', 'Sucursal', 'Monto', 'Oportunidades', 'Ganadas']
 * @param {Array[]}  rows     una fila por mes y sucursal
 * @param {{ months?: number, branches?: string[] }} [opts]
 */
export function buildReport(columns, rows, opts = {}) {
  const n = opts.months ?? 6;
  const iBranch = columns.indexOf('Sucursal');
  const allBranches = [...new Set(rows.map((r) => r[iBranch]))];
  const branches = opts.branches?.length ? allBranches.filter((b) => opts.branches.includes(b)) : allBranches;

  const parsed = readMonths(columns, rows, branches);
  const current = parsed.slice(-n);
  const previous = parsed.slice(-2 * n, -n);

  const cur = kpisFor(current);
  const prev = previous.length === n ? kpisFor(previous) : null;

  const kpis = [
    { id: 'sales', label: 'Ventas totales', value: cur.sales, display: fmtMoney(cur.sales), icon: 'fa-chart-column',
      delta: prev ? change(cur.sales, prev.sales) : null, unit: 'pct' },
    { id: 'opportunities', label: 'Oportunidades', value: cur.opportunities, display: fmtInt(cur.opportunities), icon: 'fa-users',
      delta: prev ? change(cur.opportunities, prev.opportunities) : null, unit: 'pct' },
    { id: 'conversion', label: 'Tasa de conversión', value: cur.conversion, display: fmtPct(cur.conversion), icon: 'fa-filter',
      delta: prev ? cur.conversion - prev.conversion : null, unit: 'pp' },
    { id: 'ticket', label: 'Ticket promedio', value: cur.ticket, display: fmtMoney(cur.ticket), icon: 'fa-tag',
      delta: prev ? change(cur.ticket, prev.ticket) : null, unit: 'pct' },
  ];

  const first = current[0];
  const last = current[current.length - 1];
  const branchStats = branches.map((name) => {
    const total = sum(current.map((m) => m.byBranch[name]));
    const prevTotal = previous.length ? sum(previous.map((m) => m.byBranch[name])) : null;
    return {
      name,
      total,
      share: cur.sales ? total / cur.sales : 0,
      growth: change(last.byBranch[name], first.byBranch[name]),
      vsPrevious: prevTotal ? change(total, prevTotal) : null,
    };
  });

  return {
    months: current,
    previousMonths: previous,
    branches,
    allBranches,
    kpis,
    current: cur,
    previous: prev,
    branchStats,
    periodGrowth: change(last.total, first.total),
    range: { from: first.label, to: last.label, months: current.length },
  };
}

export function topBranches(report, count) {
  return [...report.branchStats].sort((a, b) => b.total - a.total).slice(0, count).map((b) => b.name);
}

const signed = (v, digits = 0) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(digits)}`;

export function buildInsights(report) {
  const stats = report.branchStats;
  if (!stats.length) return [];
  const leader = [...stats].sort((a, b) => b.share - a.share)[0];
  const fastest = [...stats].sort((a, b) => b.growth - a.growth)[0];
  const salesKpi = report.kpis.find((k) => k.id === 'sales');
  const conv = report.kpis.find((k) => k.id === 'conversion');
  const avgShare = 1 / stats.length;
  const { from, to } = report.range;

  const insights = [];

  insights.push({
    title: report.periodGrowth >= 0 ? 'Crecimiento sostenido' : 'Caída de ventas',
    text: salesKpi.delta != null
      ? `Las ventas totales suman ${fmtMoney(report.current.sales)}, ${signed(salesKpi.delta, 1)}% frente al periodo anterior. De ${from} a ${to} la venta mensual varió ${signed(report.periodGrowth, 1)}%.`
      : `Las ventas totales suman ${fmtMoney(report.current.sales)}. De ${from} a ${to} la venta mensual varió ${signed(report.periodGrowth, 1)}%.`,
  });

  insights.push({
    title: `${leader.name} lidera en ventas`,
    text: `${leader.name} concentra el ${fmtPct(leader.share, 1)} del total (${fmtMoney(leader.total)}) y su venta mensual creció ${signed(leader.growth, 1)}% en el periodo.`,
  });

  if (conv.delta != null) {
    insights.push({
      title: conv.delta >= 0 ? 'Mejora en conversión' : 'Baja en conversión',
      text: `La tasa de conversión es ${fmtPct(report.current.conversion, 1)} (${signed(conv.delta, 1)} pp): ${fmtInt(report.current.won)} oportunidades ganadas de ${fmtInt(report.current.opportunities)}.`,
    });
  }

  insights.push({
    title: `Oportunidad en ${fastest.name}`,
    text: fastest.share < avgShare
      ? `${fastest.name} es la sucursal que más creció (${signed(fastest.growth, 1)}% de ${from} a ${to}), pero su participación (${fmtPct(fastest.share, 1)}) sigue por debajo del promedio (${fmtPct(avgShare, 1)}).`
      : `${fastest.name} es la sucursal que más creció (${signed(fastest.growth, 1)}% de ${from} a ${to}) con una participación del ${fmtPct(fastest.share, 1)}.`,
  });

  return insights;
}

export function buildMarkdown(report, { title, description, insights = buildInsights(report), queries = [] } = {}) {
  const lines = [];
  lines.push(`# ${title ?? 'Reporte'}`, '');
  if (description) lines.push(description, '');
  lines.push('## Indicadores', '', '| Indicador | Valor | vs. periodo anterior |', '|---|---:|---:|');
  for (const k of report.kpis) {
    const d = k.delta == null ? '—' : k.unit === 'pp' ? `${signed(k.delta, 1)} pp` : `${signed(k.delta, 1)}%`;
    lines.push(`| ${k.label} | ${k.display} | ${d} |`);
  }
  lines.push('', '## Detalle de ventas por sucursal', '');
  lines.push(`| Mes | ${report.branches.join(' | ')} | Total |`);
  lines.push(`|---|${report.branches.map(() => '---:').join('|')}|---:|`);
  for (const m of report.months) {
    lines.push(`| ${m.label} | ${report.branches.map((b) => fmtInt(m.byBranch[b])).join(' | ')} | ${fmtInt(m.total)} |`);
  }
  lines.push('', '## Participación por sucursal', '', '| Sucursal | Ventas | Participación |', '|---|---:|---:|');
  for (const b of report.branchStats) lines.push(`| ${b.name} | ${fmtMoney(b.total)} | ${fmtPct(b.share, 1)} |`);
  lines.push('', '## Insights clave', '');
  insights.forEach((i, n) => lines.push(`${n + 1}. **${i.title}.** ${i.text}`));
  if (queries.length) {
    lines.push('', '## SQL', '');
    for (const q of queries) lines.push('```sql', q, '```', '');
  }
  return lines.join('\n').trimEnd() + '\n';
}
