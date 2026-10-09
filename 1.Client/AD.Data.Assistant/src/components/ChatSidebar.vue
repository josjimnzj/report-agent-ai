<template>
  <aside
    class="card no-print flex h-full flex-col overflow-hidden transition-[width] duration-200"
    :class="prefs.sidebarCollapsed ? 'w-[60px]' : 'w-[260px]'"
    aria-label="Conversaciones y reportes"
  >
    <div class="flex items-center gap-1 px-3 pt-3" :class="prefs.sidebarCollapsed ? 'flex-col' : 'justify-between'">
      <button
        type="button"
        class="btn btn-primary"
        :class="prefs.sidebarCollapsed ? 'h-9 w-9 justify-center p-0' : ''"
        title="Nuevo chat"
        @click="$emit('new-chat')"
      >
        <i class="fa-solid fa-plus" aria-hidden="true" />
        <span v-if="!prefs.sidebarCollapsed">Nuevo chat</span>
      </button>
      <button
        type="button"
        class="icon-btn border border-line"
        :title="prefs.sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'"
        :aria-expanded="!prefs.sidebarCollapsed"
        @click="prefs.sidebarCollapsed = !prefs.sidebarCollapsed"
      >
        <i class="fa-solid" :class="prefs.sidebarCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'" aria-hidden="true" />
      </button>
    </div>

    <div v-if="!prefs.sidebarCollapsed" class="px-3 pt-3">
      <DxTextBox
        v-model:value="search"
        mode="search"
        placeholder="Buscar conversaciones y reportes…"
        value-change-event="input"
        :input-attr="{ 'aria-label': 'Buscar conversaciones y reportes' }"
      />
    </div>

    <nav class="scroll-thin flex-1 overflow-y-auto px-2 pb-3">
      <h2 v-if="!prefs.sidebarCollapsed" class="section-title px-2 pb-1 pt-4">Conversaciones</h2>
      <div v-else class="mx-2 my-3 border-t border-line" />
      <ul class="m-0 list-none p-0">
        <li v-for="c in visibleChats" :key="c.id" class="group relative">
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 px-2 py-2 text-left text-[13.5px]"
            :class="c.id === activeChatId ? 'bg-[#e6f4fb] text-brandblue font-medium' : 'bg-transparent hover:bg-canvas'"
            :title="c.title"
            :aria-current="c.id === activeChatId ? 'page' : undefined"
            @click="$emit('open-chat', c.id)"
          >
            <i class="fa-solid w-4 text-center" :class="[c.icon, c.id === activeChatId ? 'text-brandlight' : 'text-ink-soft']" aria-hidden="true" />
            <span v-if="!prefs.sidebarCollapsed" class="flex-1 truncate">{{ c.title }}</span>
            <i v-if="c.pinned && !prefs.sidebarCollapsed" class="fa-solid fa-thumbtack text-[11px] text-ink-muted group-hover:hidden" aria-label="Fijado" />
          </button>
          <div
            v-if="!prefs.sidebarCollapsed"
            class="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center rounded-md bg-white/95 group-focus-within:flex group-hover:flex"
          >
            <button type="button" class="icon-btn h-7 w-7" :title="c.pinned ? 'Desfijar' : 'Fijar'" @click="chats.togglePin(c.id)">
              <i class="fa-solid fa-thumbtack text-[12px]" :class="c.pinned ? 'text-brandlight' : ''" aria-hidden="true" />
            </button>
            <button type="button" class="icon-btn h-7 w-7" title="Renombrar" @click="startRename(c)">
              <i class="fa-solid fa-pen text-[12px]" aria-hidden="true" />
            </button>
            <button type="button" class="icon-btn h-7 w-7" title="Eliminar" @click="removeChat(c)">
              <i class="fa-solid fa-trash text-[12px]" aria-hidden="true" />
            </button>
          </div>
        </li>
        <li v-if="!prefs.sidebarCollapsed && !visibleChats.length" class="px-2 py-2 text-[13px] muted">Sin coincidencias.</li>
      </ul>
      <button
        v-if="!prefs.sidebarCollapsed && filteredChats.length > LIMIT"
        type="button"
        class="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-2 py-2 text-[13px] text-ink-soft hover:bg-canvas"
        @click="showAllChats = !showAllChats"
      >
        <i class="fa-solid fa-ellipsis w-4 text-center" aria-hidden="true" />
        {{ showAllChats ? 'Ver menos' : 'Ver todas' }}
      </button>

      <template v-if="!prefs.sidebarCollapsed">
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
            <div class="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center rounded-md bg-white/95 group-focus-within:flex group-hover:flex">
              <button type="button" class="icon-btn h-7 w-7" title="Eliminar reporte" @click="removeReport(r)">
                <i class="fa-solid fa-trash text-[12px]" aria-hidden="true" />
              </button>
            </div>
          </li>
          <li v-if="!visibleReports.length" class="px-2 py-2 text-[13px] muted">Sin coincidencias.</li>
        </ul>
        <button
          v-if="filteredReports.length > LIMIT"
          type="button"
          class="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-2 py-2 text-[13px] text-ink-soft hover:bg-canvas"
          @click="showAllReports = !showAllReports"
        >
          <i class="fa-solid fa-ellipsis w-4 text-center" aria-hidden="true" />
          {{ showAllReports ? 'Ver menos' : 'Ver todos' }}
        </button>
      </template>
    </nav>

    <PromptDialog
      :visible="renaming !== null"
      title="Renombrar chat"
      :value="renaming?.title ?? ''"
      @confirm="confirmRename"
      @cancel="renaming = null"
    />
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue';
import { DxTextBox } from 'devextreme-vue/text-box';
import { confirm } from 'devextreme/ui/dialog';
import { useChatsStore } from '@/stores/chats';
import { useReportsStore } from '@/stores/reports';
import { usePrefsStore } from '@/stores/prefs';
import { useSessionStore } from '@/stores/session';
import PromptDialog from './PromptDialog.vue';

defineEmits(['open-chat', 'new-chat', 'open-report']);

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
const showAllChats = ref(false);
const showAllReports = ref(false);
const renaming = ref(null);

const activeChatId = computed(() => session.savedId);
const activeReportId = computed(() => session.reportOverride?.id ?? null);

const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const matches = (title) => !search.value || norm(title).includes(norm(search.value));

const filteredChats = computed(() => chats.sorted.filter((c) => matches(c.title)));
const visibleChats = computed(() =>
  prefs.sidebarCollapsed || showAllChats.value || search.value ? filteredChats.value : filteredChats.value.slice(0, LIMIT));
const filteredReports = computed(() => reports.sorted.filter((r) => matches(r.title)));
const visibleReports = computed(() =>
  showAllReports.value || search.value ? filteredReports.value : filteredReports.value.slice(0, LIMIT));

function startRename(c) {
  renaming.value = c;
}
function confirmRename(title) {
  chats.rename(renaming.value.id, title);
  if (session.savedId === renaming.value.id) session.chat.title = title;
  renaming.value = null;
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
