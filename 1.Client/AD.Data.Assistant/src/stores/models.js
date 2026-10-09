import { defineStore } from 'pinia';
import { getModels } from '@/services/dataAgentApi';
import { resolveRunSettings } from '@/shared/models';
import { $notify } from '@/shared/notify';
import { usePrefsStore } from './prefs';

// Catálogo de GET /api/models y la selección efectiva (preferencias validadas contra el catálogo).
export const useModelsStore = defineStore('models', {
  state: () => ({ catalog: null, loading: false }),
  getters: {
    current(state) {
      if (!state.catalog) return null;
      const prefs = usePrefsStore();
      return resolveRunSettings(state.catalog, prefs.model, prefs.effort);
    },
    currentInfo() {
      return this.catalog?.models.find((m) => m.id === this.current?.model) ?? null;
    },
  },
  actions: {
    async load() {
      if (this.catalog || this.loading) return;
      this.loading = true;
      try {
        this.catalog = await getModels();
      } catch (err) {
        $notify.handleError(err, 'No se pudo cargar la lista de modelos.');
      } finally {
        this.loading = false;
      }
    },
  },
});
