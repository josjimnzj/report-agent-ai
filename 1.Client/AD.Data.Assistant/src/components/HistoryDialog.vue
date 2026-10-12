<template>
  <DxPopup
    :visible="visible"
    title="Historial y métricas"
    :width="size.width"
    :height="size.height"
    :full-screen="mobile"
    :show-close-button="true"
    :hide-on-outside-click="true"
    @hiding="$emit('close')"
    @shown="load(true)"
  >
    <div class="scroll-thin flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <p v-if="!status.enabled" class="m-0 text-[13.5px] text-ink-soft">
        La telemetría no está configurada en el servidor (variable <code>Telemetry__ConnectionString</code>).
        <template v-if="status.lastError"><br><span class="text-bad">{{ status.lastError }}</span></template>
      </p>

      <template v-else>
        <form class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13.5px] text-ink-soft" aria-label="Filtros" @submit.prevent="load(true)">
          <input
            v-if="mobile"
            v-model="filters.q"
            type="search"
            class="hist-select h-11 w-full"
            placeholder="Buscar en pregunta, respuesta o comentario…"
            aria-label="Buscar en el historial"
            autocomplete="off"
            @input="search"
          >
          <label class="flex items-center gap-1.5" :class="mobile ? 'flex-1' : ''">Periodo
            <select v-model="filters.days" class="hist-select" :class="mobile ? 'h-11 flex-1' : ''" @change="load(true)"><option v-for="o in DAYS" :key="o.value" :value="o.value">{{ o.text }}</option></select>
          </label>
          <button
            v-if="mobile"
            type="button"
            class="btn h-11"
            :aria-expanded="filtersOpen"
            aria-controls="hist-more-filters"
            @click="filtersOpen = !filtersOpen"
          >
            <i class="fa-solid fa-sliders" aria-hidden="true" /> Filtros<template v-if="activeFilters"> ({{ activeFilters }})</template>
          </button>
          <KebabMenu v-if="mobile" text="Exportar" icon="fa-solid fa-download" compact-text label="Exportar el historial" :items="EXPORTS" @select="download" />
          <div v-show="!mobile || filtersOpen" id="hist-more-filters" :class="mobile ? 'mobile-filters' : 'contents'">
            <label class="flex items-center gap-1.5">Valoración
              <select v-model="filters.rating" class="hist-select" @change="load(true)"><option v-for="o in RATINGS" :key="o.value" :value="o.value">{{ o.text }}</option></select>
            </label>
            <label class="flex items-center gap-1.5">Modelo
              <select v-model="filters.model" class="hist-select" :class="mobile ? '' : 'min-w-[150px]'" @change="load(true)"><option v-for="o in modelItems" :key="o.value" :value="o.value">{{ o.text }}</option></select>
            </label>
            <label class="flex items-center gap-1.5">Modo
              <select v-model="filters.mode" class="hist-select" @change="load(true)"><option v-for="o in MODES" :key="o.value" :value="o.value">{{ o.text }}</option></select>
            </label>
            <label class="flex items-center gap-1.5">Estado
              <select v-model="filters.status" class="hist-select" @change="load(true)"><option v-for="o in statusItems" :key="o.value" :value="o.value">{{ o.text }}</option></select>
            </label>
          </div>
          <input
            v-if="!mobile"
            v-model="filters.q"
            type="search"
            class="hist-select min-w-[220px] flex-1"
            placeholder="Buscar en pregunta, respuesta o comentario…"
            aria-label="Buscar en el historial"
            autocomplete="off"
            @input="search"
          >
        </form>
        <div v-if="!mobile" class="flex flex-wrap items-center gap-2">
          <button type="button" class="btn py-1 text-[12.5px]" title="Excel / Google Sheets" :disabled="exporting" @click="download('csv')">Exportar CSV</button>
          <button type="button" class="btn py-1 text-[12.5px]" title="Incluye filas de muestra, eventos y traza" :disabled="exporting" @click="download('json')">Exportar JSON completo</button>
          <span v-if="exporting" class="text-[12.5px] muted" role="status">Preparando…</span>
        </div>
        <p v-else-if="exporting" class="m-0 text-[12.5px] muted" role="status">Preparando la exportación…</p>

        <p v-if="error" class="m-0 text-[13px] text-bad" role="alert">{{ error }}</p>
        <p v-else-if="loading && !runs.length" class="m-0 text-[13px] muted">Cargando…</p>

        <section v-if="summary" aria-labelledby="hist-summary">
          <h3 id="hist-summary" class="m-0 mb-2 text-[15px] font-semibold text-ink">Resumen por modelo</h3>
          <p v-if="!summary.byModel.length" class="m-0 text-[13px] muted">Sin ejecuciones con estos filtros.</p>
          <ul v-else-if="mobile" class="m-0 grid list-none gap-2 p-0">
            <li v-for="(m, i) in summary.byModel" :key="i" class="rounded-lg border border-line bg-white px-3 py-2">
              <p class="m-0 flex items-baseline justify-between gap-2 text-[13.5px]">
                <b class="truncate text-ink">{{ m.model ?? '?' }}</b><span class="shrink-0 text-[12px] muted">{{ modeLabel(m.mode) }} · {{ m.runs }} ejec.</span>
              </p>
              <dl class="m-0 mt-1.5 grid grid-cols-3 gap-x-2 gap-y-1 text-[12px]">
                <div><dt class="muted">👍 / 👎</dt><dd class="num m-0 text-ink">{{ m.good }} / {{ m.bad }}</dd></div>
                <div><dt class="muted">Acierto</dt><dd class="num m-0 font-semibold text-ink">{{ pct(m.good, m.bad) }}</dd></div>
                <div><dt class="muted">Errores · límite</dt><dd class="num m-0 text-ink">{{ m.errors }} · {{ m.limitHits }}</dd></div>
                <div><dt class="muted">Iter.</dt><dd class="num m-0 text-ink">{{ m.avgIterations }}</dd></div>
                <div><dt class="muted">Tokens prom.</dt><dd class="num m-0 text-ink">{{ m.avgTokens }}</dd></div>
                <div><dt class="muted">Seg. prom.</dt><dd class="num m-0 text-ink">{{ m.avgSeconds }}</dd></div>
              </dl>
            </li>
          </ul>
          <ScrollX v-else>
            <table class="hist-table">
              <thead>
                <tr><th v-for="h in SUMMARY_HEAD" :key="h">{{ h }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(m, i) in summary.byModel" :key="i">
                  <td class="whitespace-nowrap">{{ m.model ?? '?' }}</td>
                  <td>{{ modeLabel(m.mode) }}</td>
                  <td class="num">{{ m.runs }}</td>
                  <td class="num">{{ m.good }}</td>
                  <td class="num">{{ m.bad }}</td>
                  <td class="num">{{ pct(m.good, m.bad) }}</td>
                  <td class="num">{{ m.errors }}</td>
                  <td class="num">{{ m.limitHits }}</td>
                  <td class="num">{{ m.avgIterations }}</td>
                  <td class="num">{{ m.avgTokens }}</td>
                  <td class="num">{{ m.avgSeconds }}</td>
                </tr>
              </tbody>
            </table>
          </ScrollX>
        </section>

        <section v-if="summary" aria-labelledby="hist-runs">
          <h3 id="hist-runs" class="m-0 mb-1 text-[15px] font-semibold text-ink">Ejecuciones <span class="font-semibold text-ink-soft">({{ runs.length }} de {{ total }})</span></h3>
          <p v-if="!runs.length" class="m-0 text-[13px] muted">Nada que mostrar con estos filtros.</p>
          <ul class="m-0 list-none p-0">
            <li v-for="r in runs" :key="r.id" class="border-b border-line py-2.5">
              <p class="m-0 flex items-start gap-2 text-[13.5px]">
                <span class="hist-badge" :title="r.rating === 1 ? 'Buena' : r.rating === -1 ? 'Mala' : 'Sin valorar'">{{ r.rating === 1 ? '👍' : r.rating === -1 ? '👎' : '–' }}</span>
                <b class="min-w-0 flex-1 text-ink" :class="mobile ? 'line-clamp-2' : ''">{{ r.question.slice(0, 140) }}</b>
                <KebabMenu v-if="mobile" label="Acciones de la ejecución" :items="runActions(r)" @select="(a) => runAction(a, r)" />
              </p>
              <p v-if="mobile" class="m-0 mt-0.5 pl-[38px] text-[12px] text-ink-soft">
                {{ date(r.createdAt) }} · {{ r.model ?? '?' }} · <span :class="r.status === 'ok' ? '' : 'text-bad'">{{ r.status }}</span> · {{ (r.elapsedMs / 1000).toFixed(1) }} s
                <template v-if="r.comment"><br>“{{ r.comment }}”</template>
              </p>
              <p v-else class="m-0 mt-0.5 text-[12.5px] text-ink-soft">
                {{ date(r.createdAt) }} · {{ r.model ?? '?' }} · {{ modeLabel(r.mode) }} ·
                <span :class="r.status === 'ok' ? '' : 'text-bad'">{{ r.status }}</span> · {{ r.iterations }} iter. · {{ r.tokens }} tokens · {{ (r.elapsedMs / 1000).toFixed(1) }} s<template v-if="r.tags?.length"> · {{ r.tags.join(', ') }}</template>
                <template v-if="r.comment"><br>“{{ r.comment }}”</template>
              </p>
              <div v-if="!mobile" class="mt-1.5 flex flex-wrap gap-1.5">
                <CopyButton label="Copiar detalle (JSON)" title="Copiar el detalle completo de la ejecución (JSON)" :text="() => detailJson(r.id)" />
                <button type="button" class="btn py-1 text-[12.5px]" :aria-expanded="openId === r.id" @click="toggle(r.id)">
                  {{ openId === r.id ? 'Ocultar traza y log' : 'Ver traza y log' }}
                </button>
              </div>

              <div v-if="openId === r.id" class="mt-3 border-t border-line pt-3">
                <p v-if="detailError" class="m-0 text-[13px] text-bad">{{ detailError }}</p>
                <p v-else-if="!detail" class="m-0 text-[13px] muted">Cargando detalle…</p>
                <template v-else>
                  <div class="mb-3 flex gap-1" role="tablist" aria-label="Detalle de la ejecución">
                    <button
                      v-for="t in DETAIL_TABS"
                      :key="t.id"
                      type="button"
                      role="tab"
                      :aria-selected="detailTab === t.id"
                      class="cursor-pointer rounded-md border-0 px-2.5 py-1 text-[12.5px]"
                      :class="detailTab === t.id ? 'bg-brandblue font-semibold text-white' : 'bg-canvas text-ink-soft'"
                      @click="detailTab = t.id"
                    >
                      {{ t.label }}
                    </button>
                  </div>
                  <div v-if="detailTab === 'answer'" class="flex flex-col gap-2 text-[13px]">
                    <p class="m-0 whitespace-pre-wrap text-ink">{{ detail.answer || '(sin respuesta)' }}</p>
                    <pre v-for="(q, i) in detail.queries" :key="i" class="log-pre">{{ q }}</pre>
                  </div>
                  <TracePanel v-else-if="detailTab === 'trace'" :turn="detail" />
                  <LogPanel v-else :turn="detail" :turns="[detail]" />
                </template>
              </div>
            </li>
          </ul>
          <button v-if="runs.length < total" type="button" class="btn mt-3 py-1 text-[12.5px]" :disabled="loading" @click="load(false)">
            {{ loading ? 'Cargando…' : 'Cargar más' }}
          </button>
        </section>
      </template>
    </div>
  </DxPopup>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { DxPopup } from 'devextreme-vue/popup';
import { saveAs } from 'file-saver';
import { exportRuns, getFacets, getRun, getRuns, getSummary, telemetryStatus } from '@/services/telemetryApi';
import { turnFromRun } from '@/shared/runLog';
import { $notify } from '@/shared/notify';
import CopyButton from './CopyButton.vue';
import KebabMenu from './KebabMenu.vue';
import ScrollX from './ScrollX.vue';
import { copyText } from '@/shared/clipboard';
import TracePanel from './TracePanel.vue';
import LogPanel from './LogPanel.vue';

defineProps({ visible: Boolean });
defineEmits(['close']);

const DAYS = [{ value: 7, text: '7 días' }, { value: 30, text: '30 días' }, { value: 90, text: '90 días' }, { value: 365, text: '1 año' }];
const RATINGS = [{ value: '', text: 'todas' }, { value: -1, text: '👎 malas' }, { value: 1, text: '👍 buenas' }, { value: 0, text: 'sin valorar' }];
// La base puede compartirse con workflow-agent-api: allí también hay ejecuciones del diseñador de workflows.
const MODES = [{ value: '', text: 'todos' }, { value: 'query', text: 'consulta' }, { value: 'workflow', text: 'workflow' }];
const SUMMARY_HEAD = ['Modelo', 'Modo', 'Ejec.', '👍', '👎', 'Acierto', 'Errores', 'Límite', 'Iter.', 'Tokens prom.', 'Seg. prom.'];
const DETAIL_TABS = [{ id: 'answer', label: 'Respuesta y SQL' }, { id: 'trace', label: 'Traza' }, { id: 'log', label: 'Log' }];
const PAGE = 50;

const size = computed(() => ({ width: Math.min(1100, window.innerWidth - 16), height: Math.min(860, window.innerHeight - 16) }));
// Móvil: pantalla completa, filtros plegados, resumen en tarjetas y acciones de cada ejecución en un menú ⋯.
const mobile = computed(() => window.innerWidth < 700);
const filtersOpen = ref(false);
const EXPORTS = [
  { id: 'csv', text: 'Exportar CSV (Excel)', icon: 'fa-solid fa-file-csv' },
  { id: 'json', text: 'Exportar JSON completo', icon: 'fa-solid fa-file-code' },
];

const status = ref({ enabled: false, lastError: null });
const filters = reactive({ days: 30, rating: '', model: '', mode: '', status: '', q: '' });
const facets = ref(null);
const summary = ref(null);
const runs = ref([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
const exporting = ref(false);

const activeFilters = computed(() => ['rating', 'model', 'mode', 'status'].filter((k) => filters[k] !== '').length);
const modelItems = computed(() => [{ value: '', text: 'todos' }, ...(facets.value?.models ?? []).map((m) => ({ value: m, text: m }))]);
const statusItems = computed(() => [{ value: '', text: 'todos' }, ...(facets.value?.statuses ?? []).map((s) => ({ value: s, text: s }))]);

const pct = (g, b) => (g + b ? `${Math.round((100 * g) / (g + b))}%` : '–');
const modeLabel = (m) => (m === 'workflow' ? 'workflow' : 'consulta');
const date = (s) => new Date(s).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

// La búsqueda se aplica al escribir (con una pausa breve), como los filtros al cambiar.
let searchTimer = null;
function search() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => load(true), 350);
}

let seq = 0;
async function load(reset) {
  status.value = await telemetryStatus();
  if (!status.value.enabled) return;
  const my = ++seq;
  loading.value = true;
  error.value = '';
  try {
    if (!facets.value) facets.value = await getFacets().catch(() => null);
    if (reset) {
      const [s, page] = await Promise.all([getSummary(filters), getRuns(filters, PAGE, 0)]);
      if (my !== seq) return;
      summary.value = s;
      runs.value = page.items;
      total.value = page.total;
      openId.value = null;
    } else {
      const page = await getRuns(filters, PAGE, runs.value.length);
      if (my !== seq) return;
      runs.value = [...runs.value, ...page.items];
      total.value = page.total;
    }
  } catch (err) {
    if (my === seq) error.value = err.message;
  } finally {
    if (my === seq) loading.value = false;
  }
}

// Detalle de una ejecución: misma vista de Traza y Log que en el chat.
const openId = ref(null);
const detail = ref(null);
const detailError = ref('');
const detailTab = ref('log');
const rawDetails = new Map();

async function fetchDetail(id) {
  if (!rawDetails.has(id)) rawDetails.set(id, await getRun(id));
  return rawDetails.get(id);
}
async function toggle(id) {
  if (openId.value === id) { openId.value = null; return; }
  openId.value = id;
  detail.value = null;
  detailError.value = '';
  try {
    const run = await fetchDetail(id);
    if (openId.value === id) detail.value = turnFromRun(run);
  } catch (err) {
    if (openId.value === id) detailError.value = err.message;
  }
}
const detailJson = async (id) => JSON.stringify(await fetchDetail(id), null, 2);
const runActions = (r) => [
  { id: 'copy', text: 'Copiar detalle (JSON)', icon: 'fa-solid fa-copy' },
  { id: 'trace', text: openId.value === r.id ? 'Ocultar traza y log' : 'Ver traza y log', icon: 'fa-solid fa-route' },
];
async function runAction(action, r) {
  if (action === 'trace') { toggle(r.id); return; }
  try {
    if (await copyText(await detailJson(r.id))) $notify.success('Detalle copiado al portapapeles.');
    else $notify.error('No se pudo copiar: el navegador bloqueó el portapapeles.');
  } catch (err) { $notify.error(err.message); }
}

async function download(format) {
  exporting.value = true;
  try {
    const blob = await exportRuns(filters, format);
    saveAs(blob, `ejecuciones-${new Date().toISOString().slice(0, 16).replace(/\D/g, '')}.${format}`);
  } catch (err) {
    $notify.error(err.message);
  } finally {
    exporting.value = false;
  }
}
</script>
