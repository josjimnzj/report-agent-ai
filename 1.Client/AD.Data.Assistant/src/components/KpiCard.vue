<template>
  <article class="card flex min-w-0 flex-col gap-1" :class="compact ? 'px-3 py-3' : 'px-5 py-4'">
    <div class="flex items-start justify-between gap-3">
      <h3 class="m-0 font-normal text-ink-soft" :class="compact ? 'text-[12px]' : 'text-[13.5px]'">{{ kpi.label }}</h3>
      <span v-if="!compact" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e6f4fb] text-brandlight" aria-hidden="true">
        <i class="fa-solid text-[17px]" :class="kpi.icon" />
      </span>
    </div>
    <p class="num m-0 truncate font-semibold leading-tight text-ink" :class="compact ? 'text-[20px]' : '-mt-2 text-[26px]'">{{ kpi.display }}</p>
    <p v-if="kpi.delta != null" class="num m-0 flex items-center gap-1.5 text-[15px] font-semibold" :class="up ? 'text-good' : 'text-bad'">
      <i class="fa-solid" :class="up ? 'fa-arrow-up' : 'fa-arrow-down'" aria-hidden="true" />
      <span class="sr-only">{{ up ? 'Sube' : 'Baja' }}</span>
      {{ deltaText }}
    </p>
    <p class="m-0 text-[12px] muted">{{ kpi.delta != null ? 'vs. periodo anterior' : 'Sin periodo anterior para comparar' }}</p>
  </article>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({ kpi: { type: Object, required: true }, compact: Boolean });
const up = computed(() => props.kpi.delta >= 0);
const deltaText = computed(() => {
  const v = Math.abs(props.kpi.delta * 100);
  return props.kpi.unit === 'pp' ? `${v.toFixed(1)} pp` : `${v.toFixed(1)}%`;
});
</script>
