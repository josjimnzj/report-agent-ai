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
      @input="autosize"
    />
    <div class="flex items-center justify-between gap-2">
      <ModelPicker class="min-w-0" :disabled="running" />
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
        :disabled="!text.trim()"
        title="Enviar (Enter)"
      >
        <i class="fa-solid fa-paper-plane" aria-hidden="true" /><span class="sr-only">Enviar</span>
      </button>
    </div>
  </form>
</template>

<script setup>
import { nextTick, ref } from 'vue';
import ModelPicker from './ModelPicker.vue';

defineProps({ running: Boolean });
const emit = defineEmits(['send', 'stop']);

const text = ref('');
const area = ref(null);

function autosize() {
  const el = area.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
function submit() {
  const q = text.value.trim();
  if (!q) return;
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
