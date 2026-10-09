<template>
  <DxPopup
    :visible="visible"
    :title="title"
    :width="popupWidth"
    height="auto"
    :show-close-button="true"
    :hide-on-outside-click="true"
    @hiding="$emit('cancel')"
    @shown="focusTitle"
  >
    <form class="flex flex-col gap-3" @submit.prevent="confirm">
      <label class="text-[13px] text-ink-soft" :for="ids.title">Título</label>
      <DxTextBox
        ref="titleBox"
        v-model:value="draftTitle"
        :input-attr="{ id: ids.title, 'aria-label': 'Título' }"
        :max-length="120"
        @enter-key="confirm"
      />
      <label class="text-[13px] text-ink-soft" :for="ids.tags">Etiquetas</label>
      <DxTagBox
        v-model:value="draftTags"
        :items="tagItems"
        :accept-custom-value="true"
        :search-enabled="true"
        :show-drop-down-button="tagItems.length > 0"
        :hide-selected-items="true"
        :max-displayed-tags="MAX_TAGS"
        :input-attr="{ id: ids.tags, 'aria-label': 'Etiquetas' }"
        placeholder="Escribe una etiqueta y pulsa Enter"
        no-data-text="Escribe una etiqueta nueva y pulsa Enter"
        @custom-item-creating="createTag"
      />
      <p class="m-0 text-[12px] muted">
        Hasta {{ MAX_TAGS }} etiquetas. Sirven para filtrar las conversaciones en el menú.
        <template v-if="hint"><br>{{ hint }}</template>
      </p>
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" class="btn" @click="$emit('cancel')">Cancelar</button>
        <button type="submit" class="btn btn-primary" :disabled="!draftTitle.trim()">{{ okText }}</button>
      </div>
    </form>
  </DxPopup>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { DxPopup } from 'devextreme-vue/popup';
import { DxTextBox } from 'devextreme-vue/text-box';
import { DxTagBox } from 'devextreme-vue/tag-box';
import { MAX_TAGS, normalizeTags, tagKey } from '@/shared/tags';

const props = defineProps({
  visible: Boolean,
  title: { type: String, default: 'Editar chat' },
  chatTitle: { type: String, default: '' },
  tags: { type: Array, default: () => [] },
  allTags: { type: Array, default: () => [] },
  hint: { type: String, default: '' },
  okText: { type: String, default: 'Guardar' },
});
const emit = defineEmits(['confirm', 'cancel']);

const uid = Math.random().toString(36).slice(2, 8);
const ids = { title: `chat-title-${uid}`, tags: `chat-tags-${uid}` };
const draftTitle = ref('');
const draftTags = ref([]);
const created = ref([]);
const titleBox = ref(null);

const popupWidth = computed(() => Math.min(460, window.innerWidth - 24));
const tagItems = computed(() => normalizeTags([...props.allTags, ...created.value]));

watch(() => props.visible, (v) => {
  if (!v) return;
  draftTitle.value = props.chatTitle;
  draftTags.value = [...props.tags];
  created.value = [];
});

function createTag(e) {
  const [tag] = normalizeTags([e.text]);
  if (!tag) { e.customItem = null; return; }
  // Si ya existe con otra grafía (mayúsculas o acentos), se reutiliza la existente.
  const existing = tagItems.value.find((t) => tagKey(t) === tagKey(tag));
  if (!existing) created.value = [...created.value, tag];
  e.customItem = existing ?? tag;
}
function focusTitle() {
  titleBox.value?.instance?.focus();
}
function confirm() {
  if (!draftTitle.value.trim()) return;
  emit('confirm', { title: draftTitle.value.trim(), tags: normalizeTags(draftTags.value) });
}
</script>
