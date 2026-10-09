<template>
  <DxPopup
    :visible="visible"
    title="Guardar reporte"
    :width="width"
    height="auto"
    :max-height="maxHeight"
    :show-close-button="true"
    :hide-on-outside-click="true"
    @hiding="$emit('cancel')"
    @shown="focusInput"
  >
    <div class="scroll-thin flex max-h-full flex-col gap-3 overflow-y-auto">
      <label class="text-[13px] text-ink-soft" :for="inputId">Nombre del reporte</label>
      <DxTextBox
        ref="input"
        v-model:value="name"
        :input-attr="{ id: inputId, 'aria-label': 'Nombre del reporte' }"
        :max-length="120"
        @enter-key="confirm"
      />

      <template v-if="preview">
        <p class="m-0 mt-1 text-[13px] text-ink-soft">Gráfica del reporte</p>
        <ChartPicker :spec="preview" :compact="width < 520" :help="false" @change="pick" />
        <div class="rounded-lg border border-line bg-[#f8fbfd] p-3">
          <GenericChart :spec="preview" :columns="result.columns" :rows="result.rows" />
        </div>
      </template>

      <p v-if="hint" class="m-0 text-[12px] muted">{{ hint }}<template v-if="preview"> La gráfica elegida queda guardada con el reporte.</template></p>
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" class="btn" @click="$emit('cancel')">Cancelar</button>
        <button type="button" class="btn btn-primary" :disabled="!name.trim()" @click="confirm">Guardar</button>
      </div>
    </div>
  </DxPopup>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { DxPopup } from 'devextreme-vue/popup';
import { DxTextBox } from 'devextreme-vue/text-box';
import { chartSpec } from '@/shared/resultView';
import ChartPicker from './ChartPicker.vue';
import GenericChart from './GenericChart.vue';

const props = defineProps({
  visible: Boolean,
  title: { type: String, default: '' },
  /** Resultado que se guarda (columnas y filas para la vista previa). */
  result: { type: Object, default: null },
  /** Se elige gráfica (falso en el tablero de ventas, que tiene sus gráficas fijas). */
  charted: Boolean,
  /** Sugerencia de gráfica del agente. */
  chartHint: { type: Object, default: null },
  /** Elección actual del usuario: { type, avg }. */
  choice: { type: Object, default: () => ({}) },
  hint: { type: String, default: '' },
});
const emit = defineEmits(['confirm', 'cancel']);

const inputId = `save-report-${Math.random().toString(36).slice(2, 8)}`;
const name = ref(props.title);
const draft = ref({});
const input = ref(null);
const width = computed(() => Math.min(640, window.innerWidth - 16));
const maxHeight = computed(() => window.innerHeight - 16);

// Se parte de lo que el usuario ve en Resultados.
watch(() => props.visible, (v) => {
  if (!v) return;
  name.value = props.title;
  draft.value = { ...props.choice };
});

const preview = computed(() => (props.charted && props.result
  ? chartSpec(props.result.columns, props.result.rows, props.chartHint, draft.value)
  : null));

function pick(change) {
  draft.value = { ...draft.value, ...change };
}
function focusInput() {
  input.value?.instance?.focus();
}
function confirm() {
  if (!name.value.trim()) return;
  emit('confirm', {
    name: name.value.trim(),
    ...(preview.value ? { chartType: preview.value.type, chartAvg: preview.value.hasAverage } : {}),
  });
}
</script>
