<template>
  <div class="relative">
    <div ref="box" class="scroll-thin overflow-x-auto" @scroll.passive="update">
      <slot />
    </div>
    <!-- Sombra en el borde mientras quede contenido por desplazar (en móvil la barra de scroll no se ve). -->
    <span v-show="left" class="scroll-fade scroll-fade-left" :style="{ left: `${offset}px` }" aria-hidden="true" />
    <span v-show="right" class="scroll-fade scroll-fade-right" aria-hidden="true" />
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

/** offset: ancho de una columna fija a la izquierda, para que la sombra izquierda empiece después de ella. */
defineProps({ offset: { type: Number, default: 0 } });

const box = ref(null);
const left = ref(false);
const right = ref(false);

function update() {
  const el = box.value;
  if (!el) return;
  left.value = el.scrollLeft > 2;
  right.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
}
const observer = new ResizeObserver(update);
onMounted(() => { observer.observe(box.value); if (box.value.firstElementChild) observer.observe(box.value.firstElementChild); nextTick(update); });
onBeforeUnmount(() => observer.disconnect());
</script>
