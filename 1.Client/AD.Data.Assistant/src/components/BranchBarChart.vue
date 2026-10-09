<template>
  <DxChart :key="branches.join('|')" :data-source="data" :animation="{ enabled: false }" :size="{ height: 270 }" :redraw-on-resize="true">
    <DxCommonSeriesSettings argument-field="month" type="bar" :bar-padding="0.12" :corner-radius="3" />
    <DxSeries v-for="b in branches" :key="b" :value-field="b" :name="b" :color="colorFor(b)" />
    <DxArgumentAxis><DxGrid :visible="false" /></DxArgumentAxis>
    <DxValueAxis>
      <DxGrid color="#eef2f6" />
      <DxLabel :customize-text="axisMoney" />
    </DxValueAxis>
    <DxLegend vertical-alignment="bottom" horizontal-alignment="center" item-text-position="right" :column-item-spacing="18" />
    <DxTooltip :enabled="true" :customize-tooltip="tooltip" />
  </DxChart>
</template>

<script setup>
import { computed } from 'vue';
import DxChart, {
  DxArgumentAxis, DxCommonSeriesSettings, DxGrid, DxLabel, DxLegend, DxSeries, DxTooltip, DxValueAxis,
} from 'devextreme-vue/chart';
import { colorFor } from '@/shared/chartColors';
import { fmtCompactMoney, fmtMoney, monthShort } from '@/shared/salesReport';

const props = defineProps({ report: { type: Object, required: true } });

const branches = computed(() => props.report.branches);
const data = computed(() => props.report.months.map((m) => ({ month: monthShort(m.key), monthLabel: m.label, ...m.byBranch })));
const axisMoney = ({ value }) => fmtCompactMoney(value);
const tooltip = (p) => ({ text: `${p.seriesName} · ${p.point.data.monthLabel}\n${fmtMoney(p.value)}` });
</script>
