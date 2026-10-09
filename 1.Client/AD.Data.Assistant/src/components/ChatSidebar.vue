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
              class="flex w-full cursor-pointer flex-col items-start gap-1 rounded-lg border-0 py-2 pl-2.5 pr-10 text-left"
              :class="c.id === activeChatId ? 'bg-[#e6f4fb]' : 'bg-transparent hover:bg-canvas'"
              :title="c.title"
              :aria-current="c.id === activeChatId ? 'page' : undefined"
              @click="$emit('open-chat', c.id)"
            >
              <span class="flex w-full items-center gap-2 pr-1">
                <span class="flex-1 truncate text-[13.5px]" :class="c.id === activeChatId ? 'font-semibold text-brandblue' : 'text-ink'">{{ c.title }}</span>
                <i v-if="c.pinned" class="fa-solid fa-thumbtack text-[11px] text-ink-muted" aria-label="Fijado" />
              </span>
              <span v-if="c.tags?.length" class="flex flex-wrap gap-1">
                <span v-for="t in c.tags" :key="t" class="tag-chip tag-chip-sm">{{ t }}</span>
              </span>
            </button>
            <KebabMenu
              class="absolute right-1 top-1"
              :label="`Acciones de «${c.title}»`"
              :items="chatMenu(c)"
              @select="(a) => onChatAction(a, c)"
            />
          </li>
          <li v-if="!visibleChats.length" class="px-2 py-2 text-[13px] muted">{{ search || activeTag ? 'Sin coincidencias.' : 'Aún no hay conversaciones guardadas.' }}</li>
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
              class="flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 py-2 pl-2 pr-10 text-left text-[13.5px]"
              :class="r.id === activeReportId ? 'bg-[#e6f4fb] text-brandblue font-medium' : 'bg-transparent hover:bg-canvas'"
              :title="r.title"
              @click="$emit('open-report', r)"
            >
              <i class="fa-solid w-4 text-center text-[15px]" :class="KIND[r.kind]?.icon ?? 'fa-file'" :style="{ color: KIND[r.kind]?.color }" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span class="block truncate">{{ r.title }}</span>
                <span v-if="r.published" class="mt-0.5 flex items-center gap-1 text-[11px] font-normal text-good">
                  <i class="fa-solid fa-share-from-square" aria-hidden="true" /> Publicado en {{ r.published.section }}
                </span>
              </span>
            </button>
            <KebabMenu
              class="absolute right-1 top-1/2 -translate-y-1/2"
              :label="`Acciones de «${r.title}»`"
              :items="reportMenu(r)"
              @select="(a) => onReportAction(a, r)"
            />
          </li>
          <li v-if="!visibleReports.length" class="px-2 py-2 text-[13px] muted">{{ search ? 'Sin coincidencias.' : 'Aún no hay reportes guardados.' }}</li>
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

        <template v-if="actions.recent.length && !IS_API">
          <h2 class="section-title px-2 pb-1 pt-6">Segmentos y campañas</h2>
          <ul class="m-0 list-none p-0">
            <li v-for="x in actions.recent" :key="x.id" class="relative">
              <div class="flex items-start gap-3 rounded-lg py-2 pl-2 pr-10 text-[13.5px]">
                <i class="fa-solid mt-0.5 w-4 text-center" :class="x.type === 'segment' ? 'fa-users text-brandlight' : 'fa-bullhorn text-[#b45309]'" aria-hidden="true" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-ink" :title="x.name">{{ x.name }}</span>
                  <span class="block text-[11.5px] text-ink-soft">
                    <template v-if="x.type === 'segment'">Segmento · ≈ {{ fmtInt(x.size) }} cuentas</template>
                    <template v-else>{{ x.status }} · {{ channelLabel(x.channel) }} · {{ shortDate(x.startAt) }}</template>
                  </span>
                </span>
              </div>
              <KebabMenu
                class="absolute right-1 top-1.5"
                :label="`Acciones de «${x.name}»`"
                :items="actionItemMenu(x)"
                @select="(a) => onActionItem(a, x)"
              />
            </li>
          </ul>
        </template>
      </nav>
    </template>

    <div v-if="IS_API" class="border-t border-line p-2" :class="collapsed ? 'flex justify-center' : ''">
      <button
        type="button"
        class="flex cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-2 py-2 text-[13.5px] text-ink-soft hover:bg-canvas hover:text-brandblue"
        :class="collapsed ? 'h-9 w-9 justify-center p-0' : 'w-full'"
        title="Historial y métricas"
        @click="$emit('history')"
      >
        <i class="fa-solid fa-chart-simple w-4 text-center" aria-hidden="true" />
        <span :class="collapsed ? 'sr-only' : ''">Historial y métricas</span>
      </button>
    </div>

    <PromptDialog
      :visible="renamingReport !== null"
      title="Renombrar reporte"
      label="Nombre del reporte"
      :value="renamingReport?.title ?? ''"
      @confirm="confirmRenameReport"
      @cancel="renamingReport = null"
    />
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
import { IS_API } from '@/services/mode';
import { useActionsStore } from '@/stores/actions';
import { $notify } from '@/shared/notify';
import { fmtInt } from '@/shared/salesReport';
import { channelLabel } from '@/shared/reportActions';
import { SALES_COLUMNS, SALES_ROWS } from '@/mocks/salesByBranch';
import ChatDetailsDialog from './ChatDetailsDialog.vue';
import KebabMenu from './KebabMenu.vue';
import PromptDialog from './PromptDialog.vue';

const props = defineProps({
  // Dentro del cajón móvil: siempre expandido y con botón de cerrar.
  drawer: Boolean,
});
const emit = defineEmits(['open-chat', 'new-chat', 'open-report', 'close', 'edit-report', 'report-action', 'history']);

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
const actions = useActionsStore();

const search = ref('');
const activeTag = ref(null);
const showAllChats = ref(false);
const showAllReports = ref(false);
const editing = ref(null);
const renamingReport = ref(null);

const chatMenu = (c) => [
  { id: 'pin', text: c.pinned ? 'Desfijar' : 'Fijar arriba', icon: 'fa-solid fa-thumbtack' },
  { id: 'edit', text: 'Editar título y etiquetas', icon: 'fa-solid fa-pen' },
  { id: 'delete', text: 'Eliminar', icon: 'fa-solid fa-trash', danger: true },
];
// Campañas, segmentos y publicación aún no existen en el backend real: se ven como «próximamente».
const soon = (item) => (IS_API ? { ...item, text: `${item.text} (próximamente)`, disabled: true } : item);
const reportMenu = (r) => [
  { id: 'open', text: 'Abrir', icon: 'fa-solid fa-chart-column' },
  { id: 'edit-chat', text: 'Editar en conversación nueva', icon: 'fa-solid fa-comments' },
  soon({ id: 'campaign', text: 'Disparar campaña', icon: 'fa-solid fa-bullhorn', beginGroup: true }),
  soon({ id: 'segment', text: 'Crear segmento', icon: 'fa-solid fa-users' }),
  soon({ id: 'publish', text: r.published ? 'Cambiar publicación' : 'Publicar en el menú', icon: 'fa-solid fa-share-from-square' }),
  { id: 'unpublish', text: 'Quitar del menú', icon: 'fa-solid fa-eye-slash', visible: Boolean(r.published) && !IS_API },
  { id: 'rename', text: 'Renombrar', icon: 'fa-solid fa-pen', beginGroup: true },
  { id: 'delete', text: 'Eliminar', icon: 'fa-solid fa-trash', danger: true },
];
const actionItemMenu = (x) => [
  { id: 'campaign', text: 'Disparar campaña con este segmento', icon: 'fa-solid fa-bullhorn', visible: x.type === 'segment' },
  { id: 'delete', text: x.type === 'segment' ? 'Eliminar segmento' : 'Cancelar campaña', icon: 'fa-solid fa-trash', danger: true },
];

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

function onChatAction(action, c) {
  if (action === 'pin') chats.togglePin(c.id);
  else if (action === 'edit') editing.value = c;
  else if (action === 'delete') removeChat(c);
}
function onReportAction(action, r) {
  if (action === 'open') emit('open-report', r);
  else if (action === 'edit-chat') emit('edit-report', r);
  else if (['campaign', 'segment', 'publish'].includes(action)) {
    const data = session.savedReportData(r);
    if (data) emit('report-action', action, { ...data, title: r.title });
  } else if (action === 'unpublish') {
    reports.unpublish(r.id);
    $notify.info(`«${r.title}» ya no aparece en el menú (simulado).`);
  }
  else if (action === 'rename') renamingReport.value = r;
  else if (action === 'delete') removeReport(r);
}
async function onActionItem(action, x) {
  if (action === 'campaign') {
    emit('report-action', 'campaign', {
      title: x.sourceTitle ?? x.name, months: x.months, branches: x.branches,
      columns: SALES_COLUMNS, rows: SALES_ROWS, reportId: null, segmentId: x.id,
    });
  } else if (action === 'delete') {
    const what = x.type === 'segment' ? `el segmento «${x.name}»` : `la campaña «${x.name}»`;
    if (await confirm(`¿${x.type === 'segment' ? 'Eliminar' : 'Cancelar'} ${what}?`, x.type === 'segment' ? 'Eliminar segmento' : 'Cancelar campaña')) actions.remove(x.type, x.id);
  }
}
const shortDate = (ts) => new Date(ts).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function confirmRenameReport(title) {
  reports.rename(renamingReport.value.id, title);
  if (session.reportOverride?.id === renamingReport.value.id) session.reportOverride.title = title;
  renamingReport.value = null;
}
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
