<template>
  <DxPopup
    :visible="visible"
    :title="title"
    :width="420"
    height="auto"
    :show-close-button="true"
    :hide-on-outside-click="true"
    @hiding="$emit('cancel')"
    @shown="focusInput"
  >
    <div class="flex flex-col gap-3">
      <label class="text-[13px] text-ink-soft" :for="inputId">{{ label }}</label>
      <DxTextBox
        ref="input"
        v-model:value="text"
        :input-attr="{ id: inputId, 'aria-label': label }"
        :max-length="120"
        @enter-key="confirm"
      />
      <p v-if="hint" class="m-0 text-[12px] muted">{{ hint }}</p>
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" class="btn" @click="$emit('cancel')">Cancelar</button>
        <button type="button" class="btn btn-primary" :disabled="!text.trim()" @click="confirm">{{ okText }}</button>
      </div>
    </div>
  </DxPopup>
</template>

<script setup>
import { ref, watch } from 'vue';
import { DxPopup } from 'devextreme-vue/popup';
import { DxTextBox } from 'devextreme-vue/text-box';

const props = defineProps({
  visible: Boolean,
  title: { type: String, required: true },
  label: { type: String, default: 'Título' },
  value: { type: String, default: '' },
  hint: { type: String, default: '' },
  okText: { type: String, default: 'Guardar' },
});
const emit = defineEmits(['confirm', 'cancel']);

const inputId = `prompt-${Math.random().toString(36).slice(2, 8)}`;
const text = ref(props.value);
const input = ref(null);

watch(() => [props.visible, props.value], ([v]) => { if (v) text.value = props.value; });

function focusInput() {
  input.value?.instance?.focus();
}
function confirm() {
  if (text.value.trim()) emit('confirm', text.value.trim());
}
</script>
