<template>
  <div class="flex flex-col gap-3">
    <p v-if="turn.note" class="m-0 flex gap-2 rounded-lg bg-[#fff7e0] px-3 py-2 text-[12.5px] leading-snug text-ink" role="status">
      <i class="fa-solid fa-circle-info mt-0.5 text-[#9a6a00]" aria-hidden="true" />{{ turn.note }}
    </p>
    <div class="flex gap-3">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brandblue text-[13px] font-semibold text-white" aria-hidden="true">AI</span>
      <div class="flex-1 rounded-xl border border-line bg-white px-4 py-3">
        <p v-if="turn.kind === 'report'" class="m-0 text-[13.5px] text-ink">
          <i class="fa-solid fa-folder-open mr-1 text-brandlight" aria-hidden="true" /> Reporte guardado cargado en esta conversación.
        </p>
        <template v-else>
          <p class="m-0 mb-3 text-[13.5px] text-ink">{{ turn.status === 'running' ? 'Estoy analizando tu consulta…' : 'Analicé tu consulta:' }}</p>
          <LiveProgress :phases="turn.phases" :running="turn.status === 'running'" />
        </template>
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
        <span class="block text-[14px] font-semibold text-ink">{{ turn.kind === 'report' ? 'Reporte listo para editar' : 'Análisis completado' }}</span>
        <span class="mt-1 block text-[13px] leading-relaxed text-ink-soft">{{ turn.answer }}</span>
        <span class="mt-1 flex items-center justify-between gap-2 text-[11.5px]">
          <span v-if="compact" class="font-semibold text-brandlight">Ver resultados <i class="fa-solid fa-arrow-right" aria-hidden="true" /></span>
          <span class="ml-auto muted">{{ time(turn.answeredAt) }}</span>
        </span>
      </span>
    </button>

    <div v-if="turn.status === 'ok' && turn.askChart" class="-mt-1 flex flex-wrap items-center gap-1.5 pl-1" role="group" aria-label="Tipo de gráfica">
      <span class="text-[12px] text-ink-soft">¿Cómo quieres la gráfica?</span>
      <button
        v-for="c in CHART_TYPES"
        :key="c.id"
        type="button"
        class="quick-action"
        :class="turn.view?.chartType === c.id ? 'border-brandlight font-semibold text-brandblue' : ''"
        :aria-pressed="turn.view?.chartType === c.id"
        @click="$emit('chart', c.id)"
      >
        <i class="fa-solid" :class="c.icon" aria-hidden="true" /> {{ c.label }}
      </button>
    </div>

    <div v-if="rateable && turn.runId && (turn.status === 'ok' || turn.status === 'max_iterations') && turn.kind !== 'report'" class="-mt-1 flex items-center gap-1 pl-1" role="group" aria-label="Valorar la respuesta">
      <span class="mr-1 text-[12px] muted">{{ turn.rating ? 'Gracias por valorar' : '¿Te sirvió?' }}</span>
      <button
        v-for="r in RATINGS"
        :key="r.value"
        type="button"
        class="icon-btn h-7 w-7"
        :class="turn.rating === r.value ? r.active : 'text-ink-soft'"
        :title="r.label"
        :aria-pressed="turn.rating === r.value"
        @click="$emit('rate', r.value)"
      >
        <i :class="[turn.rating === r.value ? 'fa-solid' : 'fa-regular', r.icon]" aria-hidden="true" /><span class="sr-only">{{ r.label }}</span>
      </button>
    </div>

    <div v-if="turn.status === 'ok' && !IS_API" class="-mt-1 flex flex-wrap gap-1.5 pl-1" role="group" aria-label="Acciones con este resultado">
      <button v-for="a in QUICK_ACTIONS" :key="a.id" type="button" class="quick-action" @click="$emit('action', a.id)">
        <i :class="a.icon" aria-hidden="true" /> {{ a.text }}
      </button>
    </div>

    <div v-if="turn.status !== 'running' && turn.status !== 'ok'" class="flex gap-3 rounded-xl border border-line bg-white px-4 py-3" role="status">
      <i class="fa-solid mt-0.5" :class="turn.status === 'stopped' ? 'fa-circle-pause text-ink-soft' : 'fa-triangle-exclamation text-bad'" aria-hidden="true" />
      <span class="text-[13px] text-ink-soft">{{ turn.answer }}</span>
    </div>
  </div>
</template>

<script setup>
import { effortLabel } from '@/shared/models';
import { IS_API } from '@/services/mode';
import { CHART_TYPES } from '@/shared/resultView';
import LiveProgress from './LiveProgress.vue';

defineProps({
  turn: { type: Object, required: true },
  selected: Boolean,
  selectable: Boolean,
  compact: Boolean,
  rateable: Boolean,
});
defineEmits(['select', 'action', 'chart', 'rate']);

const RATINGS = [
  { value: 1, label: 'Respuesta útil', icon: 'fa-thumbs-up', active: 'text-good' },
  { value: -1, label: 'Respuesta incorrecta o poco útil', icon: 'fa-thumbs-down', active: 'text-bad' },
];

const QUICK_ACTIONS = [
  { id: 'campaign', text: 'Disparar campaña', icon: 'fa-solid fa-bullhorn' },
  { id: 'segment', text: 'Crear segmento', icon: 'fa-solid fa-users' },
  { id: 'publish', text: 'Publicar', icon: 'fa-solid fa-share-from-square' },
];

const time = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '');
</script>
