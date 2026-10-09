<template>
  <div v-if="spec.type === 'pie'" class="flex flex-wrap items-center gap-4">
    <DxPieChart
      type="doughnut"
      :data-source="data"
      :inner-radius="0.6"
      :animation="{ enabled: false }"
      :size="{ width: 240, height: 240 }"
      :customize-point="(p) => ({ color: CATEGORICAL[p.index % CATEGORICAL.length] })"
    >
      <DxPieSeries :argument-field="spec.x" :value-field="spec.y[0]" :border="{ visible: true, color: '#ffffff', width: 2 }" />
      <DxPieLegend :visible="false" />
      <DxPieTooltip :enabled="true" :customize-tooltip="(p) => ({ text: `${p.argumentText}\n${fmt(p.value, spec.y[0], p.argumentText)}` })" />
    </DxPieChart>
    <ul class="m-0 flex min-w-[160px] max-w-[300px] flex-1 list-none flex-col gap-2 p-0">
      <li v-for="(r, i) in data" :key="i" class="flex items-center gap-2.5 text-[13px]">
        <span class="h-3 w-3 shrink-0 rounded-full" :style="{ background: CATEGORICAL[i % CATEGORICAL.length] }" aria-hidden="true" />
        <span class="flex-1 truncate text-ink">{{ r[spec.x] }}</span>
        <span class="num text-ink-soft">{{ fmt(r[spec.y[0]], spec.y[0], r[spec.x]) }}</span>
      </li>
    </ul>
  </div>
  <DxChart v-else :key="spec.type + spec.y.join('|')" :data-source="data" :animation="{ enabled: false }" :size="{ height: 300 }" :redraw-on-resize="true">
    <DxCommonSeriesSettings :argument-field="spec.x" :type="spec.type" :bar-padding="0.15" :corner-radius="3" :width="2">
      <DxPoint :size="7" />
    </DxCommonSeriesSettings>
    <DxSeries v-for="(y, i) in spec.y" :key="y" :value-field="y" :name="y" :color="CATEGORICAL[i % CATEGORICAL.length]" />
    <DxArgumentAxis><DxGrid :visible="false" /><DxLabel overlapping-behavior="rotate" :rotation-angle="-40" /></DxArgumentAxis>
    <DxValueAxis><DxGrid color="#eef2f6" /><DxLabel :customize-text="({ value }) => fmt(value, spec.y[0])" /></DxValueAxis>
    <DxLegend :visible="spec.y.length > 1" vertical-alignment="bottom" horizontal-alignment="center" item-text-position="right" />
    <DxTooltip :enabled="true" :customize-tooltip="(p) => ({ text: `${p.seriesName} · ${p.argumentText}\n${fmt(p.value, p.seriesName, p.argumentText)}` })" />
  </DxChart>
  <p v-if="truncated" class="m-0 mt-2 text-[12px] muted">La gráfica muestra las primeras {{ MAX_BAR }} categorías; el detalle completo está en la pestaña Tabla.</p>
</template>

<script setup>
import { computed } from 'vue';
import DxChart, {
  DxArgumentAxis, DxCommonSeriesSettings, DxGrid, DxLabel, DxLegend, DxPoint, DxSeries, DxTooltip, DxValueAxis,
} from 'devextreme-vue/chart';
import DxPieChart, { DxLegend as DxPieLegend, DxSeries as DxPieSeries, DxTooltip as DxPieTooltip } from 'devextreme-vue/pie-chart';
import { CATEGORICAL } from '@/shared/chartColors';
import { MAX_BAR, chartData, formatValue } from '@/shared/resultView';

const props = defineProps({
  spec: { type: Object, required: true },
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
});

const prepared = computed(() => chartData(props.spec, props.columns, props.rows));
const data = computed(() => prepared.value.data);
const truncated = computed(() => prepared.value.truncated);
// Con totales traspuestos cada barra es una columna distinta: el formato lo da su nombre.
const fmt = (value, column, argument) => formatValue(value, props.spec.transpose && argument ? argument : column);
</script>
