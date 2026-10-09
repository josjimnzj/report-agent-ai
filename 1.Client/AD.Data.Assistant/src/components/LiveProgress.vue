<template>
  <ol class="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Progreso de la consulta">
    <li v-for="(p, i) in phases" :key="p.id" class="flex items-center gap-3 text-[13px]">
      <span
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        :class="isDone(p, i) ? 'bg-brandlight text-white' : 'border-2 border-brandlight/40 text-brandlight'"
      >
        <i v-if="isDone(p, i)" class="fa-solid fa-check text-[10px]" aria-hidden="true" />
        <i v-else-if="isActive(i)" class="fa-solid fa-circle-notch fa-spin text-[10px]" aria-hidden="true" />
      </span>
      <span class="flex-1" :class="isDone(p, i) ? 'text-ink-soft' : 'text-ink'">{{ p.label }}</span>
      <span class="num text-[12px] muted">{{ p.ms != null ? `${(p.ms / 1000).toFixed(1)} s` : '…' }}</span>
      <span class="sr-only">{{ isDone(p, i) ? 'completado' : isActive(i) ? 'en curso' : '' }}</span>
    </li>
  </ol>
</template>

<script setup>
const props = defineProps({
  phases: { type: Array, required: true },
  running: Boolean,
});
const isActive = (i) => props.running && i === props.phases.length - 1;
const isDone = (p, i) => p.ms != null && !isActive(i);
</script>
