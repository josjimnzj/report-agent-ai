<template>
  <DxPopup
    :visible="visible"
    title="Historial y métricas"
    :width="size.width"
    :height="size.height"
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
        <form class="grid gap-2" :class="size.width < 700 ? 'grid-cols-2' : 'grid-cols-[repeat(5,minmax(0,1fr))]'" aria-label="Filtros" @submit.prevent="load(true)">
          <DxSelectBox v-model:value="filters.days" :items="DAYS" value-expr="value" display-expr="text" label="Periodo" label-mode="floating" @value-changed="load(true)" />
          <DxSelectBox v-model:value="filters.rating" :items="RATINGS" value-expr="value" display-expr="text" label="Valoración" label-mode="floating" @value-changed="load(true)" />
          <DxSelectBox v-model:value="filters.model" :items="modelItems" value-expr="value" display-expr="text" label="Modelo" label-mode="floating" @value-changed="load(true)" />
          <DxSelectBox v-model:value="filters.mode" :items="MODES" value-expr="value" display-expr="text" label="Modo" label-mode="floating" @value-changed="load(true)" />
          <DxSelectBox v-model:value="filters.status" :items="statusItems" value-expr="value" display-expr="text" label="Estado" label-mode="floating" @value-changed="load(true)" />
          <div class="col-span-full flex flex-wrap items-center gap-2">
            <div class="min-w-[220px] flex-1">
              <DxTextBox
                v-model:value="filters.q"
                mode="search"
                placeholder="Buscar en pregunta, respuesta o comentario…"
                :input-attr="{ 'aria-label': 'Buscar en el historial' }"
                @enter-key="load(true)"
              />
            </div>
            <button type="submit" class="btn"><i class="fa-solid fa-filter" aria-hidden="true" /> Aplicar</button>
            <button type="button" class="btn" title="Excel / Google Sheets" :disabled="exporting" @click="download('csv')">
              <i class="fa-solid fa-file-csv" aria-hidden="true" /> Exportar CSV
            </button>
            <button type="button" class="btn" title="Incluye filas de muestra, eventos y traza" :disabled="exporting" @click="download('json')">
              <i class="fa-solid fa-file-code" aria-hidden="true" /> Exportar JSON completo
            </button>
          </div>
        </form>

        <p v-if="error" class="m-0 text-[13px] text-bad" role="alert">{{ error }}</p>
        <p v-else-if="loading && !runs.length" class="m-0 text-[13px] muted">Cargando…</p>

        <section v-if="summary" aria-labelledby="hist-summary">
          <h3 id="hist-summary" class="section-title mb-2">Resumen por modelo</h3>
          <p v-if="!summary.byModel.length" class="m-0 text-[13px] muted">Sin ejecuciones con estos filtros.</p>
          <div v-else class="scroll-thin overflow-x-auto rounded-lg border border-line bg-white">
            <table class="w-full border-collapse text-[12.5px]">
              <thead class="bg-canvas text-left text-ink-soft">
                <tr>
                  <th v-for="h in SUMMARY_HEAD" :key="h" class="whitespace-nowrap px-2.5 py-2 font-semibold">{{ h }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(m, i) in summary.byModel" :key="i" class="border-t border-line">
                  <td class="whitespace-nowrap px-2.5 py-1.5">{{ m.model ?? '?' }}</td>
                  <td class="px-2.5 py-1.5">{{ modeLabel(m.mode) }}</td>
                  <td class="num px-2.5 py-1.5">{{ m.runs }}</td>
                  <td class="num px-2.5 py-1.5 text-good">{{ m.good }}</td>
                  <td class="num px-2.5 py-1.5 text-bad">{{ m.bad }}</td>
                  <td class="num px-2.5 py-1.5">{{ pct(m.good, m.bad) }}</td>
                  <td class="num px-2.5 py-1.5">{{ m.errors }}</td>
                  <td class="num px-2.5 py-1.5">{{ m.limitHits }}</td>
                  <td class="num px-2.5 py-1.5">{{ m.avgIterations }}</td>
                  <td class="num px-2.5 py-1.5">{{ nf(m.avgTokens) }}</td>
                  <td class="num px-2.5 py-1.5">{{ m.avgSeconds }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-if="summary" aria-labelledby="hist-runs">
          <h3 id="hist-runs" class="section-title mb-2">Ejecuciones <span class="font-normal muted">({{ runs.length }} de {{ total }})</span></h3>
          <p v-if="!runs.length" class="m-0 text-[13px] muted">Nada que mostrar con estos filtros.</p>
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            <li v-for="r in runs" :key="r.id" class="rounded-lg border border-line bg-white px-3 py-2">
              <div class="flex items-start gap-2">
                <i
                  class="mt-0.5 w-4 text-center"
                  :class="r.rating === 1 ? 'fa-solid fa-thumbs-up text-good' : r.rating === -1 ? 'fa-solid fa-thumbs-down text-bad' : 'fa-regular fa-circle text-ink-muted'"
                  :title="r.rating === 1 ? 'Buena' : r.rating === -1 ? 'Mala' : 'Sin valorar'"
                  aria-hidden="true"
                />
                <div class="min-w-0 flex-1">
                  <p class="m-0 text-[13.5px] font-semibold text-ink">{{ r.question.slice(0, 180) }}</p>
                  <p class="m-0 mt-0.5 text-[12px] muted">
                    {{ date(r.createdAt) }} · {{ r.model ?? '?' }} · {{ modeLabel(r.mode) }} ·
                    <span :class="r.status === 'ok' ? '' : 'text-bad'">{{ r.status }}</span> · {{ r.iterations }} iter. · {{ nf(r.tokens) }} tokens · {{ (r.elapsedMs / 1000).toFixed(1) }} s
                    <template v-if="r.tags?.length"> · {{ r.tags.join(', ') }}</template>
                  </p>
                  <p v-if="r.comment" class="m-0 mt-0.5 text-[12.5px] italic text-ink-soft">“{{ r.comment }}”</p>
                </div>
                <div class="flex shrink-0 gap-1.5">
                  <button type="button" class="btn py-1 text-[12.5px]" :aria-expanded="openId === r.id" @click="toggle(r.id)">
                    <i class="fa-solid" :class="openId === r.id ? 'fa-chevron-up' : 'fa-route'" aria-hidden="true" />
                    <span :class="size.width < 700 ? 'sr-only' : ''">{{ openId === r.id ? 'Ocultar' : 'Traza y log' }}</span>
                  </button>
                  <CopyButton :label="size.width < 700 ? 'JSON' : 'Copiar JSON'" title="Copiar el detalle completo de la ejecución (JSON)" :text="() => detailJson(r.id)" />
                </div>
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
          <button v-if="runs.length < total" type="button" class="btn mt-2" :disabled="loading" @click="load(false)">
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
import { DxSelectBox } from 'devextreme-vue/select-box';
import { DxTextBox } from 'devextreme-vue/text-box';
import { saveAs } from 'file-saver';
import { exportRuns, getFacets, getRun, getRuns, getSummary, telemetryStatus } from '@/services/telemetryApi';
import { turnFromRun } from '@/shared/runLog';
import { $notify } from '@/shared/notify';
import CopyButton from './CopyButton.vue';
import TracePanel from './TracePanel.vue';
import LogPanel from './LogPanel.vue';

defineProps({ visible: Boolean });
defineEmits(['close']);

const DAYS = [{ value: 7, text: '7 días' }, { value: 30, text: '30 días' }, { value: 90, text: '90 días' }, { value: 365, text: '1 año' }];
const RATINGS = [{ value: '', text: 'Todas' }, { value: -1, text: 'Malas' }, { value: 1, text: 'Buenas' }, { value: 0, text: 'Sin valorar' }];
// La base puede compartirse con workflow-agent-api: allí también hay ejecuciones del diseñador de workflows.
const MODES = [{ value: '', text: 'Todos' }, { value: 'query', text: 'Consulta' }, { value: 'workflow', text: 'Workflow' }];
const SUMMARY_HEAD = ['Modelo', 'Modo', 'Ejec.', 'Buenas', 'Malas', 'Acierto', 'Errores', 'Límite', 'Iter.', 'Tokens prom.', 'Seg. prom.'];
const DETAIL_TABS = [{ id: 'answer', label: 'Respuesta y SQL' }, { id: 'trace', label: 'Traza' }, { id: 'log', label: 'Log' }];
const PAGE = 50;

const size = computed(() => ({ width: Math.min(1100, window.innerWidth - 16), height: Math.min(860, window.innerHeight - 16) }));

const status = ref({ enabled: false, lastError: null });
const filters = reactive({ days: 30, rating: '', model: '', mode: '', status: '', q: '' });
const facets = ref(null);
const summary = ref(null);
const runs = ref([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
const exporting = ref(false);

const modelItems = computed(() => [{ value: '', text: 'Todos' }, ...(facets.value?.models ?? []).map((m) => ({ value: m, text: m }))]);
const statusItems = computed(() => [{ value: '', text: 'Todos' }, ...(facets.value?.statuses ?? []).map((s) => ({ value: s, text: s }))]);

const nf = (v) => new Intl.NumberFormat('es-MX').format(Number(v ?? 0));
const pct = (g, b) => (g + b ? `${Math.round((100 * g) / (g + b))}%` : '–');
const modeLabel = (m) => (m === 'workflow' ? 'workflow' : 'consulta');
const date = (s) => new Date(s).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

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
