<template>
  <ol class="m-0 grid list-none gap-4 p-0" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
    <li v-for="(i, n) in insights" :key="i.title" class="flex gap-3" :class="cards ? 'card p-4' : ''">
      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brandlight text-[13px] font-semibold text-white" aria-hidden="true">{{ n + 1 }}</span>
      <div>
        <h3 class="m-0 text-[13.5px] font-semibold text-brandblue">{{ i.title }}</h3>
        <p class="m-0 mt-1 text-[12.5px] leading-relaxed text-ink-soft">{{ i.text }}</p>
      </div>
    </li>
  </ol>
</template>

<script setup>
defineProps({
  insights: { type: Array, required: true },
  columns: { type: Number, default: 2 },
  cards: Boolean,
});
</script>
