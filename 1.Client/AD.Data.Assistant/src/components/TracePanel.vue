<template>
  <div class="rounded-lg border border-line bg-canvas p-3">
    <div class="flex flex-wrap items-start gap-2">
      <p class="m-0 flex-1 text-[13px] text-ink-soft">
        Tokens: entrada <span class="num">{{ n(u.inputTokens) }}</span> · salida <span class="num">{{ n(u.outputTokens) }}</span>
        · caché leída <span class="num">{{ n(u.cacheReadTokens) }}</span> · caché creada <span class="num">{{ n(u.cacheCreationTokens) }}</span>
        · {{ n(turn.elapsedMs) }} ms
        <template v-if="turn.servedBy"> · servido por {{ turn.servedBy }}</template>
      </p>
      <CopyButton label="Copiar traza" title="Copiar la traza en texto" :text="() => traceText(turn)" />
    </div>
    <p v-if="!calls.length" class="m-0 mt-2 text-[13px] muted">Sin llamadas a herramientas.</p>
    <ul v-else class="m-0 mt-2 list-none p-0">
      <li v-for="(c, i) in calls" :key="i">
        <details class="disclosure">
          <summary class="flex cursor-pointer items-center gap-2 py-0.5 text-[13px]">
            <span class="caret" aria-hidden="true">▶</span>
            <span class="rounded-full border px-2 py-px font-mono text-[11.5px]" :class="c.isError ? 'border-[#f3c4c4] bg-[#fdecec] text-bad' : 'border-[#c9e9d6] bg-[#e8f6ee] text-good'">{{ c.tool }}</span>
            <span class="text-ink">{{ c.durationMs }} ms</span>
            <span v-if="c.isError" class="text-bad">error</span>
          </summary>
          <div class="mb-2 ml-5 mt-1 flex flex-col gap-1">
            <p class="m-0 text-[12px] font-semibold text-ink-soft">Entrada</p>
            <pre class="log-pre">{{ JSON.stringify(c.input, null, 2) }}</pre>
            <p class="m-0 mt-1 text-[12px] font-semibold text-ink-soft">Resultado (vista previa)</p>
            <pre class="log-pre">{{ c.resultPreview }}</pre>
          </div>
        </details>
      </li>
    </ul>
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
</script>
