<template>
  <div class="flex flex-wrap items-center gap-4">
    <div class="relative mx-auto h-[220px] w-[220px] shrink-0">
      <DxPieChart
        type="doughnut"
        :data-source="report.branchStats"
        :inner-radius="0.62"
        :start-angle="90"
        :animation="{ enabled: false }"
        :size="{ width: 220, height: 220 }"
        :customize-point="customizePoint"
        :segments-direction="'clockwise'"
      >
        <DxSeries argument-field="name" value-field="total" :border="{ visible: true, color: '#ffffff', width: 2 }" />
        <DxLegend :visible="false" />
        <DxTooltip :enabled="true" :customize-tooltip="tooltip" />
      </DxPieChart>
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span class="num text-[18px] font-semibold text-ink">{{ fmtMoney(report.current.sales) }}</span>
        <span class="text-[12px] text-ink-soft">Total</span>
      </div>
    </div>
    <ul class="m-0 flex min-w-[170px] max-w-[280px] flex-1 list-none flex-col gap-2.5 p-0">
      <li v-for="b in report.branchStats" :key="b.name" class="flex items-center gap-2.5 text-[13px]">
        <span class="h-3 w-3 shrink-0 rounded-full" :style="{ background: colorFor(b.name) }" aria-hidden="true" />
        <span class="flex-1 text-ink">{{ b.name }}</span>
        <span class="num text-ink-soft">{{ fmtPct(b.share, 1) }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import DxPieChart, { DxLegend, DxSeries, DxTooltip } from 'devextreme-vue/pie-chart';
import { colorFor } from '@/shared/chartColors';
import { fmtMoney, fmtPct } from '@/shared/salesReport';

defineProps({ report: { type: Object, required: true } });

const customizePoint = (p) => ({ color: colorFor(p.argument) });
const tooltip = (p) => ({ text: `${p.argumentText}\n${fmtMoney(p.value)} · ${fmtPct(p.percent, 1)}` });
</script>
