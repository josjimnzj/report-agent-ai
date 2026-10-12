<template>
  <form class="flex flex-col gap-1 rounded-xl border border-line bg-white p-2 focus-within:border-brandlight" @submit.prevent="submit">
    <label for="composer" class="sr-only">Pregunta sobre tus datos</label>
    <textarea
      id="composer"
      ref="area"
      v-model="text"
      rows="1"
      class="scroll-thin max-h-32 min-h-[40px] w-full resize-none border-0 bg-transparent px-2 py-2 text-[14px] text-ink outline-none placeholder:text-ink-muted"
      placeholder="Haz una pregunta sobre tus datos…"
      :disabled="running"
      @keydown.enter.exact.prevent="submit"
      @input="onType"
    />
    <p v-if="dictationMessage" class="m-0 px-2 text-[12px]" :class="dict.error.value ? 'text-bad' : 'text-ink-soft'" role="status" aria-live="polite">
      {{ dictationMessage }}
    </p>
    <div class="flex items-center justify-between gap-2">
      <ModelPicker class="min-w-0" :disabled="running" />
      <div class="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          class="mic-btn"
          :class="{ rec: dict.state.value === 'listening' }"
          :disabled="running || !engine"
          :aria-pressed="dict.state.value === 'listening'"
          :title="engine ? (dict.state.value === 'listening' ? 'Detener el dictado' : 'Dictar con el micrófono') : 'Este navegador no admite dictado'"
          @click="dict.toggle"
        >
          <i class="fa-solid" :class="dict.state.value === 'listening' ? 'fa-stop' : 'fa-microphone'" aria-hidden="true" />
          <span>{{ dict.state.value === 'listening' ? 'Detener' : 'Dictar' }}</span>
        </button>
        <button
          v-if="running"
          type="button"
          class="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-bad text-white hover:opacity-90"
          title="Detener"
          @click="$emit('stop')"
        >
          <i class="fa-solid fa-stop" aria-hidden="true" /><span class="sr-only">Detener</span>
        </button>
        <button
          v-else
          type="submit"
          class="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-brandlight text-white hover:bg-[#008ac2] disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!text.trim() || dict.busy.value"
          :title="dict.busy.value ? 'Termina el dictado para enviar' : 'Enviar (Enter)'"
        >
          <i class="fa-solid fa-paper-plane" aria-hidden="true" /><span class="sr-only">Enviar</span>
        </button>
      </div>
    </div>
  </form>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { usePrefsStore } from '@/stores/prefs';
import { TRANSCRIBE_URL, authHeaders } from '@/services/dictationApi';
import { useDictation } from '@/shared/useDictation';
import { effectiveEngine, loadDictationEngines } from '@/shared/dictationEngines';
import ModelPicker from './ModelPicker.vue';

defineProps({ running: Boolean });
const emit = defineEmits(['send', 'stop']);

const prefs = usePrefsStore();
const text = ref('');
const area = ref(null);

onMounted(loadDictationEngines);
const engine = computed(() => effectiveEngine(prefs.dictationEngine));
const dict = useDictation({
  text,
  engine,
  language: computed(() => prefs.dictationLang || 'es'),
  transcribeUrl: TRANSCRIBE_URL,
  getHeaders: authHeaders,
});
const dictationMessage = computed(() => dict.error.value || dict.status.value);
// Cambiar de motor a mitad de un dictado lo detiene (el selector está en el menú de modelo).
watch(engine, () => dict.stop());
// El texto dictado también ajusta la altura del cuadro.
watch(text, () => nextTick(autosize));

function autosize() {
  const el = area.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
/** Escribir a mano corta el dictado del navegador (si no, reescribiría lo tecleado con lo que siga oyendo). */
function onType() {
  if (dict.isBrowser.value && dict.busy.value) dict.stop();
  autosize();
}
function submit() {
  // También con Enter: mientras se dicta o Whisper termina la última frase, no se envía.
  if (dict.busy.value) return;
  const q = text.value.trim();
  if (!q) return;
  dict.stop();
  emit('send', q);
  text.value = '';
  nextTick(autosize);
}
function setText(q) {
  text.value = q;
  nextTick(() => { autosize(); area.value?.focus(); });
}
defineExpose({ setText });
</script>
