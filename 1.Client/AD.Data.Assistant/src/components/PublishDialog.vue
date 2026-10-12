<template>
  <DxPopup
    :visible="Boolean(ctx)"
    :title="current ? 'Enlace público' : 'Publicar con enlace'"
    :width="popupWidth"
    height="auto"
    :show-close-button="true"
    :hide-on-outside-click="false"
    @hiding="actions.close()"
  >
    <form class="flex flex-col gap-3" @submit.prevent="submit">
      <template v-if="ctx">
      <div class="scroll-thin flex max-h-[min(66vh,680px)] flex-col gap-4 overflow-y-auto pr-1">
        <p class="m-0 rounded-lg bg-canvas px-3 py-2 text-[12.5px] text-ink-soft">
          <i class="fa-solid fa-chart-column mr-1 text-brandlight" aria-hidden="true" />
          <b class="text-ink">«{{ ctx.title }}»</b> · {{ fmtInt(rows.length) }} {{ rows.length === 1 ? 'fila' : 'filas' }}
        </p>

        <!-- Enlace ya publicado: copiar, abrir, prolongar o revocar. -->
        <div v-if="current" class="flex flex-col gap-2 rounded-lg border p-3" :class="expired ? 'border-[#f0c36d] bg-[#fff7e0]' : 'border-brandlight bg-[#f2f9fd]'">
          <div class="flex items-center gap-2 text-[13px]">
            <i class="fa-solid" :class="expired ? 'fa-clock text-[#9a6a00]' : 'fa-link text-brandlight'" aria-hidden="true" />
            <span v-if="expired" class="text-ink">Caducó el <b>{{ fmtDate(current.expiresAt) }}</b>. Prolonga la validez para reactivarlo.</span>
            <span v-else class="text-ink">Activo hasta el <b>{{ fmtDate(current.expiresAt) }}</b></span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input class="min-w-0 flex-1 rounded-lg border border-line bg-white px-2 py-1.5 font-mono text-[12px] text-ink" :value="url" readonly aria-label="Enlace público" @focus="(e) => e.target.select()">
            <CopyButton label="Copiar enlace" :text="() => url" />
            <a class="btn py-1 text-[12.5px]" :href="url" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Abrir</a>
          </div>
        </div>

        <Field v-if="!current" label="Título que verá quien abra el enlace" :for-id="ids.title">
          <DxTextBox v-model:value="form.title" :max-length="120" :input-attr="{ id: ids.title }" />
        </Field>

        <Field :label="current ? 'Validez' : 'Validez del enlace'" :for-id="ids.expiry">
          <div class="flex flex-wrap gap-2">
            <div class="w-[220px] max-w-full">
              <DxSelectBox v-model:value="form.expiry" :items="expiryOptions" value-expr="id" display-expr="text" :input-attr="{ id: ids.expiry }" />
            </div>
            <div v-if="form.expiry === 'date'" class="w-[180px] max-w-full">
              <DxDateBox v-model:value="form.expiresOn" type="date" :min="minDate" :max="maxDate" display-format="dd/MM/yyyy" :input-attr="{ 'aria-label': 'Caduca el' }" />
            </div>
          </div>
          <p class="m-0 text-[12px] muted">
            <template v-if="form.expiry === 'keep'">Sin cambios.</template>
            <template v-else-if="expiresAt">Caducará el {{ fmtDate(expiresAt) }}. Después, el enlace muestra «caducado».</template>
          </p>
        </Field>

        <div class="flex flex-col gap-2">
          <span class="text-[13px] text-ink-soft">Filtros para quien abra el enlace</span>
          <p v-if="!candidates.length" class="m-0 text-[12.5px] muted">Estos datos no tienen columnas que sirvan como filtro.</p>
          <ul v-else class="m-0 flex list-none flex-col gap-1.5 p-0">
            <li
              v-for="f in candidates"
              :key="f.column"
              class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2"
              :class="form.enabled[f.column] ? 'border-brandlight bg-white' : 'border-line bg-[#fafcfd]'"
            >
              <DxCheckBox
                :value="Boolean(form.enabled[f.column])"
                :disabled="!form.enabled[f.column] && enabledCount >= MAX_FILTERS"
                :element-attr="{ 'aria-label': `Filtro ${f.column}` }"
                @value-changed="(e) => (form.enabled[f.column] = e.value)"
              />
              <span class="min-w-[120px] flex-1 text-[13px]">
                <i class="fa-solid mr-1 text-brandlight" :class="FILTER_KINDS[f.kind].icon" aria-hidden="true" />
                <b class="text-ink">{{ f.column }}</b>
                <span class="muted"> · {{ kindNote(f) }}</span>
                <span v-if="f.suggested" class="tag-chip tag-chip-sm ml-1">sugerido</span>
              </span>
              <!-- Valor con el que se abre el enlace: el visitante puede cambiarlo. -->
              <div v-if="form.enabled[f.column] && f.kind === 'date'" class="w-[190px] max-w-full">
                <DxSelectBox
                  v-model:value="form.defaults[f.column]"
                  :items="presetsFor(f.column)"
                  value-expr="id"
                  display-expr="text"
                  :input-attr="{ 'aria-label': `Periodo inicial de ${f.column}` }"
                />
              </div>
            </li>
          </ul>
          <p v-if="enabledCount >= MAX_FILTERS" class="m-0 text-[12px] muted">Como máximo {{ MAX_FILTERS }} filtros.</p>
        </div>

        <p class="m-0 flex gap-2 rounded-lg bg-canvas px-3 py-2 text-[12px] leading-snug text-ink-soft" role="note">
          <i class="fa-solid fa-circle-info mt-0.5 text-brandlight" aria-hidden="true" />
          <span>
            Cualquiera con el enlace ve el reporte sin iniciar sesión, hasta que caduque o lo revoques.
            Se publica una copia de los datos {{ current ? 'del día en que se publicó' : 'de hoy' }}: el enlace no vuelve a consultar la base.
            No se publican el SQL ni la conversación.
            <template v-if="truncatedNote"><br><b class="text-ink">{{ truncatedNote }}</b></template>
          </span>
        </p>
      </div>

      <div class="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
        <button v-if="current" type="button" class="btn mr-auto text-bad" :disabled="busy" @click="revoke">
          <i class="fa-solid fa-link-slash" aria-hidden="true" /> Revocar enlace
        </button>
        <button type="button" class="btn" @click="actions.close()">{{ current ? 'Cerrar' : 'Cancelar' }}</button>
        <button type="submit" class="btn btn-primary" :disabled="!canSubmit || busy">
          <i class="fa-solid" :class="busy ? 'fa-spinner fa-spin' : current ? 'fa-floppy-disk' : 'fa-link'" aria-hidden="true" />
          {{ current ? 'Guardar cambios' : 'Publicar y crear enlace' }}
        </button>
      </div>
      </template>
    </form>
  </DxPopup>
</template>

<script setup>
import { computed, defineComponent, h, reactive, ref, watch } from 'vue';
import { DxPopup } from 'devextreme-vue/popup';
import { DxTextBox } from 'devextreme-vue/text-box';
import { DxSelectBox } from 'devextreme-vue/select-box';
import { DxDateBox } from 'devextreme-vue/date-box';
import { DxCheckBox } from 'devextreme-vue/check-box';
import { confirm } from 'devextreme/ui/dialog';
import { useActionsStore } from '@/stores/actions';
import { useReportsStore } from '@/stores/reports';
import { publicUrl, publicationsApi } from '@/services/publicationsApi';
import { $notify } from '@/shared/notify';
import { fmtInt } from '@/shared/salesReport';
import { TABLE_TYPE, resultDisplay } from '@/shared/resultView';
import { FILTER_KINDS, MAX_FILTERS, dateKeys, datePresets, suggestFilters } from '@/shared/publishFilters';
import CopyButton from './CopyButton.vue';

const Field = defineComponent({
  props: { label: String, forId: String },
  setup(props, { slots }) {
    return () => h('div', { class: 'flex flex-col gap-1' }, [
      h(props.forId ? 'label' : 'span', { class: 'text-[13px] text-ink-soft', ...(props.forId ? { for: props.forId } : {}) }, props.label),
      slots.default?.(),
    ]);
  },
});

const DAY = 86_400_000;
const EXPIRY = [
  { id: '7', text: '7 días', days: 7 },
  { id: '30', text: '30 días', days: 30 },
  { id: '90', text: '90 días', days: 90 },
  { id: '365', text: '1 año (máximo)', days: 365 },
  { id: 'date', text: 'Hasta una fecha…' },
];

const actions = useActionsStore();
const reports = useReportsStore();

const uid = Math.random().toString(36).slice(2, 8);
const ids = { title: `pub-title-${uid}`, expiry: `pub-expiry-${uid}` };
const popupWidth = computed(() => Math.min(600, window.innerWidth - 24));
const busy = ref(false);

const ctx = computed(() => (actions.dialog?.mode === 'publish' ? actions.dialog.context : null));
// Reporte guardado al publicar un resultado del chat que aún no lo estaba.
const createdId = ref(null);
const reportId = computed(() => ctx.value?.reportId ?? createdId.value);
const report = computed(() => (reportId.value ? reports.reports.find((r) => r.id === reportId.value) ?? null : null));
/** Publicación con enlace del reporte (las de la maqueta, «en el menú», no tienen token). */
const current = computed(() => (report.value?.published?.token ? report.value.published : null));
const expired = computed(() => Boolean(current.value) && current.value.expiresAt <= Date.now());
const url = computed(() => (current.value ? publicUrl(current.value.token) : ''));

const columns = computed(() => ctx.value?.columns ?? []);
const rows = computed(() => ctx.value?.rows ?? []);
const candidates = computed(() => suggestFilters(columns.value, rows.value));
const presetsFor = (column) => datePresets(dateKeys(columns.value, rows.value, column)).filter((p) => p.id !== 'custom');
const kindNote = (f) => (f.kind === 'select' ? `lista (${f.distinct} valores)` : f.kind === 'range' ? 'rango de valores' : 'periodo');

const form = reactive({ title: '', expiry: '30', expiresOn: null, enabled: {}, defaults: {} });
const enabledCount = computed(() => Object.values(form.enabled).filter(Boolean).length);
const expiryOptions = computed(() => (current.value
  ? [{ id: 'keep', text: expired.value ? 'Sin cambios (caducado)' : `Sin cambios (hasta el ${fmtDate(current.value.expiresAt)})` }, ...EXPIRY]
  : EXPIRY));
const minDate = computed(() => new Date(Date.now() + DAY));
const maxDate = computed(() => new Date(Date.now() + 365 * DAY));

watch(ctx, (c) => {
  if (!c) return;
  createdId.value = null;
  const pub = current.value;
  const saved = new Map((pub?.filters ?? []).map((f) => [f.column, f]));
  form.title = pub?.title ?? c.title;
  // Un enlace caducado se reactiva prolongándolo: se propone 30 días.
  form.expiry = pub && !expired.value ? 'keep' : '30';
  form.expiresOn = null;
  form.enabled = {};
  form.defaults = {};
  for (const f of candidates.value) {
    form.enabled[f.column] = pub ? saved.has(f.column) : f.suggested;
    if (f.kind === 'date') form.defaults[f.column] = saved.get(f.column)?.default?.preset ?? 'all';
  }
}, { immediate: true });

/** Fecha de caducidad elegida (ms) o null si no cambia. Con fecha concreta, caduca al final de ese día. */
const expiresAt = computed(() => {
  if (form.expiry === 'keep') return null;
  if (form.expiry === 'date') {
    if (!form.expiresOn) return null;
    const d = new Date(form.expiresOn);
    d.setHours(23, 59, 0, 0);
    return Math.min(d.getTime(), Date.now() + 365 * DAY);
  }
  return Date.now() + EXPIRY.find((e) => e.id === form.expiry).days * DAY;
});
const canSubmit = computed(() => (current.value
  ? form.expiry === 'keep' || Boolean(expiresAt.value)
  : Boolean(form.title.trim()) && Boolean(expiresAt.value) && rows.value.length > 0));

const truncatedNote = computed(() => {
  const total = ctx.value?.totalRows ?? rows.value.length;
  return total > rows.value.length ? `El reporte tiene ${fmtInt(total)} filas y se publican ${fmtInt(rows.value.length)}; los filtros trabajan sobre esas filas.` : '';
});

const fmtDate = (ms) => new Date(ms).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

function chosenFilters() {
  return candidates.value.filter((f) => form.enabled[f.column]).map((f) => ({
    column: f.column, kind: f.kind, label: f.label,
    ...(f.kind === 'date' && form.defaults[f.column] !== 'all' ? { default: { preset: form.defaults[f.column] } } : {}),
  }));
}

/** Lo que ve el visitante: datos, gráfica elegida e insights. Sin SQL ni respuesta del chat. */
function snapshot(c) {
  // «Tabla primero» sin gráfica elegida se publica como tabla; el visitante puede pasarla a gráfica.
  const chartType = c.chartType ?? (c.showChart === false && resultDisplay(c).table ? TABLE_TYPE : null);
  return {
    columns: c.columns, rows: c.rows, totalRows: c.totalRows ?? c.rows.length,
    chart: c.chart ?? null, chartType, chartLines: c.chartLines ?? null, insights: c.insights ?? [],
  };
}

async function submit() {
  if (!canSubmit.value || busy.value) return;
  busy.value = true;
  try {
    if (current.value) await saveChanges();
    else await publish();
  } catch (err) {
    $notify.error(`No se pudo publicar: ${err.message}`);
  } finally {
    busy.value = false;
  }
}

async function publish() {
  const c = ctx.value;
  const title = form.title.trim();
  // Un resultado del chat sin guardar se guarda como reporte: así el enlace queda en «Reportes guardados» para gestionarlo.
  let target = report.value;
  if (!target) {
    target = reports.add({ title, months: c.months, branches: c.branches, chatId: c.chatId ?? null, result: { ...snapshot(c), queries: c.queries ?? [], answer: c.answer ?? '' } });
    createdId.value = target.id;
  }
  const filters = chosenFilters();
  const pub = await publicationsApi.create({ reportId: target.id, title, expiresAt: new Date(expiresAt.value).toISOString(), filters, result: snapshot(c) });
  reports.setPublished(target.id, { id: pub.id, token: pub.token, expiresAt: Date.parse(pub.expiresAt), title, filters, at: Date.now() });
  // El diálogo pasa a mostrar el enlace para copiarlo.
  form.expiry = 'keep';
  $notify.success('Enlace creado. Cópialo y compártelo.');
}

async function saveChanges() {
  const pub = current.value;
  const filters = chosenFilters();
  const patch = { filters, ...(expiresAt.value ? { expiresAt: new Date(expiresAt.value).toISOString() } : {}) };
  const res = await publicationsApi.update(pub.id, patch);
  reports.setPublished(report.value.id, { ...pub, filters, expiresAt: Date.parse(res.expiresAt) });
  form.expiry = 'keep';
  $notify.success('Publicación actualizada; el enlace es el mismo.');
}

async function revoke() {
  if (!(await confirm('¿Revocar el enlace? Quien lo tenga dejará de ver el reporte. Si vuelves a publicar se crea un enlace nuevo.', 'Revocar enlace'))) return;
  busy.value = true;
  try {
    await publicationsApi.revoke(current.value.id);
    reports.setPublished(report.value.id, null);
    $notify.info('Enlace revocado.');
    actions.close();
  } catch (err) {
    $notify.error(`No se pudo revocar: ${err.message}`);
  } finally {
    busy.value = false;
  }
}
</script>
