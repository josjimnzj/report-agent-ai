<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <button
      :id="buttonId"
      type="button"
      class="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 py-1 text-[12.5px] text-ink-soft hover:bg-canvas hover:text-brandblue disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="disabled || !models.current"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :aria-controls="panelId"
      title="Modelo y esfuerzo"
      @click="open = !open"
    >
      <i class="fa-solid fa-microchip" aria-hidden="true" />
      <span class="truncate">{{ summary }}</span>
      <i class="fa-solid fa-chevron-up text-[10px]" aria-hidden="true" />
    </button>

    <div
      v-if="open"
      :id="panelId"
      class="scroll-thin absolute bottom-full left-0 z-[1300] mb-2 flex max-h-[min(560px,70vh)] w-[min(316px,calc(100vw-48px))] flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-white p-3 shadow-[0_8px_28px_rgba(15,42,61,.18)]"
      role="dialog"
      aria-label="Modelo y esfuerzo"
    >
      <template v-if="models.catalog">
        <fieldset v-for="g in groups" :key="g.provider" class="m-0 border-0 p-0">
          <legend class="mb-1 p-0 text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">{{ g.label }}</legend>
          <label
            v-for="m in g.models"
            :key="m.id"
            class="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-canvas"
            :class="m.id === models.current.model ? 'bg-[#e6f4fb]' : ''"
          >
            <input
              type="radio"
              name="ada-model"
              class="mt-1 accent-[#074863]"
              :value="m.id"
              :checked="m.id === models.current.model"
              @change="pickModel(m.id)"
            >
            <span class="min-w-0">
              <span class="block text-[13.5px] font-medium text-ink">{{ m.label }}</span>
              <span class="block text-[12px] leading-snug text-ink-soft">{{ m.note }}</span>
            </span>
          </label>
        </fieldset>

        <div>
          <p class="m-0 mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">Esfuerzo</p>
          <div v-if="models.currentInfo?.efforts.length" class="flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label="Esfuerzo">
            <button
              v-for="e in models.currentInfo.efforts"
              :key="e"
              type="button"
              role="radio"
              :aria-checked="e === models.current.effort"
              class="flex-1 cursor-pointer rounded-md border-0 px-1 py-1.5 text-[12.5px]"
              :class="e === models.current.effort ? 'bg-brandblue font-semibold text-white' : 'bg-transparent text-ink-soft hover:text-brandblue'"
              @click="prefs.effort = e"
            >
              {{ EFFORT_LABELS[e] }}
            </button>
          </div>
          <p v-else class="m-0 text-[12.5px] text-ink-soft">{{ models.current.label }} no admite ajuste de esfuerzo.</p>
          <p class="m-0 mt-1.5 text-[11.5px] leading-snug muted">Más esfuerzo: respuestas más cuidadas, pero más lentas y costosas.</p>
        </div>
      </template>
      <p v-else class="m-0 text-[13px] muted">Cargando modelos…</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useModelsStore } from '@/stores/models';
import { usePrefsStore } from '@/stores/prefs';
import { EFFORT_LABELS, PROVIDER_LABELS, effortLabel } from '@/shared/models';

defineProps({ disabled: Boolean });

const models = useModelsStore();
const prefs = usePrefsStore();
const open = ref(false);
const uid = Math.random().toString(36).slice(2, 8);
const buttonId = `model-picker-${uid}`;
const panelId = `model-picker-panel-${uid}`;
const root = ref(null);

// Cierra al hacer clic fuera. Se ignoran nodos ya desmontados (p. ej. los botones de esfuerzo al cambiar de modelo).
function onDocumentClick(e) {
  if (open.value && e.target.isConnected && !root.value?.contains(e.target)) open.value = false;
}
onMounted(() => document.addEventListener('click', onDocumentClick, true));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick, true));

const summary = computed(() => {
  const c = models.current;
  if (!c) return 'Cargando modelos…';
  return c.effort ? `${c.label} · ${effortLabel(c.effort)}` : c.label;
});
const groups = computed(() => {
  const list = models.catalog?.models ?? [];
  return [...new Set(list.map((m) => m.provider))].map((p) => ({
    provider: p, label: PROVIDER_LABELS[p] ?? p, models: list.filter((m) => m.provider === p),
  }));
});

function pickModel(id) {
  prefs.model = id;
}

onMounted(() => models.load());
</script>
