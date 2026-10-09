<template>
  <span class="inline-flex">
    <button
      :id="buttonId"
      type="button"
      :class="text ? ['btn', primary ? 'btn-primary' : ''] : ['icon-btn h-8 w-8', open ? 'bg-canvas text-brandblue' : '']"
      :title="label"
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="open"
    >
      <template v-if="text">
        <i v-if="icon" :class="icon" aria-hidden="true" />
        <span :class="compactText ? 'sr-only' : ''">{{ text }}</span>
        <i class="fa-solid fa-chevron-down text-[10px]" aria-hidden="true" />
      </template>
      <i v-else class="fa-solid fa-ellipsis" aria-hidden="true" />
    </button>
    <DxContextMenu
      :target="`#${buttonId}`"
      show-event="dxclick"
      :items="visibleItems"
      :width="250"
      :position="{ my: 'right top', at: 'right bottom', offset: '0 4', collision: 'flipfit' }"
      item-template="menuItem"
      @item-click="onItemClick"
      @showing="open = true"
      @hidden="open = false"
    >
      <template #menuItem="{ data }">
        <div class="flex items-center gap-2.5 py-0.5 text-[13.5px]" :class="data.danger ? 'text-bad' : 'text-ink'">
          <i class="w-4 text-center" :class="data.icon" aria-hidden="true" />
          <span>{{ data.text }}</span>
        </div>
      </template>
    </DxContextMenu>
  </span>
</template>

<script setup>
import { computed, ref } from 'vue';
import { DxContextMenu } from 'devextreme-vue/context-menu';

// Menú «⋯» de acciones (o botón con texto si se pasa `text`). items: [{ id, text, icon, danger?, visible?, beginGroup? }]
const props = defineProps({
  items: { type: Array, required: true },
  label: { type: String, default: 'Más acciones' },
  text: { type: String, default: '' },
  icon: { type: String, default: '' },
  primary: Boolean,
  compactText: Boolean,
});
const emit = defineEmits(['select']);

const buttonId = `kebab-${Math.random().toString(36).slice(2, 9)}`;
const open = ref(false);
const visibleItems = computed(() => props.items.filter((i) => i.visible !== false));
const onItemClick = (e) => emit('select', e.itemData.id);
</script>
