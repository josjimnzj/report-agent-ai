<template>
  <main class="flex h-full gap-4 p-4">
    <ChatSidebar @new-chat="guard(() => session.newChat())" @open-chat="openChat" @open-report="openReport" />
    <div
      class="shrink-0 transition-[width] duration-200"
      :class="prefs.chatExpanded ? 'w-[min(720px,50vw)]' : 'w-[360px]'"
    >
      <ChatPanel @new-chat="guard(() => session.newChat())" @save="saving = true" />
    </div>
    <div class="min-w-0 flex-1">
      <ReportPanel />
    </div>

    <PromptDialog
      :visible="saving"
      title="Guardar chat"
      label="Título del chat"
      :value="defaultTitle"
      hint="El chat se guarda en este navegador y se actualiza solo con cada respuesta nueva."
      @confirm="saveChat"
      @cancel="saving = false"
    />
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { confirm } from 'devextreme/ui/dialog';
import { useSessionStore } from '@/stores/session';
import { useChatsStore } from '@/stores/chats';
import { usePrefsStore } from '@/stores/prefs';
import { $notify } from '@/shared/notify';
import ChatSidebar from '@/components/ChatSidebar.vue';
import ChatPanel from '@/components/ChatPanel.vue';
import ReportPanel from '@/components/ReportPanel.vue';
import PromptDialog from '@/components/PromptDialog.vue';

const session = useSessionStore();
const chats = useChatsStore();
const prefs = usePrefsStore();
const saving = ref(false);

const defaultTitle = computed(() => session.chat.title || session.chat.turns[0]?.question.slice(0, 60) || '');

/** Pide confirmación antes de abandonar un chat con cambios sin guardar. */
async function guard(action) {
  if (session.running) {
    $notify.warning('Espera a que termine la consulta o detenla.');
    return;
  }
  if (session.dirty && !(await confirm('El chat actual tiene cambios sin guardar. ¿Descartarlos?', 'Cambios sin guardar'))) return;
  action();
}

function openChat(id) {
  if (id === session.savedId) return;
  guard(() => session.openChat(id));
}
function openReport(report) {
  if (session.openReport(report)) prefs.months = report.months ?? prefs.months;
}
function saveChat(title) {
  session.saveChat(title);
  saving.value = false;
  $notify.success('Chat guardado.');
}

onMounted(() => {
  // Al entrar se abre el chat guardado más reciente con resultados (maqueta: «Análisis de ventas»).
  const first = chats.sorted.find((c) => c.turns.length);
  if (first) session.openChat(first.id);
});
</script>
