<template>
  <DxPopup
    :visible="Boolean(dialog)"
    :title="TITLES[mode] ?? ''"
    :width="popupWidth"
    height="auto"
    :show-close-button="true"
    :hide-on-outside-click="false"
    @hiding="actions.close()"
  >
    <form class="flex flex-col gap-3" @submit.prevent="submit">
      <template v-if="ctx">
        <div class="scroll-thin flex max-h-[min(62vh,640px)] flex-col gap-3 overflow-y-auto pr-1">
        <p class="m-0 rounded-lg bg-canvas px-3 py-2 text-[12.5px] text-ink-soft">
          <i class="fa-solid fa-chart-column mr-1 text-brandlight" aria-hidden="true" />
          Desde el reporte <b class="text-ink">«{{ ctx.title }}»</b> · {{ describeScope(scope) }}
        </p>

        <!-- Crear segmento -->
        <template v-if="mode === 'segment'">
          <Field label="Nombre del segmento" :for-id="ids.name">
            <DxTextBox v-model:value="form.name" :max-length="80" :input-attr="{ id: ids.name }" />
          </Field>
          <Field label="Quiénes entran">
            <DxRadioGroup v-model:value="form.criterion" :items="SEGMENT_CRITERIA" value-expr="id" display-expr="text" />
            <p class="m-0 mt-1 text-[12px] muted">{{ criterionHint }}</p>
          </Field>
          <Field label="Sucursales" :for-id="ids.branches">
            <DxTagBox
              v-model:value="form.branches"
              :items="allBranches"
              :show-selection-controls="true"
              :input-attr="{ id: ids.branches }"
              placeholder="Todas las sucursales"
            />
          </Field>
          <Field label="Periodo" :for-id="ids.months">
            <DxSelectBox v-model:value="form.months" :items="PERIODS" value-expr="value" display-expr="text" :input-attr="{ id: ids.months }" />
          </Field>
          <Field label="Descripción (opcional)" :for-id="ids.desc">
            <DxTextArea v-model:value="form.description" :height="64" :max-length="300" :input-attr="{ id: ids.desc }" />
          </Field>
        </template>

        <!-- Disparar campaña -->
        <template v-else-if="mode === 'campaign'">
          <Field label="Nombre de la campaña" :for-id="ids.name">
            <DxTextBox v-model:value="form.name" :max-length="80" :input-attr="{ id: ids.name }" />
          </Field>
          <Field label="Segmento" :for-id="ids.segment">
            <DxSelectBox v-model:value="form.segmentId" :items="segmentOptions" value-expr="id" display-expr="text" :input-attr="{ id: ids.segment }" />
          </Field>
          <Field v-if="form.segmentId === 'new'" label="Quiénes entran">
            <DxRadioGroup v-model:value="form.criterion" :items="SEGMENT_CRITERIA" value-expr="id" display-expr="text" />
          </Field>
          <Field label="Canal">
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Canal">
              <button
                v-for="c in CHANNELS"
                :key="c.id"
                type="button"
                role="radio"
                :aria-checked="form.channel === c.id"
                class="flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-2 py-2 text-[13px]"
                :class="form.channel === c.id ? 'border-brandblue bg-brandblue text-white' : 'border-line bg-white text-ink hover:border-brandlight'"
                @click="form.channel = c.id"
              >
                <i :class="c.icon" aria-hidden="true" /> {{ c.text }}
              </button>
            </div>
          </Field>
          <Field label="Inicio" :for-id="ids.start">
            <DxDateBox
              v-model:value="form.startAt"
              type="datetime"
              :min="new Date()"
              display-format="dd/MM/yyyy HH:mm"
              :input-attr="{ id: ids.start }"
            />
          </Field>
        </template>

        <!-- Publicar en el menú -->
        <template v-else-if="mode === 'publish'">
          <Field label="Nombre en el menú" :for-id="ids.name">
            <DxTextBox v-model:value="form.name" :max-length="60" :input-attr="{ id: ids.name }" />
          </Field>
          <Field label="Sección del menú" :for-id="ids.section">
            <DxSelectBox v-model:value="form.section" :items="MENU_SECTIONS" :input-attr="{ id: ids.section }" />
          </Field>
          <Field label="Visible para">
            <DxRadioGroup v-model:value="form.audience" :items="AUDIENCES" value-expr="id" display-expr="text" layout="horizontal" />
          </Field>
          <DxCheckBox v-model:value="form.rolling" :text="`Periodo móvil: al abrirlo muestra siempre los últimos ${scope.months} meses`" />
          <p class="m-0 text-[12.5px] text-ink-soft">
            <i class="fa-solid fa-bars mr-1" aria-hidden="true" />
            Aparecerá en <b class="text-ink">Menú › {{ form.section }} › {{ form.name || '…' }}</b>
          </p>
        </template>

        <div v-if="mode !== 'publish'" class="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
          <i class="fa-solid fa-users text-brandlight" aria-hidden="true" />
          <span class="text-[13px] text-ink">
            <b class="num">≈ {{ fmtInt(size) }}</b> cuentas
            <span class="muted">· {{ sizeNote }}</span>
          </span>
        </div>

        <p class="m-0 flex gap-2 rounded-lg bg-[#fff7e0] px-3 py-2 text-[12px] leading-snug text-ink" role="note">
          <i class="fa-solid fa-flask mt-0.5 text-[#9a6a00]" aria-hidden="true" />
          Simulación: en esta maqueta no se envía nada al CEM; queda registrado solo en este navegador.
        </p>
        </div>

        <div class="flex justify-end gap-2 border-t border-line pt-3">
          <button type="button" class="btn" @click="actions.close()">Cancelar</button>
          <button type="submit" class="btn btn-primary" :disabled="!canSubmit">
            <i :class="SUBMIT[mode].icon" aria-hidden="true" /> {{ SUBMIT[mode].text }}
          </button>
        </div>
      </template>
    </form>
  </DxPopup>
</template>

<script setup>
import { computed, defineComponent, h, reactive, watch } from 'vue';
import { DxPopup } from 'devextreme-vue/popup';
import { DxTextBox } from 'devextreme-vue/text-box';
import { DxTextArea } from 'devextreme-vue/text-area';
import { DxSelectBox } from 'devextreme-vue/select-box';
import { DxTagBox } from 'devextreme-vue/tag-box';
import { DxRadioGroup } from 'devextreme-vue/radio-group';
import { DxDateBox } from 'devextreme-vue/date-box';
import { DxCheckBox } from 'devextreme-vue/check-box';
import { confirm } from 'devextreme/ui/dialog';
import { useActionsStore } from '@/stores/actions';
import { useReportsStore } from '@/stores/reports';
import { $notify } from '@/shared/notify';
import { PERIODS, fmtInt } from '@/shared/salesReport';
import {
  AUDIENCES, CHANNELS, MENU_SECTIONS, SEGMENT_CRITERIA, audienceLabel, channelLabel, criterionLabel, describeScope, segmentSize,
} from '@/shared/reportActions';

// Campo con etiqueta, para no repetir el marcado en cada control.
const Field = defineComponent({
  props: { label: String, forId: String },
  setup(props, { slots }) {
    return () => h('div', { class: 'flex flex-col gap-1' }, [
      h(props.forId ? 'label' : 'span', { class: 'text-[13px] text-ink-soft', ...(props.forId ? { for: props.forId } : {}) }, props.label),
      slots.default?.(),
    ]);
  },
});

const TITLES = { segment: 'Crear segmento', campaign: 'Disparar campaña', publish: 'Publicar en el menú' };
const SUBMIT = {
  segment: { text: 'Crear segmento', icon: 'fa-solid fa-users' },
  campaign: { text: 'Disparar campaña', icon: 'fa-solid fa-bullhorn' },
  publish: { text: 'Publicar', icon: 'fa-solid fa-share-from-square' },
};

const actions = useActionsStore();
const reports = useReportsStore();

const uid = Math.random().toString(36).slice(2, 8);
const ids = Object.fromEntries(['name', 'branches', 'months', 'desc', 'segment', 'start', 'section'].map((k) => [k, `rad-${k}-${uid}`]));
const popupWidth = computed(() => Math.min(540, window.innerWidth - 24));

const dialog = computed(() => actions.dialog);
const mode = computed(() => dialog.value?.mode ?? 'segment');
const ctx = computed(() => dialog.value?.context ?? null);

const form = reactive({});
const tomorrowAt9 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; };

watch(dialog, (d) => {
  if (!d) return;
  const c = d.context;
  Object.assign(form, {
    name: d.mode === 'segment' ? `Segmento · ${c.title}` : d.mode === 'campaign' ? `Campaña · ${c.title}` : c.title,
    criterion: 'won',
    branches: c.branches?.length ? [...c.branches] : [],
    months: c.months ?? 6,
    description: '',
    segmentId: c.segmentId ?? 'new',
    channel: 'call',
    startAt: tomorrowAt9(),
    section: 'Reportes',
    audience: 'team',
    rolling: true,
  });
});

const allBranches = computed(() => {
  const c = ctx.value;
  if (!c) return [];
  const i = c.columns.indexOf('Sucursal');
  return [...new Set(c.rows.map((r) => r[i]))];
});
// En «Crear segmento» el usuario puede ajustar sucursales y periodo; en el resto mandan los del reporte.
const scope = computed(() => (mode.value === 'segment'
  ? { months: form.months, branches: form.branches?.length ? form.branches : null }
  : { months: ctx.value?.months ?? 6, branches: ctx.value?.branches ?? null }));

const existingSegment = computed(() => actions.segments.find((s) => s.id === form.segmentId) ?? null);
const segmentOptions = computed(() => [
  { id: 'new', text: 'Nuevo segmento desde este reporte' },
  ...[...actions.segments].reverse().map((s) => ({ id: s.id, text: `${s.name} (≈ ${fmtInt(s.size)} cuentas)` })),
]);

const size = computed(() => {
  if (!ctx.value) return 0;
  if (mode.value === 'campaign' && existingSegment.value) return existingSegment.value.size;
  return segmentSize(ctx.value.columns, ctx.value.rows, { ...scope.value, criterion: form.criterion });
});
const sizeNote = computed(() => (mode.value === 'campaign' && existingSegment.value
  ? `segmento existente «${existingSegment.value.name}»`
  : `${criterionLabel(form.criterion).toLowerCase()}, ${describeScope(scope.value)}`));
const criterionHint = computed(() => SEGMENT_CRITERIA.find((c) => c.id === form.criterion)?.hint ?? '');

const canSubmit = computed(() => Boolean(form.name?.trim()) && (mode.value === 'publish' || size.value > 0)
  && (mode.value !== 'campaign' || (form.startAt && form.channel)));

function createSegment() {
  return actions.addSegment({
    name: form.name.trim(), description: form.description?.trim() ?? '', criterion: form.criterion,
    months: scope.value.months, branches: scope.value.branches, size: size.value, sourceTitle: ctx.value.title,
  });
}

async function submit() {
  if (!canSubmit.value) return;
  const c = ctx.value;
  if (mode.value === 'segment') {
    const s = createSegment();
    $notify.success(`Segmento «${s.name}» creado con ≈ ${fmtInt(s.size)} cuentas (simulado).`);
  } else if (mode.value === 'campaign') {
    const when = new Date(form.startAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    const ok = await confirm(
      `¿Disparar «${form.name.trim()}» a ≈ ${fmtInt(size.value)} cuentas por ${channelLabel(form.channel).toLowerCase()} el ${when}?`,
      'Disparar campaña',
    );
    if (!ok) return;
    const segment = existingSegment.value ?? actions.addSegment({
      name: `Segmento · ${c.title}`, description: `Creado al disparar la campaña «${form.name.trim()}».`,
      criterion: form.criterion, months: scope.value.months, branches: scope.value.branches, size: size.value, sourceTitle: c.title,
    });
    actions.addCampaign({
      name: form.name.trim(), segmentId: segment.id, segmentName: segment.name, channel: form.channel,
      startAt: new Date(form.startAt).getTime(), size: segment.size, sourceTitle: c.title,
    });
    $notify.success(`Campaña «${form.name.trim()}» programada para el ${when} (simulado).`);
  } else {
    let reportId = c.reportId;
    if (!reportId || !reports.reports.some((r) => r.id === reportId)) {
      reportId = reports.add({ title: form.name.trim(), months: c.months, branches: c.branches, chatId: c.chatId ?? null }).id;
    }
    reports.publish(reportId, { label: form.name.trim(), section: form.section, audience: form.audience, rolling: form.rolling });
    $notify.success(`Publicado en Menú › ${form.section} para ${audienceLabel(form.audience).toLowerCase()} (simulado).`);
  }
  actions.close();
}
</script>
