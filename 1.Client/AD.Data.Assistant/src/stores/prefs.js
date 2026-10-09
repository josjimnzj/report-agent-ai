import { defineStore } from 'pinia';
import { SCHEMA_VERSION } from '@/shared/persist';
import { safeStorage } from './storage';

export const usePrefsStore = defineStore('prefs', {
  state: () => ({
    version: SCHEMA_VERSION,
    sidebarCollapsed: false,
    chatExpanded: false,
    months: 6,
  }),
  persist: { key: 'ada.prefs', storage: safeStorage },
});
