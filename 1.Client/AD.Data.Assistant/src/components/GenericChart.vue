<template>
  <div v-if="polar" class="flex flex-wrap items-center gap-4">
    <DxPieChart
      :type="spec.type === 'doughnut' ? 'doughnut' : 'pie'"
      :data-source="data"
      :inner-radius="spec.type === 'doughnut' ? 0.6 : 0"
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
  <!-- Ejes, series y líneas de referencia van como objetos: cambian con cada gráfica y así no quedan restos. -->
  <DxChart
    v-else
    :key="chartKey"
    :data-source="data"
    :animation="{ enabled: false }"
    :size="{ height: 320 }"
    :redraw-on-resize="true"
    :rotated="spec.rotated"
    :common-series-settings="common"
    :series="series"
    :argument-axis="argumentAxis"
    :value-axis="valueAxes"
    :legend="{ visible: series.length > 1 || spec.refLines.length > 0, verticalAlignment: 'bottom', horizontalAlignment: 'center', itemTextPosition: 'right' }"
    :tooltip="{ enabled: true, customizeTooltip: (p) => ({ text: `${p.seriesName} · ${p.argumentText}\n${fmt(p.value, p.seriesName, p.argumentText)}` }) }"
  />
  <ul v-if="!polar && spec.refLines.length" class="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px] text-ink-soft">
    <li v-for="(l, i) in spec.refLines" :key="i" class="flex items-center gap-1.5">
      <span class="inline-block w-5 border-t-2 border-dashed" :style="{ borderColor: LINE_COLORS[i % LINE_COLORS.length] }" aria-hidden="true" />
      {{ l.label }}: <b class="num text-ink">{{ fmt(l.value, l.column) }}</b>
    </li>
  </ul>
  <p v-if="truncated" class="m-0 mt-2 text-[12px] muted">La gráfica muestra las primeras {{ MAX_BAR }} categorías; el detalle completo está en la pestaña Tabla.</p>
</template>

<script setup>
import { computed } from 'vue';
import DxChart from 'devextreme-vue/chart';
import DxPieChart, { DxLegend as DxPieLegend, DxSeries as DxPieSeries, DxTooltip as DxPieTooltip } from 'devextreme-vue/pie-chart';
import { CATEGORICAL } from '@/shared/chartColors';
import { MAX_BAR, POLAR_TYPES, chartData, formatValue } from '@/shared/resultView';

const props = defineProps({
  spec: { type: Object, required: true },
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
});

// Líneas de referencia en tonos que no se confunden con las series.
const LINE_COLORS = ['#c2410c', '#7c3aed', '#0f766e', '#be123c'];

const polar = computed(() => POLAR_TYPES.has(props.spec.type));
const prepared = computed(() => chartData(props.spec, props.columns, props.rows));
const data = computed(() => prepared.value.data);
const truncated = computed(() => prepared.value.truncated);
// Con totales traspuestos cada barra es una columna distinta: el formato lo da su nombre.
const fmt = (value, column, argument) => formatValue(value, props.spec.transpose && argument ? argument : column);

const series = computed(() => (props.spec.series ?? []).map((s, i) => ({
  valueField: s.column,
  name: s.column,
  type: s.type,
  axis: s.axis,
  color: CATEGORICAL[i % CATEGORICAL.length],
})));
const common = computed(() => ({
  argumentField: props.spec.x,
  // Tipo base para apilados y escalones; cada serie puede sobrescribirlo.
  type: props.spec.type === 'combo' || props.spec.type === 'horizontalbar' ? 'bar' : props.spec.type,
  barPadding: 0.15,
  cornerRadius: 3,
  width: 2,
  point: { size: 7 },
}));
const argumentAxis = { grid: { visible: false }, label: { overlappingBehavior: 'rotate', rotationAngle: -40 } };

const axisColumn = (axis) => props.spec.series?.find((s) => s.axis === axis)?.column ?? props.spec.y[0];
const constantLines = (axis) => (props.spec.refLines ?? []).map((l, i) => ({ ...l, i })).filter((l) => l.axis === axis).map((l) => ({
  value: l.value,
  color: LINE_COLORS[l.i % LINE_COLORS.length],
  dashStyle: 'dash',
  width: 2,
  label: { text: `${l.label}: ${fmt(l.value, l.column)}`, font: { size: 11, color: LINE_COLORS[l.i % LINE_COLORS.length] } },
}));
const valueAxes = computed(() => {
  const axes = [{
    name: 'left', grid: { color: '#eef2f6' },
    label: { customizeText: ({ value }) => fmt(value, axisColumn('left')) },
    constantLines: constantLines('left'),
  }];
  if (props.spec.series?.some((s) => s.axis === 'right')) {
    axes.push({
      name: 'right', position: 'right', grid: { visible: false },
      label: { customizeText: ({ value }) => fmt(value, axisColumn('right')) },
      constantLines: constantLines('right'),
    });
  }
  return axes;
});
const chartKey = computed(() => JSON.stringify([props.spec.type, props.spec.rotated, props.spec.series, props.spec.refLines]));
</script>
