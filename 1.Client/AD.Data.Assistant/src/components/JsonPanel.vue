<template>
  <div class="rounded-lg border border-line bg-canvas p-3">
    <div class="mb-2 flex flex-wrap gap-1.5">
      <CopyButton label="Copiar JSON" title="Copiar la respuesta completa en JSON" :text="() => text" />
      <button type="button" class="btn py-1 text-[12.5px]" title="Descargar la respuesta en JSON" @click="download">
        <i class="fa-solid fa-download" aria-hidden="true" /> Descargar
      </button>
    </div>
    <pre class="log-pre max-h-[60vh] bg-white">{{ text }}</pre>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { saveAs } from 'file-saver';
import CopyButton from './CopyButton.vue';

const props = defineProps({ turn: { type: Object, required: true } });

/** La respuesta del agente tal como llegó (mismo contrato que el evento «done»), sin el log ni el estado de la vista. */
const payload = computed(() => {
  const t = props.turn;
  return {
    conversationId: t.conversationId ?? undefined, runId: t.runId, status: t.status, model: t.model, effort: t.effort, servedBy: t.servedBy ?? null,
    iterations: t.iterations, elapsedMs: t.elapsedMs, usage: t.usage, question: t.question, answer: t.answer,
    columns: t.columns, rows: t.rows, totalRows: t.totalRows ?? t.rows?.length ?? 0, queries: t.queries,
    chart: t.view?.chart ?? null, display: t.display ?? undefined, insights: t.insights ?? [], toolCalls: t.toolCalls ?? [],
  };
});
const text = computed(() => JSON.stringify(payload.value, null, 2));

function download() {
  saveAs(new Blob([text.value], { type: 'application/json;charset=utf-8' }), 'consulta.json');
}
</script>
