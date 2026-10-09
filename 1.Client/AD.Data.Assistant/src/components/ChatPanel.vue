<template>
  <section class="card no-print flex h-full min-w-0 flex-col overflow-hidden" aria-label="Chat">
    <header class="flex items-center gap-1 border-b border-line px-4 py-3">
      <h1 class="m-0 flex-1 truncate text-[18px] font-semibold text-ink" :title="title">
        {{ title }}
        <span v-if="session.dirty" class="ml-1 align-middle text-[11px] font-normal text-ink-muted">· sin guardar</span>
      </h1>
      <button type="button" class="icon-btn" title="Nuevo chat" @click="$emit('new-chat')">
        <i class="fa-solid fa-pen-to-square" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="icon-btn"
        :class="session.dirty ? 'text-brandlight' : ''"
        :title="session.isSaved ? 'Chat guardado: se actualiza solo' : 'Guardar chat'"
        :disabled="!session.chat.turns.length || session.isSaved"
        @click="$emit('save')"
      >
        <i class="fa-solid" :class="session.isSaved ? 'fa-circle-check' : 'fa-floppy-disk'" aria-hidden="true" />
      </button>
      <button
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
            :selectable="session.turnsWithData.length > 1"
            @select="selectTurn(t)"
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
import { EMPTY_STATE_SUGGESTIONS, SUGGESTIONS } from '@/mocks/salesByBranch';
import { CURRENT_USER } from '@/mocks/seeds';
import AssistantMessage from './AssistantMessage.vue';
import Composer from './Composer.vue';
import SuggestionList from './SuggestionList.vue';

defineEmits(['new-chat', 'save']);

const session = useSessionStore();
const prefs = usePrefsStore();
const scroller = ref(null);

const title = computed(() => session.chat.title || 'Chat');
const time = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '');

function send(q) {
  session.ask(q);
}
function selectTurn(t) {
  session.selectedTurnId = t.id;
  session.reportOverride = null;
}

// Mantener visible lo último: al llegar turnos o fases nuevas.
watch(
  () => [session.chat.id, session.chat.turns.length, session.chat.turns.at(-1)?.phases.length, session.chat.turns.at(-1)?.status],
  () => nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight; }),
);
</script>
