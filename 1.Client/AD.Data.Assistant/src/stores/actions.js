import { defineStore } from 'pinia';
import { SCHEMA_VERSION, migrate } from '@/shared/persist';
import { newId } from '@/shared/ids';
import { safeStorage } from './storage';

const defaults = () => ({ version: SCHEMA_VERSION, segments: [], campaigns: [], dialog: null });

// Segmentos y campañas creados desde reportes (simulados: se guardan solo en este navegador).
// `dialog` es el diálogo de acción abierto: { mode: 'segment'|'campaign'|'publish', context }.
export const useActionsStore = defineStore('actions', {
  state: defaults,
  getters: {
    recent: (s) => [
      ...s.segments.map((x) => ({ ...x, type: 'segment' })),
      ...s.campaigns.map((x) => ({ ...x, type: 'campaign' })),
    ].sort((a, b) => b.createdAt - a.createdAt),
  },
  actions: {
    open(mode, context) {
      this.dialog = { mode, context };
    },
    close() {
      this.dialog = null;
    },
    addSegment({ name, description, criterion, months, branches, size, sourceTitle }) {
      const segment = { id: newId(), name, description, criterion, months, branches, size, sourceTitle, createdAt: Date.now() };
      this.segments.push(segment);
      return segment;
    },
    addCampaign({ name, segmentId, segmentName, channel, startAt, size, sourceTitle }) {
      const campaign = { id: newId(), name, segmentId, segmentName, channel, startAt, size, sourceTitle, status: 'Programada', createdAt: Date.now() };
      this.campaigns.push(campaign);
      return campaign;
    },
    remove(type, id) {
      if (type === 'segment') this.segments = this.segments.filter((x) => x.id !== id);
      else this.campaigns = this.campaigns.filter((x) => x.id !== id);
    },
  },
  persist: {
    key: 'ada.actions',
    storage: safeStorage,
    paths: ['version', 'segments', 'campaigns'],
    serializer: { serialize: JSON.stringify, deserialize: (s) => migrate(JSON.parse(s), defaults()) },
  },
});
