import { defineStore } from 'pinia';
import { SCHEMA_VERSION } from '@/shared/persist';
import { safeStorage } from './storage';
import { IS_API } from '@/services/mode';
import { docsApi } from '@/services/docsApi';

export const usePrefsStore = defineStore('prefs', {
  state: () => ({
    version: SCHEMA_VERSION,
    sidebarCollapsed: false,
    chatExpanded: false,
    months: 6,
    // null = el valor por defecto del catálogo (/api/models).
    model: null,
    effort: null,
  }),
  actions: {
    /** Modo API: carga las preferencias de Neon y guarda cada cambio (con un pequeño retardo). */
    async load() {
      // Se lista la colección (no se pide el documento) para no provocar un 404 la primera vez.
      const doc = (await docsApi.list('prefs'))?.find((d) => d.id === 'default');
      if (doc) this.$patch(Object.fromEntries(Object.entries(doc).filter(([k]) => k in this.$state && k !== 'version')));
      let timer = null;
      this.$subscribe(() => {
        clearTimeout(timer);
        timer = setTimeout(() => docsApi.save('prefs', { id: 'default', ...this.$state }), 800);
      });
    },
  },
  persist: IS_API ? false : { key: 'ada.prefs', storage: safeStorage },
});
