<template>
  <div class="scroll-thin overflow-x-auto">
    <table class="num w-full border-collapse text-[12.5px]">
      <thead>
        <tr class="bg-canvas text-ink-soft">
          <th scope="col" class="border border-line px-2.5 py-2 text-left font-medium">Mes</th>
          <th v-for="b in report.branches" :key="b" scope="col" class="border border-line px-2.5 py-2 text-right font-medium">{{ b }}</th>
          <th scope="col" class="border border-line px-2.5 py-2 text-right font-semibold text-ink">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in report.months" :key="m.key" class="hover:bg-[#f7fbfe]">
          <th scope="row" class="border border-line px-2.5 py-2 text-left font-normal text-ink">{{ m.label }}</th>
          <td v-for="b in report.branches" :key="b" class="border border-line px-2.5 py-2 text-right text-ink">{{ fmtInt(m.byBranch[b]) }}</td>
          <td class="border border-line px-2.5 py-2 text-right font-semibold text-ink">{{ fmtInt(m.total) }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="bg-canvas">
          <th scope="row" class="border border-line px-2.5 py-2 text-left font-semibold text-ink">Total</th>
          <td v-for="b in report.branchStats" :key="b.name" class="border border-line px-2.5 py-2 text-right font-semibold text-ink">{{ fmtInt(b.total) }}</td>
          <td class="border border-line px-2.5 py-2 text-right font-bold text-ink">{{ fmtInt(report.current.sales) }}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<script setup>
import { fmtInt } from '@/shared/salesReport';

defineProps({ report: { type: Object, required: true } });
</script>
