<template>
  <ul class="m-0 flex list-none flex-col gap-2 p-0">
    <li v-for="s in items" :key="s">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-left text-[13.5px] text-ink hover:border-brandlight hover:text-brandblue disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="disabled"
        @click="$emit('pick', s)"
      >
        <span class="flex-1">{{ s }}</span>
        <i class="fa-solid fa-chevron-right text-[12px] text-ink-soft" aria-hidden="true" />
      </button>
    </li>
  </ul>
</template>

<script setup>
defineProps({ items: { type: Array, required: true }, disabled: Boolean });
defineEmits(['pick']);
</script>
