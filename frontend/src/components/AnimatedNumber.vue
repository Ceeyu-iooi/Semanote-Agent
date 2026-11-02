<script setup>
import { computed, ref, watch, onUnmounted } from "vue";
const props = defineProps({ value: Number });
const arrived = ref(false);
const characters = computed(() =>
  Math.max(0, Math.round(props.value || 0))
    .toLocaleString("zh-CN")
    .split(""),
);
const reels = Array.from({ length: 30 }, (_, index) => index % 10);
let frame;
watch(
  () => props.value,
  () => {
    cancelAnimationFrame(frame);
    arrived.value = false;
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        arrived.value = true;
      });
    });
  },
  { immediate: true },
);
onUnmounted(() => cancelAnimationFrame(frame));
</script>
<template>
  <span
    class="animated-number odometer-number"
    :aria-label="(value || 0).toLocaleString()"
    ><template
      v-for="(character, index) in characters"
      :key="characters.length + '-' + index"
      ><span
        v-if="/\d/.test(character)"
        class="odometer-window"
        aria-hidden="true"
        ><span
          class="odometer-reel"
          :style="{
            '--digit-step': 20 + Number(character),
            '--digit-delay': `${index * 45}ms`,
            transform: `translateY(-${arrived ? 20 + Number(character) : 0}em)`,
          }"
          ><span v-for="(digit, row) in reels" :key="row">{{
            digit
          }}</span></span
        ></span
      ><span v-else aria-hidden="true">{{ character }}</span></template
    ></span
  >
</template>
