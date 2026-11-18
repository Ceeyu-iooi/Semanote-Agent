<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
const props = defineProps({ anchor: Object, variant: String, minHeight: Number });
const panel = ref(null),
  size = ref({ width: 292, height: 160 }),
  hidden = ref(false);
let observer;
const close = () => {
  hidden.value = true;
};
const escape = (event) => {
  if (event.key === "Escape") close();
};
watch(
  () => props.anchor,
  () => {
    hidden.value = false;
  },
);
watch(panel, element => {
  observer?.disconnect();
  if (!element) return;
  const measure = () => {
    const { width, height } = element.getBoundingClientRect();
    size.value = { width, height };
  };
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(element);
}, { flush: "post" });
const position = computed(() => ({
  left: `${Math.max(8, Math.min((props.anchor?.x || 0) + 14, window.innerWidth - size.value.width - 8))}px`,
  top: `${Math.max(8, Math.min((props.anchor?.y || 0) + 18, window.innerHeight - size.value.height - 8))}px`,
}));
onMounted(() => {
  window.addEventListener("scroll", close, true);
  window.addEventListener("resize", close);
  window.addEventListener("keydown", escape);
});
onUnmounted(() => {
  observer?.disconnect();
  window.removeEventListener("scroll", close, true);
  window.removeEventListener("resize", close);
  window.removeEventListener("keydown", escape);
});
</script>
<template>
  <Teleport to="body"
    ><div
      v-if="anchor && !hidden"
      ref="panel"
      class="pointer-tip"
      role="tooltip"
      :class="variant && `pointer-tip--${variant}`"
      :style="{ ...position, minHeight: minHeight ? `min(${minHeight}px, calc(100dvh - 16px))` : undefined }"
    >
      <slot /></div
  ></Teleport>
</template>
