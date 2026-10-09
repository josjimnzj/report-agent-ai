<template>
  <ol class="m-0 grid list-none gap-4 p-0" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
    <li v-for="(i, n) in insights" :key="`${n}-${i.title}`" class="flex gap-3" :class="cards ? 'card p-4' : ''">
      <span
        v-if="KINDS[i.kind]"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas text-[13px]"
        :class="KINDS[i.kind].tone"
        :title="KINDS[i.kind].label"
        aria-hidden="true"
      >
        <i class="fa-solid" :class="KINDS[i.kind].icon" />
      </span>
      <span v-else class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brandlight text-[13px] font-semibold text-white" aria-hidden="true">{{ n + 1 }}</span>
      <div>
        <p v-if="KINDS[i.kind]" class="m-0 text-[11px] font-semibold uppercase tracking-wide" :class="KINDS[i.kind].tone">{{ KINDS[i.kind].label }}</p>
        <h3 class="m-0 text-[13.5px] font-semibold text-brandblue">{{ i.title }}</h3>
        <p class="m-0 mt-1 text-[12.5px] leading-relaxed text-ink-soft">{{ i.text }}</p>
      </div>
    </li>
  </ol>
</template>

<script setup>
import { INSIGHT_KINDS as KINDS } from '@/shared/resultView';

defineProps({
  /** { title, text } del tablero de ventas o { kind: finding|alert|recommendation, title, text } del agente. */
  insights: { type: Array, required: true },
  columns: { type: Number, default: 2 },
  cards: Boolean,
});
</script>
