<script setup>
import { ref } from 'vue';
import AppIcon from './AppIcon.vue';
const dark = ref(document.documentElement.dataset.theme === 'dark');
function choose(next, event) {
  if (next === dark.value) return;
  const root = document.documentElement;
  const apply = () => { dark.value = next; root.dataset.theme = next ? 'dark' : 'light'; localStorage.setItem('semanote.theme', root.dataset.theme); };
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.motion === 'reduced') return apply();
  const x = event.clientX || innerWidth / 2, y = event.clientY || 0;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const transition = document.startViewTransition(apply);
  transition.ready.then(() => document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, { duration: 420, easing: 'ease-out', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
}
</script>
<template><div class="theme-switch" role="group" aria-label="界面主题"><button v-for="item in [{dark:false, icon:'sun', label:'浅色主题'}, {dark:true, icon:'moon', label:'深色主题'}]" :key="item.icon" class="theme-option" :class="{ selected: dark === item.dark }" type="button" :aria-label="item.label" :aria-pressed="dark === item.dark" :title="item.label" @click="choose(item.dark, $event)"><AppIcon :name="item.icon" /></button></div></template>
