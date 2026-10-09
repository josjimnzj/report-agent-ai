<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="m-0 text-[13px] text-ink-soft">{{ queries.length }} {{ queries.length === 1 ? 'consulta ejecutada' : 'consultas ejecutadas' }} en SQL Server (solo lectura).</p>
      <button v-if="queries.length > 1" type="button" class="btn" @click="copy(queries.join('\n\n'))">
        <i class="fa-regular fa-copy" aria-hidden="true" /> Copiar todo
      </button>
    </div>
    <section v-for="(q, i) in queries" :key="i" class="card overflow-hidden">
      <header class="flex items-center justify-between border-b border-line bg-canvas px-4 py-2">
        <h3 class="m-0 text-[13px] font-semibold text-ink">Consulta {{ i + 1 }}</h3>
        <button type="button" class="btn" @click="copy(q)">
          <i class="fa-regular fa-copy" aria-hidden="true" /> Copiar SQL
        </button>
      </header>
      <pre class="scroll-thin m-0 overflow-x-auto bg-[#0f2a3d] p-4 text-[12.5px] leading-relaxed text-[#e6f0f7]"><code>{{ q }}</code></pre>
    </section>
  </div>
</template>

<script setup>
import { $notify } from '@/shared/notify';

defineProps({ queries: { type: Array, required: true } });

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    $notify.success('SQL copiado al portapapeles.');
  } catch {
    $notify.error('No se pudo copiar: el navegador bloqueó el portapapeles.');
  }
}
</script>
