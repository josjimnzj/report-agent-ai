import { defineStore } from 'pinia';
import { SEED_REPORTS } from '@/mocks/seeds';
import { SCHEMA_VERSION, migrate } from '@/shared/persist';
import { newId } from '@/shared/ids';
import { safeStorage } from './storage';

const defaults = () => ({ version: SCHEMA_VERSION, reports: structuredClone(SEED_REPORTS) });

export const useReportsStore = defineStore('reports', {
  state: defaults,
  getters: {
    sorted: (s) => [...s.reports].sort((a, b) => b.createdAt - a.createdAt),
  },
  actions: {
    add({ title, kind = 'analisis', source = 'sales', months, branches, chatId }) {
      const report = { id: newId(), title, kind, source, months, branches, chatId, createdAt: Date.now() };
      this.reports.push(report);
      return report;
    },
    rename(id, title) {
      const r = this.reports.find((x) => x.id === id);
      if (r && title.trim()) r.title = title.trim();
    },
    remove(id) {
      this.reports = this.reports.filter((r) => r.id !== id);
    },
  },
  persist: {
    key: 'ada.reports',
    storage: safeStorage,
    serializer: { serialize: JSON.stringify, deserialize: (s) => migrate(JSON.parse(s), defaults(), { 1: (st) => st }) },
  },
});
