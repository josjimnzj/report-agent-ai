<template>
  <div class="rounded-lg border border-line bg-canvas p-3 text-[13px] leading-relaxed">
    <div class="mb-2 flex flex-wrap items-start gap-2">
      <p class="m-0 min-w-0 flex-1 text-ink">
        <b>Turno {{ number }}</b> · consulta · {{ turn.model ?? turn.modelLabel ?? 'modelo por defecto' }}{{ turn.effort ? ` · esfuerzo ${turn.effort}` : '' }}
        <br><span class="muted">{{ turn.question }}</span>
      </p>
      <div class="flex flex-wrap gap-1.5">
        <CopyButton label="Log" title="Copiar el log de este turno" :text="() => turnLogText(turn, number)" />
        <CopyButton label="Log conversación" title="Copiar el log de toda la conversación" :text="() => conversationLogText(turns)" />
        <CopyButton label="Todo" title="Copiar petición, respuesta, SQL, traza y log de toda la conversación" :text="() => fullReportText(turns)" />
      </div>
    </div>
    <p v-if="!entries.length" class="m-0 muted">Este turno no tiene log (se guardó con una versión anterior o es un reporte cargado).</p>
    <template v-for="(e, i) in views" v-else :key="i">
      <details v-if="e.body != null" class="disclosure" :open="e.open">
        <summary class="cursor-pointer py-0.5" :class="tone(e)">
          <span class="caret" aria-hidden="true">▶</span>
          <span v-if="e.t" class="mx-1 font-mono text-[11.5px] muted">{{ e.t }}</span>
          <span :class="e.tone === 'think' ? 'text-brandlight' : ''">{{ e.label }}</span>
        </summary>
        <pre class="log-pre my-1 ml-4 bg-white">{{ e.body }}</pre>
      </details>
      <div v-else class="py-0.5 pl-1.5" :class="tone(e)">
        <span v-if="e.t" class="mr-1 font-mono text-[11.5px] muted">{{ e.t }}</span>
        <span v-if="e.label" class="font-semibold">{{ e.label }}</span>{{ e.label && e.detail ? ' ' : '' }}{{ e.detail }}
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { conversationLogText, entryView, fmtT, fullReportText, turnLogText } from '@/shared/runLog';
import CopyButton from './CopyButton.vue';

const props = defineProps({
  turn: { type: Object, required: true },
  /** Todos los turnos del chat, para copiar el log de la conversación. */
  turns: { type: Array, required: true },
});

const entries = computed(() => props.turn.log ?? []);
const views = computed(() => entries.value.map((e) => ({ ...entryView(e), t: e.t == null ? '' : fmtT(e.t) })));
const number = computed(() => props.turns.filter((t) => t.kind !== 'report').indexOf(props.turn) + 1);
const tone = (e) => (e.tone === 'err' ? 'text-bad' : e.tone === 'ok' ? 'text-good' : e.tone === 'muted' ? 'text-ink-soft' : 'text-ink');
</script>
