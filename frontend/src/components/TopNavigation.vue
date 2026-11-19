<script setup>
import AppIcon from "./AppIcon.vue";
import ThemeToggle from "./ThemeToggle.vue";
import logo from "../assets/semanote-mark.svg";
import { toRef } from "vue";
import { useNavIndicator } from "../useNavIndicator.js";
const props = defineProps({
  page: String,
  activeCount: Number,
  runningCount: Number,
  hasDocument: Boolean,
});
const { nav, indicator, update } = useNavIndicator(toRef(props, "page"));
defineEmits(["navigate", "settings", "exit"]);
const entries = [
  ["dashboard", "总览", "chart"],
  ["library", "文本库", "library"],
  ["workspace", "标注工作台", "annotate"],
  ["jobs", "标注任务", "jobs"],
  ["statistics", "统计概览", "chart"],
  ["logs", "调用日志", "jobs"],
];
</script>
<template>
  <header class="product-navigation navbar">
    <a
      href="/"
      class="product-brand"
      @click.prevent="$emit('navigate', 'dashboard')"
      ><img class="product-monogram" :src="logo" alt=""
      ><span>Semanote<small>TEXT ANNOTATION</small></span></a
    >
    <nav ref="nav" aria-label="主导航" class="top-navigation nav nav-pills sliding-navigation" @scroll="update">
      <span class="nav-indicator" :style="indicator" aria-hidden="true"></span>
      <button
        v-for="[id, name, icon] in entries"
        :key="id"
        class="nav-link"
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
      <ThemeToggle />
      <a href="/developer" aria-label="开发者中心" title="开发者中心"
        ><AppIcon name="code" :size="18" /><span>开发者</span></a
      ><button aria-label="设置" @click="$emit('settings')">
        <AppIcon name="settings" :size="18" /><span>设置</span>
      </button>
      <button class="mobile-exit" aria-label="退出工作区" @click="$emit('exit')"><AppIcon name="exit" /></button>
    </div>
  </header>
  <aside class="side-navigation" aria-label="快捷导航">
    <button v-for="[id, name, icon] in entries" :key="id" :class="{ active: page === id }" :aria-label="name" :title="name" :aria-current="page === id ? 'page' : undefined" :disabled="id === 'workspace' && !hasDocument" @click="$emit('navigate', id)"><AppIcon :name="icon" /></button>
  </aside>
  <aside class="side-navigation side-exit" aria-label="本机服务">
    <button type="button" title="退出工作区" aria-label="退出工作区" @click="$emit('exit')"><AppIcon name="exit" /></button>
  </aside>
</template>
