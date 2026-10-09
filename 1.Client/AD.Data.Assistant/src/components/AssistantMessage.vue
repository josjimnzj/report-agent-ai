<template>
  <div class="flex flex-col gap-3">
    <p v-if="turn.note" class="m-0 flex gap-2 rounded-lg bg-[#fff7e0] px-3 py-2 text-[12.5px] leading-snug text-ink" role="status">
      <i class="fa-solid fa-circle-info mt-0.5 text-[#9a6a00]" aria-hidden="true" />{{ turn.note }}
    </p>
    <div class="flex gap-3">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brandblue text-[13px] font-semibold text-white" aria-hidden="true">AI</span>
      <div class="flex-1 rounded-xl border border-line bg-white px-4 py-3">
        <p class="m-0 mb-3 text-[13.5px] text-ink">{{ turn.status === 'running' ? 'Estoy analizando tu consulta…' : 'Analicé tu consulta:' }}</p>
        <LiveProgress :phases="turn.phases" :running="turn.status === 'running'" />
        <p v-if="turn.modelLabel" class="m-0 mt-3 flex items-center gap-1.5 text-[11.5px] muted">
          <i class="fa-solid fa-microchip" aria-hidden="true" />
          {{ turn.modelLabel }}{{ turn.effort ? ` · esfuerzo ${effortLabel(turn.effort).toLowerCase()}` : '' }}
        </p>
      </div>
    </div>

    <button
      v-if="turn.status === 'ok'"
      type="button"
      class="flex w-full cursor-pointer gap-3 rounded-xl border px-4 py-3 text-left"
      :class="selected ? 'border-brandlight bg-[#e6f4fb]' : 'border-line bg-[#f2f8fc] hover:border-brandlight'"
      :aria-pressed="selected"
      :title="selectable ? 'Ver este resultado' : undefined"
      @click="$emit('select')"
    >
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-good text-white" aria-hidden="true">
        <i class="fa-solid fa-check" />
      </span>
      <span class="flex-1">
        <span class="block text-[14px] font-semibold text-ink">Análisis completado</span>
        <span class="mt-1 block text-[13px] leading-relaxed text-ink-soft">{{ turn.answer }}</span>
        <span class="mt-1 flex items-center justify-between gap-2 text-[11.5px]">
          <span v-if="compact" class="font-semibold text-brandlight">Ver resultados <i class="fa-solid fa-arrow-right" aria-hidden="true" /></span>
          <span class="ml-auto muted">{{ time(turn.answeredAt) }}</span>
        </span>
      </span>
    </button>

    <div v-else-if="turn.status !== 'running'" class="flex gap-3 rounded-xl border border-line bg-white px-4 py-3" role="status">
      <i class="fa-solid mt-0.5" :class="turn.status === 'stopped' ? 'fa-circle-pause text-ink-soft' : 'fa-triangle-exclamation text-bad'" aria-hidden="true" />
      <span class="text-[13px] text-ink-soft">{{ turn.answer }}</span>
    </div>
  </div>
</template>

<script setup>
import { effortLabel } from '@/shared/models';
import LiveProgress from './LiveProgress.vue';

defineProps({
  turn: { type: Object, required: true },
  selected: Boolean,
  selectable: Boolean,
  compact: Boolean,
});
defineEmits(['select']);

const time = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '');
</script>
