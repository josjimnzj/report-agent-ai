import { defineStore } from 'pinia';
import { SEED_CHATS } from '@/mocks/seeds';
import { SCHEMA_VERSION, compactTurn, migrate } from '@/shared/persist';
import { normalizeTags, collectTags } from '@/shared/tags';
import { safeStorage } from './storage';
import { IS_API } from '@/services/mode';
import { docsApi } from '@/services/docsApi';

// En modo API los chats vienen de Neon; en modo maqueta arrancan con ejemplos.
const defaults = () => ({ version: SCHEMA_VERSION, chats: IS_API ? [] : structuredClone(SEED_CHATS) });

// v1 → v2: se quitan los iconos y se añaden etiquetas.
const UPGRADES = {
  1: (s) => ({ ...s, chats: (s.chats ?? []).map(({ icon, ...c }) => ({ ...c, tags: c.tags ?? [] })) }),
};

export const useChatsStore = defineStore('chats', {
  state: defaults,
  getters: {
    sorted: (s) => [...s.chats].sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt)),
    byId: (s) => (id) => s.chats.find((c) => c.id === id),
    allTags: (s) => collectTags(s.chats),
  },
  actions: {
    upsert(chat) {
      const saved = {
        id: chat.id,
        title: chat.title,
        tags: normalizeTags(chat.tags),
        pinned: chat.pinned ?? false,
        createdAt: chat.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        conversationId: chat.conversationId ?? null,
        provider: chat.provider ?? null,
        // Copia profunda: el chat activo de la sesión no debe compartir referencias con lo guardado.
        turns: JSON.parse(JSON.stringify(chat.turns.filter((t) => t.status !== 'running'))).map(compactTurn),
      };
      const i = this.chats.findIndex((c) => c.id === chat.id);
      if (i >= 0) this.chats.splice(i, 1, { ...this.chats[i], ...saved, pinned: this.chats[i].pinned });
      else this.chats.push(saved);
      docsApi.save('chats', this.byId(chat.id));
      return saved;
    },
    rename(id, title) {
      const c = this.byId(id);
      if (c && title.trim()) { c.title = title.trim(); docsApi.save('chats', c); }
    },
    update(id, { title, tags }) {
      const c = this.byId(id);
      if (!c) return;
      if (title?.trim()) c.title = title.trim();
      if (tags) c.tags = normalizeTags(tags);
      docsApi.save('chats', c);
    },
    togglePin(id) {
      const c = this.byId(id);
      if (!c) return;
      c.pinned = !c.pinned;
      docsApi.save('chats', c);
    },
    remove(id) {
      this.chats = this.chats.filter((c) => c.id !== id);
      docsApi.remove('chats', id);
    },
    /** Modo API: carga los chats guardados en Neon. */
    async load() {
      const list = await docsApi.list('chats');
      if (list) this.chats = list.map((c) => ({ tags: [], pinned: false, turns: [], ...c }));
    },
  },
  persist: IS_API ? false : {
    key: 'ada.chats',
    storage: safeStorage,
    serializer: { serialize: JSON.stringify, deserialize: (s) => migrate(JSON.parse(s), defaults(), UPGRADES) },
  },
});
