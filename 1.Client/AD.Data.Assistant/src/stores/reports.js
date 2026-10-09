import { defineStore } from 'pinia';
import { SEED_REPORTS } from '@/mocks/seeds';
import { SCHEMA_VERSION, migrate } from '@/shared/persist';
import { newId } from '@/shared/ids';
import { safeStorage } from './storage';
import { IS_API } from '@/services/mode';
import { docsApi } from '@/services/docsApi';
import { MAX_SAVED_ROWS } from '@/shared/persist';

const defaults = () => ({ version: SCHEMA_VERSION, reports: IS_API ? [] : structuredClone(SEED_REPORTS) });

const find = (s, id) => s.reports.find((x) => x.id === id);

export const useReportsStore = defineStore('reports', {
  state: defaults,
  getters: {
    sorted: (s) => [...s.reports].sort((a, b) => b.createdAt - a.createdAt),
  },
  actions: {
    /**
     * `result` (modo API) guarda una copia del resultado para poder reabrir el reporte sin volver a consultar:
     * { answer, columns, rows (máx. 500), queries, chart }.
     */
    add({ title, kind = 'analisis', source = 'sales', months, branches, chatId, published = null, result = null }) {
      const snapshot = result ? {
        answer: result.answer ?? '', columns: result.columns ?? [], rows: (result.rows ?? []).slice(0, MAX_SAVED_ROWS),
        totalRows: result.totalRows ?? result.rows?.length ?? 0, queries: result.queries ?? [], chart: result.chart ?? null,
        chartType: result.chartType ?? null, chartAvg: result.chartAvg ?? null,
      } : null;
      const report = { id: newId(), title, kind, source: snapshot ? 'snapshot' : source, months, branches, chatId, published, result: snapshot, createdAt: Date.now() };
      this.reports.push(report);
      docsApi.save('reports', report);
      return report;
    },
    rename(id, title) {
      const r = find(this, id);
      if (r && title.trim()) { r.title = title.trim(); docsApi.save('reports', r); }
    },
    /** Publica el reporte como opción del menú del CEM (simulado). */
    publish(id, { label, section, audience, rolling }) {
      const r = find(this, id);
      if (r) { r.published = { label, section, audience, rolling, at: Date.now() }; docsApi.save('reports', r); }
    },
    unpublish(id) {
      const r = find(this, id);
      if (r) { r.published = null; docsApi.save('reports', r); }
    },
    remove(id) {
      this.reports = this.reports.filter((r) => r.id !== id);
      docsApi.remove('reports', id);
    },
    /** Modo API: carga los reportes guardados en Neon. */
    async load() {
      const list = await docsApi.list('reports');
      if (list) this.reports = list;
    },
  },
  persist: IS_API ? false : {
    key: 'ada.reports',
    storage: safeStorage,
    serializer: { serialize: JSON.stringify, deserialize: (s) => migrate(JSON.parse(s), defaults(), { 1: (st) => st }) },
  },
});
