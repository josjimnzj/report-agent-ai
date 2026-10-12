<template>
  <div class="scroll-thin h-full overflow-y-auto bg-canvas">
    <header class="bg-brandblue px-4 py-3 text-white sm:px-6">
      <div class="mx-auto flex max-w-6xl items-center gap-2 text-[13px]">
        <i class="fa-solid fa-chart-column" aria-hidden="true" />
        <span class="font-semibold">AddACCION</span><span class="opacity-80">· Reporte publicado</span>
      </div>
    </header>

    <main class="mx-auto flex max-w-6xl flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6">
      <div v-if="state === 'loading'" class="card flex items-center justify-center gap-2 p-10 text-[14px] text-ink-soft" role="status">
        <i class="fa-solid fa-spinner fa-spin text-brandlight" aria-hidden="true" /> Cargando reporte…
      </div>

      <div v-else-if="state === 'error'" class="card flex flex-col items-center gap-2 p-10 text-center">
        <i class="fa-solid text-[40px] text-[#c9d6e2]" :class="status === 410 ? 'fa-clock' : 'fa-link-slash'" aria-hidden="true" />
        <h1 class="m-0 text-[18px] font-semibold text-ink">{{ status === 410 ? 'Este enlace caducó' : status === 404 ? 'Enlace no disponible' : 'No se pudo abrir el reporte' }}</h1>
        <p class="m-0 max-w-md text-[13.5px] text-ink-soft">{{ error }}</p>
        <button v-if="status === 0 || status >= 500 || status === 429" type="button" class="btn mt-2" @click="load">
          <i class="fa-solid fa-rotate" aria-hidden="true" /> Reintentar
        </button>
      </div>

      <template v-else>
        <div>
          <h1 class="m-0 text-[22px] font-semibold text-brandblue sm:text-[26px]">{{ data.title }}</h1>
          <p class="m-0 mt-1 text-[13px] text-ink-soft">
            Datos al {{ fmtDate(data.publishedAt) }} · Enlace válido hasta el {{ fmtDate(data.expiresAt) }}
          </p>
        </div>

        <!-- Filtros elegidos al publicar. Se aplican en el navegador sobre la copia publicada. -->
        <section v-if="filters.length" class="card flex flex-col gap-3 p-4" aria-label="Filtros">
          <div class="flex flex-wrap items-end gap-3">
            <div v-for="f in filters" :key="f.column" class="flex min-w-[180px] flex-col gap-1" :class="f.kind === 'date' && values[f.column].preset === 'custom' ? 'sm:min-w-[360px]' : ''">
              <span class="text-[12.5px] text-ink-soft">{{ f.label }}</span>
              <template v-if="f.kind === 'date'">
                <DxSelectBox
                  :items="meta[f.column].presets"
                  :value="values[f.column].preset"
                  value-expr="id"
                  display-expr="text"
                  :input-attr="{ 'aria-label': f.label }"
                  @value-changed="(e) => setDate(f, { preset: e.value })"
                />
                <div v-if="values[f.column].preset === 'custom'" class="flex gap-2">
                  <DxSelectBox
                    class="flex-1"
                    :items="meta[f.column].keys"
                    :value="values[f.column].from"
                    :display-expr="dateText"
                    :search-enabled="true"
                    :show-clear-button="true"
                    placeholder="Desde"
                    :input-attr="{ 'aria-label': `${f.label}: desde` }"
                    @value-changed="(e) => setDate(f, { from: e.value })"
                  />
                  <DxSelectBox
                    class="flex-1"
                    :items="meta[f.column].keys"
                    :value="values[f.column].to"
                    :display-expr="dateText"
                    :search-enabled="true"
                    :show-clear-button="true"
                    placeholder="Hasta"
                    :input-attr="{ 'aria-label': `${f.label}: hasta` }"
                    @value-changed="(e) => setDate(f, { to: e.value })"
                  />
                </div>
              </template>
              <DxTagBox
                v-else-if="f.kind === 'select'"
                :items="meta[f.column].options"
                :value="values[f.column]"
                :show-selection-controls="true"
                :search-enabled="true"
                :multiline="false"
                :max-displayed-tags="2"
                apply-value-mode="instantly"
                placeholder="Todos"
                :input-attr="{ 'aria-label': f.label }"
                @value-changed="(e) => (values[f.column] = e.value ?? [])"
              />
              <div v-else class="flex gap-2">
                <DxNumberBox
                  :value="values[f.column].min"
                  :placeholder="`Mín. ${fmtNum(meta[f.column].bounds.min, f.column)}`"
                  :show-clear-button="true"
                  :input-attr="{ 'aria-label': `${f.label}: mínimo` }"
                  @value-changed="(e) => (values[f.column] = { ...values[f.column], min: e.value ?? null })"
                />
                <DxNumberBox
                  :value="values[f.column].max"
                  :placeholder="`Máx. ${fmtNum(meta[f.column].bounds.max, f.column)}`"
                  :show-clear-button="true"
                  :input-attr="{ 'aria-label': `${f.label}: máximo` }"
                  @value-changed="(e) => (values[f.column] = { ...values[f.column], max: e.value ?? null })"
                />
              </div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-3 text-[12.5px] text-ink-soft" role="status">
            <span>Mostrando <b class="num text-ink">{{ fmtInt(rows.length) }}</b> de {{ fmtInt(allRows.length) }} filas</span>
            <button v-if="changed" type="button" class="btn py-1 text-[12.5px]" @click="reset">
              <i class="fa-solid fa-rotate-left" aria-hidden="true" /> Restablecer filtros
            </button>
          </div>
        </section>

        <div class="flex gap-1 border-b border-line" role="tablist" aria-label="Vistas del reporte">
          <button
            v-for="t in tabs"
            :id="`ptab-${t.id}`"
            :key="t.id"
            type="button"
            role="tab"
            :aria-selected="tab === t.id"
            class="-mb-px flex cursor-pointer items-center gap-2 border-0 border-b-[3px] bg-transparent px-3 py-2.5 text-[14px]"
            :class="tab === t.id ? 'border-brandlight font-semibold text-brandblue' : 'border-transparent text-ink-soft hover:text-brandblue'"
            @click="tab = t.id"
          >
            <i class="fa-solid" :class="t.icon" aria-hidden="true" /> {{ t.label }}
          </button>
        </div>

        <p v-if="!rows.length" class="card m-0 p-6 text-center text-[13.5px] text-ink-soft">Ningún dato cumple los filtros.</p>

        <article v-else-if="tab === 'chart'" class="card min-w-0 p-4" role="tabpanel" aria-labelledby="ptab-chart">
          <div class="mb-3 flex flex-wrap items-start gap-2">
            <h2 class="section-title m-0 flex-1 pt-1.5">{{ display.table ? 'Datos' : chartTitle }}</h2>
            <ChartPicker
              v-if="display.suggestion"
              :spec="display.chart ?? display.suggestion"
              :value="display.table ? TABLE_TYPE : null"
              :type-only="display.table"
              allow-table
              :help="false"
              :compact="narrow"
              @change="pick"
            />
          </div>
          <ResultGrid v-if="display.table" :columns="columns" :rows="rows" />
          <GenericChart v-else :spec="display.chart" :columns="columns" :rows="rows" />
        </article>

        <article v-else-if="tab === 'table'" class="card min-w-0 p-4" role="tabpanel" aria-labelledby="ptab-table">
          <ResultGrid :columns="columns" :rows="rows" :total-rows="filtered ? null : data.result.totalRows" :truncated="!filtered && (data.result.totalRows ?? 0) > allRows.length" />
        </article>

        <article v-else-if="tab === 'insights'" class="card p-5" role="tabpanel" aria-labelledby="ptab-insights">
          <p v-if="filtered" class="m-0 mb-3 text-[12.5px] text-ink-soft">
            <i class="fa-solid fa-circle-info mr-1 text-brandlight" aria-hidden="true" /> Calculados con todos los datos publicados; no cambian con los filtros.
          </p>
          <InsightsList :insights="insights" :columns="narrow ? 1 : 2" />
        </article>

        <p class="m-0 pb-4 text-center text-[12px] muted">Vista de solo lectura. Cualquiera con este enlace puede verla hasta que caduque.</p>
      </template>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { DxSelectBox } from 'devextreme-vue/select-box';
import { DxTagBox } from 'devextreme-vue/tag-box';
import { DxNumberBox } from 'devextreme-vue/number-box';
import { publicationsApi } from '@/services/publicationsApi';
import { fmtInt } from '@/shared/salesReport';
import { TABLE_TYPE, formatValue, resultDisplay } from '@/shared/resultView';
import {
  applyFilters, dateKeys, datePresets, defaultValue, formatDateKey, numericBounds, selectOptions,
} from '@/shared/publishFilters';
import ChartPicker from '@/components/ChartPicker.vue';
import GenericChart from '@/components/GenericChart.vue';
import ResultGrid from '@/components/ResultGrid.vue';
import InsightsList from '@/components/InsightsList.vue';

const route = useRoute();
const state = ref('loading');
const status = ref(0);
const error = ref('');
const data = ref(null);
const values = reactive({});
const choice = ref({});
const tab = ref('chart');

const media = window.matchMedia('(max-width: 640px)');
const narrow = ref(media.matches);
const onMedia = (e) => { narrow.value = e.matches; };
media.addEventListener('change', onMedia);

// El enlace no debe indexarse ni filtrar el token a otros sitios.
const metas = [['robots', 'noindex, nofollow'], ['referrer', 'no-referrer']].map(([name, content]) => {
  const m = document.createElement('meta');
  Object.assign(m, { name, content });
  document.head.appendChild(m);
  return m;
});
onBeforeUnmount(() => {
  media.removeEventListener('change', onMedia);
  metas.forEach((m) => m.remove());
});

const columns = computed(() => data.value?.result.columns ?? []);
const allRows = computed(() => data.value?.result.rows ?? []);
const filters = computed(() => (data.value?.filters ?? []).filter((f) => columns.value.includes(f.column)));
const meta = computed(() => Object.fromEntries(filters.value.map((f) => {
  if (f.kind === 'date') {
    const keys = dateKeys(columns.value, allRows.value, f.column);
    return [f.column, { keys, presets: datePresets(keys) }];
  }
  if (f.kind === 'select') return [f.column, { options: selectOptions(columns.value, allRows.value, f.column) }];
  return [f.column, { bounds: numericBounds(columns.value, allRows.value, f.column) }];
})));

const rows = computed(() => applyFilters(columns.value, allRows.value, filters.value, values));
const filtered = computed(() => rows.value.length !== allRows.value.length);
const changed = computed(() => filters.value.some((f) => JSON.stringify(values[f.column]) !== JSON.stringify(defaultValue(f))));
const insights = computed(() => (Array.isArray(data.value?.result.insights) ? data.value.result.insights : []));
const tabs = computed(() => [
  { id: 'chart', label: 'Gráfica', icon: 'fa-chart-column' },
  { id: 'table', label: 'Tabla', icon: 'fa-table' },
  ...(insights.value.length ? [{ id: 'insights', label: 'Insights', icon: 'fa-lightbulb' }] : []),
]);

// La gráfica se recalcula con las filas filtradas; el visitante puede cambiar tipo y líneas sin tocar lo publicado.
const display = computed(() => {
  const r = data.value?.result;
  if (!r) return { table: true, suggestion: null, chart: null };
  return resultDisplay({
    ...r, rows: rows.value,
    chartType: choice.value.type ?? r.chartType,
    chartLines: choice.value.lines ?? r.chartLines,
  });
});
const chartTitle = computed(() => {
  const c = display.value.chart;
  return !c ? '' : c.transpose ? 'Indicadores' : c.x === '#' ? c.y.join(', ') : `${c.y.join(', ')} por ${c.x}`;
});
function pick(c) {
  choice.value = { ...choice.value, ...(c.type ? { type: c.type } : {}), ...(c.lines ? { lines: c.lines } : {}) };
}

function setDate(f, patch) {
  values[f.column] = { ...values[f.column], ...patch };
}
function reset() {
  for (const f of filters.value) values[f.column] = defaultValue(f);
}

const dateText = (key) => (key ? formatDateKey(key) : '');
const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtNum = (v, column) => (v == null ? '' : formatValue(v, column));

async function load() {
  state.value = 'loading';
  const res = await publicationsApi.view(String(route.params.token ?? ''));
  if (!res.ok) {
    status.value = res.status;
    error.value = res.error;
    state.value = 'error';
    document.title = 'Reporte no disponible · AddACCION';
    return;
  }
  data.value = res.data;
  reset();
  // Sin gráfica guardada ni sugerida, se abre la tabla.
  if (!resultDisplay(res.data.result).suggestion) tab.value = 'table';
  document.title = `${res.data.title} · AddACCION`;
  state.value = 'ready';
}
onMounted(load);
</script>
