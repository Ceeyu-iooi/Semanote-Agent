<script setup>
import AppIcon from "./AppIcon.vue";
defineProps({
  page: String,
  activeCount: Number,
  runningCount: Number,
  hasDocument: Boolean,
});
defineEmits(["navigate", "settings"]);
const entries = [
  ["library", "文本库", "library"],
  ["workspace", "标注工作台", "annotate"],
  ["jobs", "标注任务", "jobs"],
  ["statistics", "统计概览", "chart"],
  ["logs", "调用日志", "jobs"],
];
</script>
<template>
  <header class="product-navigation">
    <a
      href="/"
      class="product-brand"
      @click.prevent="$emit('navigate', 'library')"
      ><span class="product-monogram">S</span
      ><span>Semanote<small>TEXT ANNOTATION</small></span></a
    >
    <nav aria-label="主导航" class="top-navigation">
      <button
        v-for="[id, name, icon] in entries"
        :key="id"
        :class="{ active: page === id }"
        :aria-current="page === id ? 'page' : undefined"
        :disabled="id === 'workspace' && !hasDocument"
        @click="$emit('navigate', id)"
      >
        <AppIcon :name="icon" :size="16" /><span>{{ name }}</span
        ><small v-if="id === 'library'">{{ activeCount }}</small
        ><small v-if="id === 'jobs' && runningCount">{{ runningCount }}</small>
      </button>
    </nav>
    <div class="navigation-utilities">
      <a href="/developer" aria-label="开发者中心" title="开发者中心"
        ><AppIcon name="code" :size="18" /><span>开发者</span></a
      ><button aria-label="设置" @click="$emit('settings')">
        <AppIcon name="settings" :size="18" /><span>设置</span>
      </button>
    </div>
  </header>
</template>
