<template>
  <ScrollX>
    <table class="num w-full border-separate border-spacing-0 text-[12.5px]">
      <thead>
        <tr class="text-ink-soft">
          <th scope="col" class="sticky-col cell bg-canvas text-left font-medium">Mes</th>
          <th v-for="b in report.branches" :key="b" scope="col" class="cell bg-canvas text-right font-medium">{{ b }}</th>
          <th scope="col" class="cell bg-canvas text-right font-semibold text-ink">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in report.months" :key="m.key" class="hover:bg-[#f7fbfe]">
          <th scope="row" class="sticky-col cell bg-white text-left font-normal text-ink">{{ m.label }}</th>
          <td v-for="b in report.branches" :key="b" class="cell whitespace-nowrap text-right text-ink">{{ fmtInt(m.byBranch[b]) }}</td>
          <td class="cell whitespace-nowrap text-right font-semibold text-ink">{{ fmtInt(m.total) }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" class="sticky-col cell bg-canvas text-left font-semibold text-ink">Total</th>
          <td v-for="b in report.branchStats" :key="b.name" class="cell whitespace-nowrap bg-canvas text-right font-semibold text-ink">{{ fmtInt(b.total) }}</td>
          <td class="cell whitespace-nowrap bg-canvas text-right font-bold text-ink">{{ fmtInt(report.current.sales) }}</td>
        </tr>
      </tfoot>
    </table>
  </ScrollX>
</template>

<script setup>
import { fmtInt } from '@/shared/salesReport';
import ScrollX from './ScrollX.vue';

defineProps({ report: { type: Object, required: true } });
</script>

<style scoped>
/* border-separate: con border-collapse las celdas fijas pierden el borde al desplazar. */
.cell { border-right: 1px solid theme('colors.line'); border-bottom: 1px solid theme('colors.line'); padding: 8px 10px; }
tr > :first-child { border-left: 1px solid theme('colors.line'); }
thead .cell { border-top: 1px solid theme('colors.line'); }
/* Mes fijo a la izquierda al desplazar en horizontal, con una sombra que lo separa de los datos. */
.sticky-col { position: sticky; left: 0; z-index: 1; box-shadow: 4px 0 6px -4px rgba(15, 42, 61, .25); }
</style>
