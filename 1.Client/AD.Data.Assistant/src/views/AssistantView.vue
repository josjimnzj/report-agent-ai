<template>
  <!-- Escritorio (≥ 1200 px): menú, chat y resultados lado a lado. -->
  <main v-if="!compact" class="flex h-full gap-4 p-4">
    <ChatSidebar @new-chat="newChat" @open-chat="openChat" @open-report="openReport" @edit-report="editReport" @report-action="openAction" @history="history = true" />
    <div class="shrink-0 transition-[width] duration-200" :class="prefs.chatExpanded ? 'w-[min(720px,50vw)]' : 'w-[360px]'">
      <ChatPanel @new-chat="newChat" @save="saving = true" @edit="editing = true" @report-action="openAction" />
    </div>
    <div class="min-w-0 flex-1">
      <ReportPanel @report-action="openAction" @edit-report="editReport" />
    </div>
  </main>

  <!-- Móvil y tableta: una vista a la vez (Chat o Resultados) y el menú como cajón. -->
  <main v-else class="flex h-full flex-col gap-2 p-2">
    <nav class="no-print flex items-center gap-2" aria-label="Vistas">
      <button type="button" class="icon-btn h-10 w-10 border border-line bg-white" title="Conversaciones y reportes" :aria-expanded="drawerOpen" @click="drawerOpen = true">
        <i class="fa-solid fa-bars" aria-hidden="true" /><span class="sr-only">Conversaciones y reportes</span>
      </button>
      <div class="flex flex-1 rounded-xl border border-line bg-white p-1" role="tablist" aria-label="Vista">
        <button
          v-for="v in VIEWS"
          :key="v.id"
          type="button"
          role="tab"
          :aria-selected="view === v.id"
          class="relative flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-0 py-2 text-[14px]"
          :class="view === v.id ? 'bg-brandblue font-semibold text-white' : 'bg-transparent text-ink-soft'"
          @click="setView(v.id)"
        >
          <i class="fa-solid" :class="v.icon" aria-hidden="true" /> {{ v.label }}
          <span v-if="v.id === 'results' && unseenResult" class="absolute right-3 top-2 h-2 w-2 rounded-full bg-brandlight" aria-label="Resultado nuevo" />
        </button>
      </div>
    </nav>

    <div class="min-h-0 flex-1">
      <ChatPanel v-show="view === 'chat'" compact @new-chat="newChat" @save="saving = true" @edit="editing = true" @show-results="setView('results')" @report-action="openAction" />
      <ReportPanel v-if="view === 'results'" @report-action="openAction" @edit-report="editReport" />
    </div>

    <Transition name="fade">
      <div v-if="drawerOpen" class="fixed inset-0 z-[1400] bg-[#0f2a3d]/40" aria-hidden="true" @click="drawerOpen = false" />
    </Transition>
    <Transition name="slide">
      <div v-if="drawerOpen" class="fixed inset-y-0 left-0 z-[1401] w-[min(320px,88vw)] p-2" role="dialog" aria-modal="true" aria-label="Conversaciones y reportes" @keydown.esc="drawerOpen = false">
        <ChatSidebar drawer @close="drawerOpen = false" @new-chat="newChat" @open-chat="openChat" @open-report="openReport" @edit-report="editReport" @report-action="openAction" @history="drawerOpen = false; history = true" />
      </div>
    </Transition>
  </main>

  <ReportActionDialog />
  <HistoryDialog v-if="IS_API" :visible="history" @close="history = false" />
  <ChatDetailsDialog
    :visible="saving"
    title="Guardar chat"
    :chat-title="defaultTitle"
    :tags="session.chat.tags ?? []"
    :all-tags="chats.allTags"
    hint="El chat se guarda en este navegador y se actualiza solo con cada respuesta nueva."
    @confirm="saveChat"
    @cancel="saving = false"
  />
  <ChatDetailsDialog
    :visible="editing"
    title="Editar chat"
    :chat-title="session.chat.title"
    :tags="session.chat.tags ?? []"
    :all-tags="chats.allTags"
    @confirm="editChat"
    @cancel="editing = false"
  />
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { confirm } from 'devextreme/ui/dialog';
import { useSessionStore } from '@/stores/session';
import { useChatsStore } from '@/stores/chats';
import { usePrefsStore } from '@/stores/prefs';
import { $notify } from '@/shared/notify';
import ChatSidebar from '@/components/ChatSidebar.vue';
import ChatPanel from '@/components/ChatPanel.vue';
import ReportPanel from '@/components/ReportPanel.vue';
import ChatDetailsDialog from '@/components/ChatDetailsDialog.vue';
import ReportActionDialog from '@/components/ReportActionDialog.vue';
import HistoryDialog from '@/components/HistoryDialog.vue';
import { useActionsStore } from '@/stores/actions';
import { useReportsStore } from '@/stores/reports';
import { IS_API } from '@/services/mode';

const VIEWS = [
  { id: 'chat', label: 'Chat', icon: 'fa-comments' },
  { id: 'results', label: 'Resultados', icon: 'fa-chart-column' },
];

const session = useSessionStore();
const chats = useChatsStore();
const prefs = usePrefsStore();
const actions = useActionsStore();
const reports = useReportsStore();
const saving = ref(false);
const editing = ref(false);
const history = ref(false);

// Por debajo de 1200 px no caben menú + chat + resultados: se pasa a una vista a la vez.
const media = window.matchMedia('(max-width: 1199px)');
const compact = ref(media.matches);
const onMedia = (e) => { compact.value = e.matches; };
media.addEventListener('change', onMedia);
onBeforeUnmount(() => media.removeEventListener('change', onMedia));

const view = ref('chat');
const drawerOpen = ref(false);
const unseenResult = ref(false);

function setView(v) {
  view.value = v;
  if (v === 'results') unseenResult.value = false;
}
// Una respuesta nueva mientras se ve el chat deja un aviso en «Resultados».
watch(() => session.result?.id, (id, old) => {
  if (compact.value && id && id !== old && view.value === 'chat') unseenResult.value = true;
});

// «Muéstramelo en el reporte»: el agente lo marca y se abre Resultados (en escritorio se pliega el chat ampliado).
watch(() => session.revealTick, () => {
  if (compact.value) setView('results');
  else prefs.chatExpanded = false;
});

const defaultTitle = computed(() => session.chat.title || session.chat.turns[0]?.question.slice(0, 60) || '');

/** Pide confirmación antes de abandonar un chat con cambios sin guardar. */
async function guard(action) {
  if (session.running) {
    $notify.warning('Espera a que termine la consulta o detenla.');
    return false;
  }
  if (session.dirty && !(await confirm('El chat actual tiene cambios sin guardar. ¿Descartarlos?', 'Cambios sin guardar'))) return false;
  action();
  return true;
}

async function newChat() {
  if (await guard(() => session.newChat())) {
    drawerOpen.value = false;
    setView('chat');
  }
}
async function openChat(id) {
  if (id !== session.savedId && !(await guard(() => session.openChat(id)))) return;
  drawerOpen.value = false;
  setView('chat');
}
function openReport(report) {
  if (!session.openReport(report)) return;
  prefs.months = report.months ?? prefs.months;
  drawerOpen.value = false;
  setView('results');
}
/** Campaña, segmento o publicación a partir de un reporte (del chat, de Resultados o guardado). */
function openAction(mode, context) {
  drawerOpen.value = false;
  actions.open(mode, context);
}
/** Lleva un reporte guardado a una conversación nueva para seguir editándolo. */
async function editReport(report) {
  if (!report) return;
  const ok = await guard(() => {
    if (session.openReportInNewChat(report)) prefs.months = report.months ?? prefs.months;
  });
  if (ok) {
    drawerOpen.value = false;
    setView('chat');
  }
}
function saveChat({ title, tags }) {
  session.saveChat(title, tags);
  saving.value = false;
  $notify.success('Chat guardado.');
}
function editChat({ title, tags }) {
  session.updateChat(session.savedId, { title, tags });
  editing.value = false;
}

onMounted(async () => {
  if (IS_API) {
    // Chats, reportes y preferencias viven en Neon: se cargan al entrar.
    try {
      await Promise.all([chats.load(), reports.load(), prefs.load()]);
    } catch (err) {
      $notify.error(`No se pudieron cargar tus chats y reportes: ${err.message}`);
    }
  }
  // Se abre el chat guardado más reciente con resultados.
  const first = chats.sorted.find((c) => c.turns.length);
  if (first) session.openChat(first.id);
});
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: transform .2s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(-100%); }
</style>
