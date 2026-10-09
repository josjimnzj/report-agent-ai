import { defineStore } from 'pinia';
import { SCHEMA_VERSION } from '@/shared/persist';
import { safeStorage } from './storage';

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
  persist: { key: 'ada.prefs', storage: safeStorage },
});
