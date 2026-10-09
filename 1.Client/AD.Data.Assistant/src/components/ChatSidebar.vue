<template>
  <aside
    class="card no-print flex h-full flex-col overflow-hidden transition-[width] duration-200"
    :class="collapsed ? 'w-[60px]' : drawer ? 'w-full' : 'w-[270px]'"
    aria-label="Conversaciones y reportes"
  >
    <div class="flex items-center gap-1 px-3 pt-3" :class="collapsed ? 'flex-col' : 'justify-between'">
      <button
        type="button"
        class="btn btn-primary"
        :class="collapsed ? 'h-9 w-9 justify-center p-0' : ''"
        title="Nuevo chat"
        @click="$emit('new-chat')"
      >
        <i class="fa-solid fa-plus" aria-hidden="true" />
        <span v-if="!collapsed">Nuevo chat</span>
      </button>
      <button v-if="drawer" type="button" class="icon-btn border border-line" title="Cerrar menú" @click="$emit('close')">
        <i class="fa-solid fa-xmark" aria-hidden="true" /><span class="sr-only">Cerrar menú</span>
      </button>
      <button
        v-else
        type="button"
        class="icon-btn border border-line"
        :title="collapsed ? 'Expandir menú' : 'Contraer menú'"
        :aria-expanded="!collapsed"
        @click="prefs.sidebarCollapsed = !prefs.sidebarCollapsed"
      >
        <i class="fa-solid" :class="collapsed ? 'fa-chevron-right' : 'fa-chevron-left'" aria-hidden="true" />
      </button>
    </div>

    <template v-if="!collapsed">
      <div class="px-3 pt-3">
        <DxTextBox
          v-model:value="search"
          mode="search"
          placeholder="Buscar por título o etiqueta…"
          value-change-event="input"
          :input-attr="{ 'aria-label': 'Buscar conversaciones y reportes' }"
        />
      </div>

      <nav class="scroll-thin flex-1 overflow-y-auto px-2 pb-3">
        <h2 class="section-title px-2 pb-1 pt-4">Conversaciones</h2>

        <div v-if="chats.allTags.length" class="flex flex-wrap gap-1.5 px-2 pb-2 pt-1" role="group" aria-label="Filtrar por etiqueta">
          <button
            v-for="t in chats.allTags"
            :key="t"
            type="button"
            class="tag-chip cursor-pointer"
            :class="activeTag === t ? 'tag-chip-active' : ''"
            :aria-pressed="activeTag === t"
            @click="activeTag = activeTag === t ? null : t"
          >
            {{ t }}
          </button>
        </div>

        <ul class="m-0 list-none p-0">
          <li v-for="c in visibleChats" :key="c.id" class="group relative">
            <button
              type="button"
              class="flex w-full cursor-pointer flex-col items-start gap-1 rounded-lg border-0 px-2.5 py-2 text-left [@media(hover:none)]:pr-[92px]"
              :class="c.id === activeChatId ? 'bg-[#e6f4fb]' : 'bg-transparent hover:bg-canvas'"
              :title="c.title"
              :aria-current="c.id === activeChatId ? 'page' : undefined"
              @click="$emit('open-chat', c.id)"
            >
              <span class="flex w-full items-center gap-2 pr-1">
                <span class="flex-1 truncate text-[13.5px]" :class="c.id === activeChatId ? 'font-semibold text-brandblue' : 'text-ink'">{{ c.title }}</span>
                <i v-if="c.pinned" class="fa-solid fa-thumbtack text-[11px] text-ink-muted group-hover:invisible" aria-label="Fijado" />
              </span>
              <span v-if="c.tags?.length" class="flex flex-wrap gap-1">
                <span v-for="t in c.tags" :key="t" class="tag-chip tag-chip-sm">{{ t }}</span>
              </span>
            </button>
            <div class="absolute right-1 top-1.5 flex items-center rounded-md bg-white/95 opacity-0 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
              <button type="button" class="icon-btn h-7 w-7" :title="c.pinned ? 'Desfijar' : 'Fijar'" @click="chats.togglePin(c.id)">
                <i class="fa-solid fa-thumbtack text-[12px]" :class="c.pinned ? 'text-brandlight' : ''" aria-hidden="true" />
              </button>
              <button type="button" class="icon-btn h-7 w-7" title="Editar título y etiquetas" @click="editing = c">
                <i class="fa-solid fa-pen text-[12px]" aria-hidden="true" />
              </button>
              <button type="button" class="icon-btn h-7 w-7" title="Eliminar" @click="removeChat(c)">
                <i class="fa-solid fa-trash text-[12px]" aria-hidden="true" />
              </button>
            </div>
          </li>
          <li v-if="!visibleChats.length" class="px-2 py-2 text-[13px] muted">Sin coincidencias.</li>
        </ul>
        <button
          v-if="filteredChats.length > LIMIT && !search && !activeTag"
          type="button"
          class="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-2 py-2 text-[13px] text-ink-soft hover:bg-canvas"
          @click="showAllChats = !showAllChats"
        >
          <i class="fa-solid fa-ellipsis w-4 text-center" aria-hidden="true" />
          {{ showAllChats ? 'Ver menos' : `Ver todas (${filteredChats.length})` }}
        </button>

        <h2 class="section-title px-2 pb-1 pt-6">Reportes guardados</h2>
        <ul class="m-0 list-none p-0">
          <li v-for="r in visibleReports" :key="r.id" class="group relative">
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 px-2 py-2 text-left text-[13.5px]"
              :class="r.id === activeReportId ? 'bg-[#e6f4fb] text-brandblue font-medium' : 'bg-transparent hover:bg-canvas'"
              :title="r.title"
              @click="$emit('open-report', r)"
            >
              <i class="fa-solid w-4 text-center text-[15px]" :class="KIND[r.kind]?.icon ?? 'fa-file'" :style="{ color: KIND[r.kind]?.color }" aria-hidden="true" />
              <span class="flex-1 truncate">{{ r.title }}</span>
            </button>
            <div class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center rounded-md bg-white/95 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
              <button type="button" class="icon-btn h-7 w-7" title="Eliminar reporte" @click="removeReport(r)">
                <i class="fa-solid fa-trash text-[12px]" aria-hidden="true" />
              </button>
            </div>
          </li>
          <li v-if="!visibleReports.length" class="px-2 py-2 text-[13px] muted">Sin coincidencias.</li>
        </ul>
        <button
          v-if="filteredReports.length > LIMIT && !search"
          type="button"
          class="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-2 py-2 text-[13px] text-ink-soft hover:bg-canvas"
          @click="showAllReports = !showAllReports"
        >
          <i class="fa-solid fa-ellipsis w-4 text-center" aria-hidden="true" />
          {{ showAllReports ? 'Ver menos' : 'Ver todos' }}
        </button>
      </nav>
    </template>

    <ChatDetailsDialog
      :visible="editing !== null"
      title="Editar chat"
      :chat-title="editing?.title ?? ''"
      :tags="editing?.tags ?? []"
      :all-tags="chats.allTags"
      @confirm="confirmEdit"
      @cancel="editing = null"
    />
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { DxTextBox } from 'devextreme-vue/text-box';
import { confirm } from 'devextreme/ui/dialog';
import { useChatsStore } from '@/stores/chats';
import { useReportsStore } from '@/stores/reports';
import { usePrefsStore } from '@/stores/prefs';
import { useSessionStore } from '@/stores/session';
import { tagKey } from '@/shared/tags';
import ChatDetailsDialog from './ChatDetailsDialog.vue';

const props = defineProps({
  // Dentro del cajón móvil: siempre expandido y con botón de cerrar.
  drawer: Boolean,
});
defineEmits(['open-chat', 'new-chat', 'open-report', 'close']);

const LIMIT = 7;
const KIND = {
  pdf: { icon: 'fa-file-pdf', color: '#d93838' },
  analisis: { icon: 'fa-file-lines', color: '#7a5af5' },
  pipeline: { icon: 'fa-file-invoice', color: '#1f8f4e' },
  ejecutivo: { icon: 'fa-file-contract', color: '#2a6fd6' },
};

const chats = useChatsStore();
const reports = useReportsStore();
const prefs = usePrefsStore();
const session = useSessionStore();

const search = ref('');
const activeTag = ref(null);
const showAllChats = ref(false);
const showAllReports = ref(false);
const editing = ref(null);

const collapsed = computed(() => !props.drawer && prefs.sidebarCollapsed);
const activeChatId = computed(() => session.savedId);
const activeReportId = computed(() => session.reportOverride?.id ?? null);

// Si se borra la última conversación con la etiqueta activa, se quita el filtro.
watch(() => chats.allTags, (tags) => { if (activeTag.value && !tags.includes(activeTag.value)) activeTag.value = null; });

const norm = (s) => tagKey(String(s));
const matchesText = (...texts) => !search.value || texts.some((t) => norm(t).includes(norm(search.value)));

const filteredChats = computed(() => chats.sorted.filter((c) =>
  (!activeTag.value || (c.tags ?? []).some((t) => tagKey(t) === tagKey(activeTag.value)))
  && matchesText(c.title, ...(c.tags ?? []))));
const visibleChats = computed(() =>
  showAllChats.value || search.value || activeTag.value ? filteredChats.value : filteredChats.value.slice(0, LIMIT));
const filteredReports = computed(() => reports.sorted.filter((r) => matchesText(r.title)));
const visibleReports = computed(() =>
  showAllReports.value || search.value ? filteredReports.value : filteredReports.value.slice(0, LIMIT));

function confirmEdit({ title, tags }) {
  session.updateChat(editing.value.id, { title, tags });
  editing.value = null;
}
async function removeChat(c) {
  if (!(await confirm(`¿Eliminar el chat «${c.title}»? Esta acción no se puede deshacer.`, 'Eliminar chat'))) return;
  chats.remove(c.id);
  if (session.savedId === c.id) session.newChat();
}
async function removeReport(r) {
  if (!(await confirm(`¿Eliminar el reporte «${r.title}»?`, 'Eliminar reporte'))) return;
  reports.remove(r.id);
  if (session.reportOverride?.id === r.id) session.reportOverride = null;
}
</script>
