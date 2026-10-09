<template>
  <section class="card no-print flex h-full min-w-0 flex-col overflow-hidden" aria-label="Chat">
    <header class="flex items-start gap-1 border-b border-line px-4 py-3">
      <div class="min-w-0 flex-1">
        <h1 class="m-0 truncate text-[18px] font-semibold text-ink" :title="title">
          {{ title }}
          <button
            v-if="session.dirty"
            type="button"
            class="ml-1 cursor-pointer border-0 bg-transparent p-0 align-middle text-[11.5px] font-normal text-brandlight underline-offset-2 hover:underline"
            title="Guardar chat"
            @click="$emit('save')"
          >
            · sin guardar · Guardar
          </button>
        </h1>
        <div v-if="session.chat.tags?.length" class="mt-1 flex flex-wrap gap-1" aria-label="Etiquetas">
          <span v-for="t in session.chat.tags" :key="t" class="tag-chip tag-chip-sm">{{ t }}</span>
        </div>
      </div>
      <KebabMenu label="Acciones del chat" :items="menu" @select="onAction" />
      <button
        v-if="!compact"
        type="button"
        class="icon-btn"
        :title="prefs.chatExpanded ? 'Reducir chat' : 'Ampliar chat'"
        :aria-pressed="prefs.chatExpanded"
        @click="prefs.chatExpanded = !prefs.chatExpanded"
      >
        <i class="fa-solid" :class="prefs.chatExpanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'" aria-hidden="true" />
      </button>
    </header>

    <div ref="scroller" class="scroll-thin flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
      <div v-if="!session.chat.turns.length" class="flex flex-col gap-4 pt-6">
        <div class="text-center">
          <span class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#e6f4fb] text-brandlight">
            <i class="fa-solid fa-database text-[20px]" aria-hidden="true" />
          </span>
          <p class="m-0 text-[15px] font-semibold text-ink">Pregunta lo que quieras sobre los datos del CEM</p>
          <p class="m-0 mt-1 text-[13px] muted">Consultas de solo lectura en lenguaje natural.</p>
        </div>
        <SuggestionList :items="EMPTY_STATE_SUGGESTIONS" :disabled="session.running" @pick="send" />
      </div>

      <div v-else class="flex flex-col gap-5">
        <template v-for="t in session.chat.turns" :key="t.id">
          <div class="flex gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5a9fd4] text-[13px] font-semibold text-white" aria-hidden="true">{{ CURRENT_USER.initials }}</span>
            <div class="flex-1 rounded-xl bg-[#eaf3fa] px-4 py-3">
              <p class="m-0 text-[14px] leading-relaxed text-ink">{{ t.question }}</p>
              <p class="m-0 mt-1 text-right text-[11.5px] muted">{{ time(t.askedAt) }}</p>
            </div>
          </div>
          <AssistantMessage
            :turn="t"
            :selected="session.turnsWithData.length > 1 && session.selectedTurn?.id === t.id && !session.reportOverride"
            :selectable="compact || session.turnsWithData.length > 1"
            :compact="compact"
            @select="selectTurn(t)"
            @action="(mode) => $emit('report-action', mode, turnContext(t))"
          />
        </template>

        <div v-if="!session.running && session.turnsWithData.length" class="pt-1">
          <h2 class="section-title mb-3 flex items-center gap-2">
            <i class="fa-solid fa-lightbulb text-brandlight" aria-hidden="true" /> Sugerencias
          </h2>
          <SuggestionList :items="SUGGESTIONS" @pick="send" />
        </div>
      </div>
    </div>

    <div class="border-t border-line p-3">
      <Composer :running="session.running" @send="send" @stop="session.stop()" />
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useSessionStore } from '@/stores/session';
import { usePrefsStore } from '@/stores/prefs';
import { DEFAULT_REPORT_TITLE, EMPTY_STATE_SUGGESTIONS, SUGGESTIONS } from '@/mocks/salesByBranch';
import { CURRENT_USER } from '@/mocks/seeds';
import AssistantMessage from './AssistantMessage.vue';
import Composer from './Composer.vue';
import SuggestionList from './SuggestionList.vue';
import KebabMenu from './KebabMenu.vue';
import { useChatsStore } from '@/stores/chats';
import { confirm } from 'devextreme/ui/dialog';

defineProps({ compact: Boolean });
const emit = defineEmits(['new-chat', 'save', 'edit', 'show-results', 'report-action']);

const session = useSessionStore();
const prefs = usePrefsStore();
const chats = useChatsStore();
const scroller = ref(null);

// Mismo menú «⋯» que el de cada conversación del panel lateral.
const pinned = computed(() => Boolean(session.savedId && chats.byId(session.savedId)?.pinned));
const menu = computed(() => [
  { id: 'save', text: 'Guardar chat', icon: 'fa-solid fa-floppy-disk', visible: !session.isSaved && session.chat.turns.length > 0 },
  { id: 'pin', text: pinned.value ? 'Desfijar' : 'Fijar arriba', icon: 'fa-solid fa-thumbtack', visible: session.isSaved },
  { id: 'edit', text: 'Editar título y etiquetas', icon: 'fa-solid fa-pen', visible: session.isSaved },
  { id: 'new', text: 'Nuevo chat', icon: 'fa-solid fa-plus' },
  { id: 'delete', text: 'Eliminar', icon: 'fa-solid fa-trash', danger: true, visible: session.isSaved },
]);

async function onAction(action) {
  if (action === 'save') emit('save');
  else if (action === 'pin') chats.togglePin(session.savedId);
  else if (action === 'edit') emit('edit');
  else if (action === 'new') emit('new-chat');
  else if (action === 'delete') {
    if (!(await confirm(`¿Eliminar el chat «${session.chat.title}»? Esta acción no se puede deshacer.`, 'Eliminar chat'))) return;
    chats.remove(session.savedId);
    session.newChat();
  }
}

const title = computed(() => session.chat.title || 'Chat');
const time = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '');

function send(q) {
  session.ask(q);
}
/** Contexto de los diálogos de acción a partir de una respuesta del chat. */
function turnContext(t) {
  return {
    title: session.reportTitle ?? DEFAULT_REPORT_TITLE, months: prefs.months,
    branches: t.view?.branches ?? null, columns: t.columns, rows: t.rows, reportId: t.reportId ?? null, chatId: session.savedId,
  };
}
function selectTurn(t) {
  session.selectedTurnId = t.id;
  session.reportOverride = null;
  emit('show-results');
}

// Mantener visible lo último: al llegar turnos o fases nuevas.
watch(
  () => [session.chat.id, session.chat.turns.length, session.chat.turns.at(-1)?.phases.length, session.chat.turns.at(-1)?.status],
  () => nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight; }),
);
</script>
