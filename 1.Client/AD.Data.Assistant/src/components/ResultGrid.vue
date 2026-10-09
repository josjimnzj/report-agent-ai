<template>
  <div class="flex flex-col gap-2">
    <p v-if="truncated" class="m-0 rounded-lg bg-[#fff7e0] px-3 py-2 text-[12.5px] text-ink" role="status">
      <i class="fa-solid fa-triangle-exclamation mr-1 text-[#9a6a00]" aria-hidden="true" />
      Se guardaron {{ rows.length }} de {{ totalRows }} filas.
    </p>
    <DxDataGrid
      :data-source="dataSource"
      :show-borders="true"
      :row-alternation-enabled="true"
      :column-auto-width="true"
      :allow-column-resizing="true"
      :hover-state-enabled="true"
      key-expr="__row"
      @exporting="onExporting"
    >
      <DxColumn
        v-for="c in columnDefs"
        :key="c.dataField"
        :data-field="c.dataField"
        :caption="c.caption"
        :data-type="c.dataType"
        :format="c.format"
        :alignment="c.alignment"
        :customize-text="c.customizeText"
      />
      <DxSummary>
        <DxTotalItem v-for="c in numericColumns" :key="c.dataField" :column="c.dataField" summary-type="sum" :value-format="c.format" display-format="{0}" />
      </DxSummary>
      <DxFilterRow :visible="true" />
      <DxSearchPanel :visible="true" :width="220" placeholder="Buscar…" />
      <DxSorting mode="multiple" />
      <DxPaging :page-size="20" />
      <DxPager :show-info="true" info-text="Página {0} de {1} ({2} filas)" />
      <DxExport :enabled="true" :formats="['xlsx']" />
    </DxDataGrid>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import DxDataGrid, {
  DxColumn, DxExport, DxFilterRow, DxPager, DxPaging, DxSearchPanel, DxSorting, DxSummary, DxTotalItem,
} from 'devextreme-vue/data-grid';
import { exportDataGrid } from 'devextreme/excel_exporter';
import { Workbook } from 'exceljs';
import { saveAs } from 'file-saver';
import { monthLabel } from '@/shared/salesReport';

const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  totalRows: { type: Number, default: null },
  truncated: Boolean,
});

const COUNT_COLUMNS = new Set(['Oportunidades', 'Ganadas']);

const dataSource = computed(() =>
  props.rows.map((r, i) => Object.fromEntries([['__row', i], ...props.columns.map((c, j) => [c, r[j]])])));

const columnDefs = computed(() => props.columns.map((c) => {
  const numeric = props.rows.length && props.rows.every((r) => typeof r[props.columns.indexOf(c)] === 'number');
  if (c === 'Mes') {
    return {
      dataField: c, caption: 'Mes', dataType: 'string',
      customizeText: ({ value }) => (value ? `${monthLabel(value)} ${String(value).slice(0, 4)}` : ''),
    };
  }
  if (!numeric) return { dataField: c, caption: c, dataType: 'string' };
  return {
    dataField: c,
    caption: c,
    dataType: 'number',
    alignment: 'right',
    format: COUNT_COLUMNS.has(c) ? { type: 'fixedPoint', precision: 0 } : { type: 'currency', currency: 'MXN', precision: 0 },
  };
}));
const numericColumns = computed(() => columnDefs.value.filter((c) => c.dataType === 'number'));

function onExporting(e) {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Consulta');
  exportDataGrid({ component: e.component, worksheet: sheet, autoFilterEnabled: true }).then(() =>
    workbook.xlsx.writeBuffer().then((buffer) => {
      const date = new Date().toISOString().slice(0, 10);
      saveAs(new Blob([buffer], { type: 'application/octet-stream' }), `consulta-${date}.xlsx`);
    }));
  e.cancel = true;
}
</script>
