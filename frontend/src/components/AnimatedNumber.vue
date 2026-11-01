<script setup>
import { ref, watch, onUnmounted } from "vue";
const props = defineProps({ value: Number });
const display = ref(0);
let frame;
watch(
  () => props.value,
  (value) => {
    cancelAnimationFrame(frame);
    const target = value || 0;
    if (
      document.documentElement.dataset.motion === "reduced" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      display.value = target;
      return;
    }
    const start = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - start) / 720);
      if (document.documentElement.dataset.motion === "reduced") {
        display.value = target;
        return;
      }
      display.value = Math.round(target * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  },
  { immediate: true },
);
onUnmounted(() => cancelAnimationFrame(frame));
</script>
<template>
  <span class="animated-number" :aria-label="(value || 0).toLocaleString()"
    ><span aria-hidden="true" :key="display">{{
      display.toLocaleString()
    }}</span></span
  >
</template>
