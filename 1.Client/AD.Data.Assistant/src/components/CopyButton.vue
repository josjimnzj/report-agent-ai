<template>
  <button type="button" class="btn py-1 text-[12.5px]" :title="title" @click="copy">
    <i class="fa-solid" :class="state === 'ok' ? 'fa-check text-good' : state === 'err' ? 'fa-xmark text-bad' : 'fa-copy'" aria-hidden="true" />
    {{ state === 'ok' ? 'Copiado' : state === 'err' ? 'Error' : label }}
  </button>
</template>

<script setup>
import { ref } from 'vue';
import { copyText } from '@/shared/clipboard';

const props = defineProps({
  label: { type: String, default: 'Copiar' },
  title: { type: String, default: '' },
  /** Función que devuelve el texto (se evalúa al pulsar). */
  text: { type: Function, required: true },
});

const state = ref(null);
let timer = null;
async function copy() {
  state.value = (await copyText(await props.text())) ? 'ok' : 'err';
  clearTimeout(timer);
  timer = setTimeout(() => { state.value = null; }, 1300);
}
</script>
