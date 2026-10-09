<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <p class="m-0 flex-1 text-[13px] text-ink-soft">
        Tokens: entrada <b class="num">{{ n(u.inputTokens) }}</b> · salida <b class="num">{{ n(u.outputTokens) }}</b>
        · caché leída <span class="num">{{ n(u.cacheReadTokens) }}</span> · caché creada <span class="num">{{ n(u.cacheCreationTokens) }}</span>
        · {{ turn.iterations ?? '?' }} iteraciones · {{ secs(turn.elapsedMs) }}
        <template v-if="turn.servedBy"> · servido por {{ turn.servedBy }}</template>
      </p>
      <CopyButton label="Copiar traza" title="Copiar la traza en texto" :text="() => traceText(turn)" />
    </div>
    <p v-if="!calls.length" class="m-0 text-[13px] muted">Sin llamadas a herramientas.</p>
    <details v-for="(c, i) in calls" :key="i" class="rounded-lg border border-line bg-white">
      <summary class="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px]">
        <span class="rounded px-1.5 py-0.5 text-[11.5px] font-semibold" :class="c.isError ? 'bg-[#fdecec] text-bad' : 'bg-[#e8f6ee] text-good'">{{ c.tool }}</span>
        <span class="muted">{{ c.durationMs }} ms</span>
        <span v-if="c.isError" class="text-bad">error</span>
      </summary>
      <div class="border-t border-line px-3 py-2">
        <p class="m-0 mb-1 text-[12px] font-semibold text-ink-soft">Entrada</p>
        <pre class="log-pre">{{ JSON.stringify(c.input, null, 2) }}</pre>
        <p class="m-0 mb-1 mt-2 text-[12px] font-semibold text-ink-soft">Resultado (vista previa)</p>
        <pre class="log-pre">{{ c.resultPreview }}</pre>
      </div>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { traceText } from '@/shared/runLog';
import CopyButton from './CopyButton.vue';

const props = defineProps({ turn: { type: Object, required: true } });

const u = computed(() => props.turn.usage ?? {});
// Turnos guardados antes de esta versión traen solo nombre y duración.
const calls = computed(() => (Array.isArray(props.turn.toolCalls) ? props.turn.toolCalls : []));
const nf = new Intl.NumberFormat('es-MX');
const n = (v) => nf.format(v ?? 0);
const secs = (ms) => `${((ms ?? 0) / 1000).toFixed(1)} s`;
</script>
