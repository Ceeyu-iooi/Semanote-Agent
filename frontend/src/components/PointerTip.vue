<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
const props = defineProps({ anchor: Object });
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
  async () => {
    hidden.value = false;
    await nextTick();
    if (panel.value) {
      const rectangle = panel.value.getBoundingClientRect();
      size.value = { width: rectangle.width, height: rectangle.height };
      observer?.disconnect();
      observer = new ResizeObserver((entries) => {
        const rectangle = entries[0].contentRect;
        size.value = {
          width: rectangle.width + 34,
          height: rectangle.height + 34,
        };
      });
      observer.observe(panel.value);
    }
  },
);
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
      :style="position"
    >
      <slot /></div
  ></Teleport>
</template>
