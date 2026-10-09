<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <div :class="compact ? 'w-full' : 'w-[230px]'">
        <DxSelectBox
          :items="GROUPED"
          :grouped="true"
          :value="spec.type"
          value-expr="id"
          display-expr="label"
          item-template="item"
          :input-attr="{ 'aria-label': 'Tipo de gráfica' }"
          :drop-down-options="{ minWidth: 260 }"
          @value-changed="(e) => e.event && $emit('change', { type: e.value })"
        >
          <template #item="{ data }">
            <span class="flex items-center gap-2">
              <i class="fa-solid w-4 text-center text-brandlight" :class="data.icon" aria-hidden="true" />{{ data.label }}
            </span>
          </template>
        </DxSelectBox>
      </div>
      <DxCheckBox
        :value="spec.hasAverage"
        :disabled="polar"
        text="Línea de promedio"
        :element-attr="{ title: polar ? 'No aplica a pastel ni dona' : 'Línea horizontal con el promedio de la primera medida' }"
        @value-changed="(e) => e.event && $emit('change', { avg: e.value })"
      />
      <button
        v-if="help"
        type="button"
        class="icon-btn h-8 w-8 border border-line"
        title="¿Qué gráficas hay?"
        :aria-expanded="helpOpen"
        @click="helpOpen = !helpOpen"
      >
        <i class="fa-solid fa-circle-question" aria-hidden="true" /><span class="sr-only">¿Qué gráficas hay?</span>
      </button>
    </div>

    <div v-if="helpOpen" class="rounded-lg border border-line bg-white p-3 text-[12.5px]" role="region" aria-label="Ayuda de gráficas">
      <div class="grid gap-x-6 gap-y-3" :class="compact ? 'grid-cols-1' : 'grid-cols-2'">
        <section v-for="g in GROUPED" :key="g.key">
          <h4 class="m-0 mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-soft">{{ g.key }}</h4>
          <ul class="m-0 flex list-none flex-col gap-1 p-0">
            <li v-for="t in g.items" :key="t.id">
              <button
                type="button"
                class="flex w-full cursor-pointer items-start gap-2 rounded-md border-0 bg-transparent px-1.5 py-1 text-left hover:bg-canvas"
                :class="spec.type === t.id ? 'bg-[#e6f4fb]' : ''"
                @click="$emit('change', { type: t.id })"
              >
                <i class="fa-solid mt-0.5 w-4 text-center text-brandlight" :class="t.icon" aria-hidden="true" />
                <span><b class="text-ink">{{ t.label }}</b> <span class="text-ink-soft">· {{ t.help }}</span></span>
              </button>
            </li>
          </ul>
        </section>
        <section>
          <h4 class="m-0 mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-soft">Extras en gráficas de ejes</h4>
          <ul class="m-0 flex list-none flex-col gap-1 p-0">
            <li v-for="x in CHART_EXTRAS" :key="x.label" class="px-1.5 py-1"><b class="text-ink">{{ x.label }}</b> <span class="text-ink-soft">· {{ x.help }}</span></li>
          </ul>
        </section>
      </div>
      <p class="m-0 mt-3 text-ink-soft">
        También puedes pedírselo al asistente en el chat, por ejemplo:
        <template v-for="(x, i) in EXAMPLES" :key="x"><q class="text-ink">{{ x }}</q>{{ i < EXAMPLES.length - 1 ? ', ' : '.' }}</template>
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { DxSelectBox } from 'devextreme-vue/select-box';
import { DxCheckBox } from 'devextreme-vue/check-box';
import { CHART_EXTRAS, CHART_TYPES, POLAR_TYPES } from '@/shared/resultView';

const props = defineProps({
  /** Gráfica actual (de chartSpec). */
  spec: { type: Object, required: true },
  compact: Boolean,
  /** Muestra el botón de ayuda con los tipos disponibles. */
  help: { type: Boolean, default: true },
});
defineEmits(['change']);

const GROUPED = [...new Set(CHART_TYPES.map((t) => t.group))].map((key) => ({ key, items: CHART_TYPES.filter((t) => t.group === key) }));
const EXAMPLES = ['Ventas por mes en barras con una línea de promedio', 'Barras de ventas y línea de monto en el eje derecho', 'Agrega una meta en 500', 'Participación por sucursal en dona'];
const polar = computed(() => POLAR_TYPES.has(props.spec.type));
const helpOpen = ref(false);
</script>
