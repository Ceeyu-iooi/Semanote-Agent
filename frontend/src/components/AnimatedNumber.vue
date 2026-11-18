<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue";
const props = defineProps({ value: Number });
const displayed = ref(0), element = ref(null);
let frame, current = 0, visible = false, observer;
function animate(value) {
    cancelAnimationFrame(frame);
    const target = Math.max(0, value || 0), from = current;
    if (document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches) { displayed.value = current = target; return; }
    const start = performance.now();
    const tick = now => {
      const progress = Math.min(1, (now - start) / 280);
      current = from + (target - from) * (1 - (1 - progress) ** 3);
      displayed.value = Math.round(current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
}
watch(() => props.value, value => { if (visible) animate(value); });
onMounted(() => {
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { visible = true; observer.disconnect(); animate(props.value); }
  }, { threshold: 0.1 });
  observer.observe(element.value);
});
onUnmounted(() => { cancelAnimationFrame(frame); observer?.disconnect(); });
</script>
<template>
  <span ref="element" class="animated-number" :aria-label="(value || 0).toLocaleString('zh-CN')"><span aria-hidden="true">{{ displayed.toLocaleString('zh-CN') }}</span></span>
</template>
