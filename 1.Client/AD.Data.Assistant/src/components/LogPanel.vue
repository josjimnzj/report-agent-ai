<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-start gap-2">
      <p class="m-0 min-w-0 flex-1 text-[12.5px] text-ink-soft">
        <b class="text-ink">Turno {{ number }}</b> · {{ turn.modelLabel ?? turn.model ?? 'modelo por defecto' }}{{ turn.effort ? ` · esfuerzo ${turn.effort}` : '' }}
        <template v-if="turn.runId"> · ejecución <span class="num">{{ turn.runId }}</span></template>
        <br><span class="muted">{{ turn.question }}</span>
      </p>
      <div class="flex flex-wrap gap-1.5">
        <CopyButton label="Log" title="Copiar el log de este turno" :text="() => turnLogText(turn, number)" />
        <CopyButton label="Log conversación" title="Copiar el log de toda la conversación" :text="() => conversationLogText(turns)" />
        <CopyButton label="Todo" title="Copiar petición, respuesta, SQL, traza y log de toda la conversación" :text="() => fullReportText(turns)" />
      </div>
    </div>
    <p v-if="!entries.length" class="m-0 text-[13px] muted">Este turno no tiene log (se guardó con una versión anterior o es un reporte cargado).</p>
    <div v-else class="rounded-lg border border-line bg-white font-mono text-[12px] leading-relaxed">
      <template v-for="(e, i) in entries" :key="i">
        <details v-if="entryBody(e) != null" class="border-b border-line last:border-b-0" :open="e.k === 'think' || e.k === 'text'">
          <summary class="cursor-pointer px-3 py-1.5" :class="tone(e)">
            <span class="mr-2 text-ink-soft">{{ fmtT(e.t) }}</span>{{ entryLabel(e) }}
          </summary>
          <pre class="log-pre mx-3 mb-2">{{ entryBody(e) }}</pre>
        </details>
        <div v-else class="border-b border-line px-3 py-1.5 last:border-b-0" :class="tone(e)">
          <span class="mr-2 text-ink-soft">{{ fmtT(e.t) }}</span>{{ entryLabel(e) }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { conversationLogText, entryBody, entryLabel, fmtT, fullReportText, turnLogText } from '@/shared/runLog';
import CopyButton from './CopyButton.vue';

const props = defineProps({
  turn: { type: Object, required: true },
  /** Todos los turnos del chat, para copiar el log de la conversación. */
  turns: { type: Array, required: true },
});

const entries = computed(() => props.turn.log ?? []);
const number = computed(() => props.turns.filter((t) => t.kind !== 'report').indexOf(props.turn) + 1);
const tone = (e) => (e.k === 'error' || (e.k === 'tool_result' && e.isError) ? 'text-bad'
  : e.k === 'done' || e.k === 'tool_result' ? 'text-good'
    : e.k === 'turn_end' || e.k === 'tool_prep' ? 'text-ink-soft' : 'text-ink');
</script>
