<template>
  <DxChart :key="branches.join('|')" :data-source="data" :animation="{ enabled: false }" :size="{ height: 270 }" :redraw-on-resize="true">
    <DxCommonSeriesSettings argument-field="month" type="line" :width="2">
      <DxPoint :size="8" />
    </DxCommonSeriesSettings>
    <DxSeries v-for="b in branches" :key="b" :value-field="b" :name="b" :color="colorFor(b)" />
    <DxArgumentAxis :discrete-axis-division-mode="'crossLabels'"><DxGrid :visible="false" /></DxArgumentAxis>
    <DxValueAxis>
      <DxGrid color="#eef2f6" />
      <DxLabel :customize-text="axisMoney" />
    </DxValueAxis>
    <DxCrosshair :enabled="true" color="#9fb2c2" dash-style="dash">
      <DxHorizontalLine :visible="false" />
    </DxCrosshair>
    <DxLegend vertical-alignment="bottom" horizontal-alignment="center" item-text-position="right" :column-item-spacing="18" />
    <DxTooltip :enabled="true" :shared="true" :customize-tooltip="tooltip" />
  </DxChart>
</template>

<script setup>
import { computed } from 'vue';
import DxChart, {
  DxArgumentAxis, DxCommonSeriesSettings, DxCrosshair, DxGrid, DxHorizontalLine, DxLabel, DxLegend, DxPoint, DxSeries,
  DxTooltip, DxValueAxis,
} from 'devextreme-vue/chart';
import { colorFor } from '@/shared/chartColors';
import { fmtCompactMoney, fmtMoney, monthShort } from '@/shared/salesReport';

const props = defineProps({ report: { type: Object, required: true } });

const branches = computed(() => props.report.branches);
const data = computed(() => props.report.months.map((m) => ({ month: monthShort(m.key), monthLabel: m.label, ...m.byBranch })));
const axisMoney = ({ value }) => fmtCompactMoney(value);
const tooltip = (p) => ({
  text: [p.points[0].point.data.monthLabel, ...p.points.map((x) => `${x.seriesName}: ${fmtMoney(x.value)}`)].join('\n'),
});
</script>
