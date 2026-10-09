<template>
  <section class="card print-full flex h-full min-w-0 flex-col" :class="narrow ? 'scroll-thin overflow-y-auto' : 'overflow-hidden'" aria-label="Resultados">
    <div v-if="!result" class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <i class="fa-solid fa-chart-pie text-[40px] text-[#c9d6e2]" aria-hidden="true" />
      <p class="m-0 text-[15px] font-semibold text-ink">Aquí verás los resultados</p>
      <p class="m-0 max-w-sm text-[13px] muted">Haz una pregunta en el chat o abre un reporte guardado para ver indicadores, gráficas, la tabla y el SQL.</p>
    </div>

    <template v-else>
      <header class="flex flex-wrap items-start gap-3" :class="narrow ? 'px-4 pb-2 pt-4' : 'gap-4 px-6 pb-2 pt-5'">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h2 v-if="!editingTitle" class="m-0 truncate font-semibold text-brandblue" :class="narrow ? 'text-[18px]' : 'text-[22px]'">{{ title }}</h2>
            <input
              v-else
              ref="titleInput"
              v-model="draftTitle"
              class="w-full max-w-xl rounded-lg border border-brandlight px-2 py-1 text-[20px] font-semibold text-brandblue outline-none"
              aria-label="Título del reporte"
              maxlength="120"
              @keydown.enter="commitTitle"
              @keydown.esc="editingTitle = false"
              @blur="commitTitle"
            >
            <button v-if="!editingTitle" type="button" class="icon-btn no-print" title="Editar título" @click="startEditTitle">
              <i class="fa-solid fa-pen text-[13px]" aria-hidden="true" />
            </button>
          </div>
          <p class="m-0 mt-1 text-ink-soft" :class="narrow ? 'text-[12.5px]' : 'text-[13.5px]'">{{ description }}</p>
          <p v-if="session.reportOverride" class="no-print m-0 mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
            <span v-if="savedReport?.published" class="tag-chip tag-chip-sm"><i class="fa-solid fa-share-from-square" aria-hidden="true" /> Publicado en {{ savedReport.published.section }}</span>
            <button type="button" class="btn py-1 text-[12.5px]" @click="$emit('edit-report', savedReport)">
              <i class="fa-solid fa-comments" aria-hidden="true" /> Editar en una conversación nueva
            </button>
          </p>
        </div>
        <div v-if="sales" class="no-print" :class="narrow ? 'w-full' : 'w-[210px]'">
          <DxSelectBox
            v-model:value="prefs.months"
            :items="PERIODS"
            value-expr="value"
            display-expr="text"
            :input-attr="{ 'aria-label': 'Periodo' }"
          />
        </div>
      </header>

      <div class="no-print flex flex-wrap items-end gap-x-2 border-b border-line" :class="narrow ? 'px-2' : 'px-6'">
        <div class="flex flex-1 gap-1" :class="narrow ? 'scroll-thin overflow-x-auto' : 'min-w-max'" role="tablist" aria-label="Vistas del resultado">
          <button
            v-for="t in tabs"
            :id="`tab-${t.id}`"
            :key="t.id"
            type="button"
            role="tab"
            :aria-selected="tab === t.id"
            :aria-controls="`panel-${t.id}`"
            class="-mb-px flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-0 border-b-[3px] bg-transparent px-3 py-2.5 text-[14px]"
            :class="tab === t.id ? 'border-brandlight font-semibold text-brandblue' : 'border-transparent text-ink-soft hover:text-brandblue'"
            @click="tab = t.id"
          >
            <i class="fa-solid" :class="t.icon" aria-hidden="true" /> {{ t.label }}
          </button>
        </div>
        <div class="flex gap-2 py-2" :class="narrow ? 'w-full justify-end' : 'flex-wrap'">
          <KebabMenu
            text="Acciones"
            icon="fa-solid fa-bolt"
            primary
            :compact-text="narrow"
            label="Acciones sobre el reporte"
            :items="reportActions"
            @select="(mode) => $emit('report-action', mode, actionContext())"
          />
          <button
            v-for="a in ACTIONS"
            :key="a.id"
            type="button"
            class="btn"
            :class="[a.primary ? 'btn-primary' : '', narrow ? 'h-9 w-9 justify-center p-0' : '']"
            :title="a.label"
            @click="run(a.id)"
          >
            <i :class="a.icon" aria-hidden="true" />
            <span :class="narrow ? 'sr-only' : ''">{{ a.label }}</span>
          </button>
        </div>
      </div>

      <div ref="body" class="print-full bg-[#f8fbfd]" :class="narrow ? 'flex-none p-3' : 'scroll-thin flex-1 overflow-y-auto p-5'">
        <div v-if="width === null" class="h-40" />
        <div v-else-if="tab === 'results' && !sales" id="panel-results" role="tabpanel" aria-labelledby="tab-results" class="flex flex-col gap-4">
          <!-- La respuesta del chat no se exporta: a veces es una pregunta o un comentario. -->
          <article v-if="result.answer" class="no-print card flex gap-3 p-4">
            <i class="fa-solid fa-comment-dots mt-0.5 text-brandlight" aria-hidden="true" />
            <p class="m-0 text-[14px] leading-relaxed text-ink">{{ result.answer }}</p>
          </article>
          <!-- Sin gráfica pedida: primero los datos en crudo y la propuesta de llevarlos a gráfica. -->
          <template v-if="display.table">
            <article v-if="display.suggestion && !display.explicit" class="no-print card flex flex-wrap items-center gap-3 border-brandlight bg-[#f2f9fd] p-4">
              <i class="fa-solid fa-chart-column text-[18px] text-brandlight" aria-hidden="true" />
              <p class="m-0 min-w-[200px] flex-1 text-[13.5px] text-ink">
                ¿Lo llevamos a una gráfica? Sugerencia: <b>{{ chartTypeLabel(display.suggestion.type) }}</b>{{ suggestionTitle ? ` · ${suggestionTitle}` : '' }}.
              </p>
              <button type="button" class="btn btn-primary" @click="session.setChartChoice({ type: display.suggestion.type })">
                <i class="fa-solid fa-chart-column" aria-hidden="true" /> Ver en {{ chartTypeLabel(display.suggestion.type).toLowerCase() }}
              </button>
              <ChartPicker :spec="display.suggestion" :value="TABLE_TYPE" allow-table type-only :compact="narrow" @change="(c) => c.type && c.type !== TABLE_TYPE && session.setChartChoice(c)" />
            </article>
            <article class="card min-w-0 p-4">
              <div class="mb-3 flex flex-wrap items-start gap-2">
                <h3 class="section-title m-0 flex-1 pt-1.5">Datos</h3>
                <!-- «Solo tabla»: la gráfica queda a un clic, sin la propuesta destacada. -->
                <ChartPicker v-if="display.explicit && display.suggestion" class="no-print" :spec="display.suggestion" :value="TABLE_TYPE" allow-table type-only :compact="narrow" @change="(c) => c.type && c.type !== TABLE_TYPE && session.setChartChoice(c)" />
              </div>
              <ResultGrid :columns="result.columns" :rows="result.rows" :total-rows="result.totalRows" :truncated="result.truncated" />
            </article>
          </template>
          <article v-else class="card min-w-0 p-4">
            <div class="mb-3 flex flex-wrap items-start gap-2">
              <h3 class="section-title m-0 flex-1 pt-1.5">{{ chartTitle }}</h3>
              <ChartPicker class="no-print" :spec="chart" :compact="narrow" allow-table @change="(c) => session.setChartChoice(c)" />
            </div>
            <p v-if="result.askChart && !result.chartType" class="no-print m-0 mb-2 text-[12.5px] text-ink-soft">
              <i class="fa-solid fa-circle-question mr-1 text-brandlight" aria-hidden="true" /> El asistente propuso esta gráfica; elige otro tipo si lo prefieres.
            </p>
            <GenericChart :spec="chart" :columns="result.columns" :rows="result.rows" />
          </article>
          <article v-if="genericInsights.length" class="card p-5">
            <h3 class="section-title mb-4 flex items-center gap-2">
              <i class="fa-solid fa-lightbulb text-brandlight" aria-hidden="true" /> Insights y recomendaciones
            </h3>
            <InsightsList :insights="genericInsights" :columns="wider ? 2 : 1" />
          </article>
        </div>
        <div v-else-if="tab === 'results'" id="panel-results" role="tabpanel" aria-labelledby="tab-results" class="flex flex-col gap-4">
          <div class="grid" :class="[wide ? 'grid-cols-4' : 'grid-cols-2', narrow ? 'gap-2' : 'gap-4']">
            <KpiCard v-for="k in report.kpis" :key="k.id" :kpi="k" :compact="narrow" />
          </div>
          <div class="grid gap-4" :class="wide ? 'grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]' : 'grid-cols-1'">
            <article class="card min-w-0 p-4">
              <h3 class="section-title mb-2">Ventas por sucursal</h3>
              <BranchBarChart :report="report" />
            </article>
            <article class="card min-w-0 p-4">
              <h3 class="section-title mb-2">Evolución mensual de ventas</h3>
              <MonthlyTrendChart :report="report" />
            </article>
          </div>
          <div class="grid gap-4" :class="wider ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]' : 'grid-cols-1'">
            <article class="card min-w-0 p-4">
              <h3 class="section-title mb-3">Participación de ventas por sucursal</h3>
              <ShareDoughnut :report="report" />
            </article>
            <article class="card min-w-0 p-5">
              <h3 class="section-title mb-4 flex items-center gap-2">
                <i class="fa-solid fa-lightbulb text-brandlight" aria-hidden="true" /> Insights clave
              </h3>
              <InsightsList :insights="insights" :columns="wider ? 2 : (wide ? 2 : 1)" />
            </article>
          </div>
        </div>

        <div v-else-if="tab === 'table'" id="panel-table" role="tabpanel" aria-labelledby="tab-table" class="flex flex-col gap-4">
          <article v-if="sales" class="card min-w-0 p-4">
            <h3 class="section-title mb-3">Resumen por sucursal</h3>
            <DetailTable :report="report" />
          </article>
          <article class="card min-w-0 p-4">
            <h3 v-if="sales" class="section-title mb-3">Detalle</h3>
            <ResultGrid :columns="result.columns" :rows="result.rows" :total-rows="result.totalRows" :truncated="result.truncated" />
          </article>
        </div>

        <div v-else-if="tab === 'sql'" id="panel-sql" role="tabpanel" aria-labelledby="tab-sql">
          <SqlPanel :queries="result.queries" />
        </div>

        <div v-else-if="tab === 'trace' && turn" id="panel-trace" role="tabpanel" aria-labelledby="tab-trace">
          <TracePanel :turn="turn" />
        </div>

        <div v-else-if="tab === 'log' && turn" id="panel-log" role="tabpanel" aria-labelledby="tab-log">
          <LogPanel :turn="turn" :turns="session.chat.turns" />
        </div>

        <div v-else id="panel-insights" role="tabpanel" aria-labelledby="tab-insights">
          <InsightsList :insights="sales ? insights : genericInsights" :columns="wide ? 2 : 1" cards />
        </div>
      </div>
    </template>

    <SaveReportDialog
      :visible="savingReport"
      :title="title"
      :result="result"
      :charted="!sales && Boolean(display.suggestion)"
      :chart-hint="result?.chart ?? null"
      :choice="saveChoice"
      :hint="IS_API ? 'Se guarda en el servidor con el resultado actual.' : 'Se guarda en este navegador con el periodo y las sucursales actuales.'"
      @confirm="saveReport"
      @cancel="savingReport = false"
    />
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { DxSelectBox } from 'devextreme-vue/select-box';
import { saveAs } from 'file-saver';
import { useSessionStore } from '@/stores/session';
import { usePrefsStore } from '@/stores/prefs';
import { useReportsStore } from '@/stores/reports';
import { $notify } from '@/shared/notify';
import { PERIODS, buildInsights, buildMarkdown, buildReport } from '@/shared/salesReport';
import KpiCard from './KpiCard.vue';
import BranchBarChart from './BranchBarChart.vue';
import MonthlyTrendChart from './MonthlyTrendChart.vue';
import ShareDoughnut from './ShareDoughnut.vue';
import DetailTable from './DetailTable.vue';
import InsightsList from './InsightsList.vue';
import ResultGrid from './ResultGrid.vue';
import SqlPanel from './SqlPanel.vue';
import SaveReportDialog from './SaveReportDialog.vue';
import ChartPicker from './ChartPicker.vue';
import KebabMenu from './KebabMenu.vue';
import GenericChart from './GenericChart.vue';
import TracePanel from './TracePanel.vue';
import LogPanel from './LogPanel.vue';
import { DEFAULT_REPORT_TITLE } from '@/mocks/salesByBranch';
import { IS_API } from '@/services/mode';
import { TABLE_TYPE, chartTypeLabel, genericMarkdown, isSalesResult, resultDisplay } from '@/shared/resultView';
import { fmtInt } from '@/shared/salesReport';
import { copyText } from '@/shared/clipboard';

const TABS = [
  { id: 'results', label: 'Resultados', icon: 'fa-chart-column' },
  { id: 'table', label: 'Tabla', icon: 'fa-table' },
  { id: 'sql', label: 'SQL', icon: 'fa-code' },
  { id: 'insights', label: 'Insights', icon: 'fa-lightbulb' },
  { id: 'trace', label: 'Traza', icon: 'fa-route' },
  { id: 'log', label: 'Log', icon: 'fa-terminal' },
];
const ACTIONS = [
  { id: 'save', label: 'Guardar reporte', icon: 'fa-regular fa-bookmark' },
  { id: 'pdf', label: 'Exportar PDF', icon: 'fa-regular fa-file-pdf' },
  { id: 'md', label: 'Generar Markdown', icon: 'fa-brands fa-markdown' },
  { id: 'share', label: 'Compartir', icon: 'fa-solid fa-share-nodes' },
];
const DEFAULT_TITLE = DEFAULT_REPORT_TITLE;
// Con el backend real aún no existen: se muestran deshabilitadas como «próximamente».
const reportActions = [
  { id: 'campaign', text: 'Disparar campaña', icon: 'fa-solid fa-bullhorn' },
  { id: 'segment', text: 'Crear segmento', icon: 'fa-solid fa-users' },
  { id: 'publish', text: 'Publicar en el menú', icon: 'fa-solid fa-share-from-square' },
].map((a) => (IS_API ? { ...a, text: `${a.text} (próximamente)`, disabled: true } : a));
defineEmits(['report-action', 'edit-report']);

const session = useSessionStore();
const prefs = usePrefsStore();
const reports = useReportsStore();

const tab = ref('results');
const editingTitle = ref(false);
const draftTitle = ref('');
const titleInput = ref(null);
const savingReport = ref(false);

// Distribución según el ancho real del panel (cambia al plegar el menú o ampliar el chat).
const body = ref(null);
// null hasta la primera medición: las gráficas no se dibujan con un ancho supuesto.
const width = ref(null);
const wide = computed(() => (width.value ?? 0) >= 820);
const wider = computed(() => (width.value ?? 0) >= 1080);
const narrow = computed(() => width.value !== null && width.value < 600);
const observer = new ResizeObserver(([entry]) => { width.value = entry.contentRect.width; });
watch(body, (el, old) => { if (old) observer.unobserve(old); if (el) observer.observe(el); });
onBeforeUnmount(() => observer.disconnect());

const result = computed(() => session.result);
const savedReport = computed(() => (session.reportOverride ? reports.reports.find((r) => r.id === session.reportOverride.id) ?? null : null));

/** Lo que reciben los diálogos de acción: el reporte tal como se ve (título, periodo, sucursales y datos). */
function actionContext() {
  return {
    title: title.value, months: prefs.months, branches: result.value.branches ?? null,
    columns: result.value.columns, rows: result.value.rows, reportId: session.reportOverride?.id ?? null, chatId: session.savedId,
  };
}
const sales = computed(() => Boolean(result.value) && isSalesResult(result.value.columns));
// Traza y Log son de una respuesta del chat (no de un reporte guardado abierto).
const turn = computed(() => (result.value?.turnId ? session.chat.turns.find((t) => t.id === result.value.turnId) ?? null : null));
const tabs = computed(() => TABS.filter((t) => (t.id !== 'insights' || sales.value || genericInsights.value.length) && ((t.id !== 'trace' && t.id !== 'log') || turn.value)));
/** Tabla primero (sin gráfica pedida o «Solo tabla») o gráfica; con la sugerencia del agente para llevarla a gráfica. */
const display = computed(() => (result.value && !sales.value ? resultDisplay(result.value) : { table: false, suggestion: null, chart: null }));
const chart = computed(() => display.value.chart);
// Al guardar se define la gráfica: si se está viendo la tabla, se parte de la sugerida (se puede elegir «Solo tabla»).
const saveChoice = computed(() => {
  const r = result.value;
  if (!r) return {};
  if (display.value.table) return { type: display.value.suggestion?.type ?? TABLE_TYPE };
  return { type: r.chartType ?? undefined, lines: r.chartLines ?? undefined, avg: r.chartAvg ?? undefined };
});
const specTitle = (c) => (!c ? '' : c.transpose ? 'Indicadores' : c.x === '#' ? c.y.join(', ') : `${c.y.join(', ')} por ${c.x}`);
const suggestionTitle = computed(() => specTitle(display.value.suggestion));
const chartTitle = computed(() => specTitle(chart.value));
const report = computed(() => (sales.value
  ? buildReport(result.value.columns, result.value.rows, { months: prefs.months, branches: result.value.branches })
  : null));
const insights = computed(() => (report.value ? buildInsights(report.value) : []));
// Hallazgos, alertas y recomendaciones del agente para resultados genéricos.
const genericInsights = computed(() => (!sales.value && Array.isArray(result.value?.insights) ? result.value.insights : []));

const shorten = (s, n = 90) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);
const title = computed(() => session.reportTitle ?? result.value?.title
  ?? (sales.value ? DEFAULT_TITLE : shorten(result.value?.question) ?? 'Resultado'));
const description = computed(() => {
  if (!sales.value) {
    const r = result.value;
    const n = r.totalRows ?? r.rows.length;
    return `${fmtInt(n)} ${n === 1 ? 'fila' : 'filas'} · ${r.queries.length} ${r.queries.length === 1 ? 'consulta SQL' : 'consultas SQL'}`;
  }
  const r = report.value;
  const scope = r.branches.length < r.allBranches.length ? `de ${r.branches.join(', ')}` : 'por sucursal';
  return `Resumen de ventas, tendencias y desempeño ${scope} de los últimos ${r.range.months} meses (${r.range.from}–${r.range.to}).`;
});

watch(() => result.value?.id, () => { tab.value = 'results'; editingTitle.value = false; });
watch(() => session.revealTick, () => { tab.value = 'results'; });

function startEditTitle() {
  draftTitle.value = title.value;
  editingTitle.value = true;
  nextTick(() => titleInput.value?.select());
}
function commitTitle() {
  if (!editingTitle.value) return;
  if (draftTitle.value.trim()) session.reportTitle = draftTitle.value.trim();
  editingTitle.value = false;
}

function saveReport({ name, chartType, chartLines }) {
  // La gráfica elegida al guardar queda fija en el reporte y también en la vista actual.
  if (chartType !== undefined || chartLines !== undefined) session.setChartChoice({ type: chartType, lines: chartLines });
  // Con el backend real se guarda una copia del resultado para poder reabrirlo sin volver a consultar.
  const snapshot = { ...result.value, chartType: chartType ?? result.value.chartType ?? null, chartLines: chartLines ?? result.value.chartLines ?? null, chartAvg: null };
  delete snapshot.turnId;
  reports.add({
    title: name, kind: 'analisis', source: 'sales', months: prefs.months,
    branches: result.value.branches, chatId: session.savedId,
    result: IS_API || !sales.value ? snapshot : null,
  });
  savingReport.value = false;
  $notify.success(`Reporte «${name}» guardado.`);
}

/**
 * Gráficas de la pestaña Resultados como imágenes SVG (data URI) para el Markdown, con su leyenda en texto.
 * Si no hay gráfica (vista de tabla), la lista queda vacía y se exporta la tabla.
 */
async function chartImages() {
  if (tab.value !== 'results') {
    tab.value = 'results';
    await nextTick();
    await new Promise((r) => { setTimeout(r, 400); });
  }
  const panel = body.value?.querySelector('#panel-results');
  if (!panel) return [];
  return [...panel.querySelectorAll('article')].flatMap((card) => {
    const svg = [...card.querySelectorAll('svg')].find((s) => s.getBoundingClientRect().width > 120);
    if (!svg) return [];
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const markup = new XMLSerializer().serializeToString(clone);
    const src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(markup)))}`;
    const legend = [...card.querySelectorAll('ul li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return [{ title: card.querySelector('h3')?.textContent.trim() || 'Gráfica', src, legend }];
  });
}

async function markdown() {
  const charts = sales.value || !display.value.table ? await chartImages() : [];
  if (!sales.value) {
    const { title: _t, answer: _a, ...r } = result.value;
    return genericMarkdown({ ...r, title: title.value, charts });
  }
  return buildMarkdown(report.value, { title: title.value, description: description.value, insights: insights.value, queries: result.value.queries, charts });
}
const slug = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function run(action) {
  if (action === 'save') savingReport.value = true;
  else if (action === 'pdf') exportPdf();
  else if (action === 'md') downloadMarkdown();
  else share();
}
async function downloadMarkdown() {
  saveAs(new Blob([await markdown()], { type: 'text/markdown;charset=utf-8' }), `${slug(title.value) || 'reporte'}.md`);
}
function exportPdf() {
  // El diálogo de impresión del navegador permite «Guardar como PDF»; los estilos @media print ocultan menú y chat.
  tab.value = 'results';
  nextTick(() => window.print());
}
async function share() {
  if (await copyText(await markdown())) $notify.success('Resumen del reporte copiado al portapapeles (Markdown).');
  else $notify.error('No se pudo copiar: el navegador bloqueó el portapapeles.');
}
</script>
