// Contenido inicial del menú lateral (maqueta). Solo «Análisis de ventas» trae un turno completo;
// el resto son títulos de ejemplo.
import { SALES_COLUMNS, SALES_QUERIES, SALES_QUESTION, SALES_ROWS } from './salesByBranch';

const at = (iso) => new Date(iso).getTime();

const salesTurn = {
  id: 'seed-turn-1',
  question: SALES_QUESTION,
  askedAt: at('2026-10-09T10:24:00'),
  answeredAt: at('2026-10-09T10:25:00'),
  status: 'ok',
  answer: 'Se analizaron las ventas por sucursal de los últimos 6 meses con sus principales indicadores, tendencias y participación.',
  phases: [
    { id: 'interpret', label: 'Interpretando tu consulta', ms: 2400 },
    { id: 'sql', label: 'Generando consulta SQL', ms: 1800 },
    { id: 'execute', label: 'Ejecutando en SQL Server', ms: 4100 },
    { id: 'process', label: 'Procesando resultados', ms: 1200 },
    { id: 'charts', label: 'Generando visualizaciones', ms: 700 },
  ],
  columns: SALES_COLUMNS,
  rows: SALES_ROWS,
  queries: SALES_QUERIES,
  view: { branches: null },
  elapsedMs: 10200,
  runId: 'seed-run-1',
};

const chat = (id, title, icon, turns = [], updatedAt = at('2026-10-08T09:00:00')) => ({
  id, title, icon, pinned: false, createdAt: updatedAt, updatedAt, conversationId: null, turns,
});

export const SEED_CHATS = [
  chat('seed-ventas', 'Análisis de ventas', 'fa-chart-simple', [salesTurn], at('2026-10-09T10:25:00')),
  chat('seed-clientes', 'Clientes y retención', 'fa-user-group'),
  chat('seed-oportunidades', 'Oportunidades comerciales', 'fa-handshake'),
  chat('seed-sucursal', 'Desempeño por sucursal', 'fa-store'),
  chat('seed-cartera', 'Cartera de clientes', 'fa-address-book'),
  chat('seed-inventario', 'Inventario y abastecimiento', 'fa-boxes-stacked'),
  chat('seed-ejecutivos', 'Indicadores ejecutivos', 'fa-gauge-high'),
  chat('seed-campanas', 'Efectividad de campañas', 'fa-bullhorn', [], at('2026-09-20T09:00:00')),
];

const report = (id, title, kind, source = null) => ({
  id, title, kind, source, months: 6, branches: null, createdAt: at('2026-10-01T09:00:00'),
});

// kind → color e icono en el menú (pdf, analisis, segmento, pipeline, ejecutivo)
export const SEED_REPORTS = [
  report('seed-r1', 'Ventas mensuales', 'pdf', 'sales'),
  report('seed-r2', 'Desempeño por sucursal', 'analisis', 'sales'),
  report('seed-r3', 'Clientes por segmento', 'analisis'),
  report('seed-r4', 'Eficiencia comercial', 'pipeline'),
  report('seed-r5', 'Pipeline de oportunidades', 'pipeline'),
  report('seed-r6', 'Reportes ejecutivos', 'ejecutivo'),
  report('seed-r7', 'Cobranza por zona', 'pdf'),
];

// Usuario de la sesión del CEM (en duro hasta integrar con AD.Web).
export const CURRENT_USER = { initials: 'JG', name: 'Usuario CEM' };
