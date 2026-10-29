<script setup>
import { computed, ref } from "vue";
import GitTimeline from "./GitTimeline.vue";
import AppIcon from "./AppIcon.vue";
import ModelLogs from "./ModelLogs.vue";
import ArchitectureExplorer from "./ArchitectureExplorer.vue";
const selected = ref(
  new URLSearchParams(location.search).get("view") || "design",
);
const entries = [
  {
    id: "design",
    name: "设计规范",
    caption: "Foundations & components",
    url: "/reference/design/preview.html",
  },
  {
    id: "system",
    name: "系统架构",
    caption: "System architecture",
    url: "/reference/diagrams/system-architecture.html",
  },
  {
    id: "agent",
    name: "智能体框架",
    caption: "Agent orchestration",
    url: "/reference/diagrams/agent-architecture.html",
  },
  {
    id: "frontend",
    name: "前端框架",
    caption: "Frontend architecture",
    url: "/reference/diagrams/frontend-architecture.html",
  },
  {
    id: "backend",
    name: "后端框架",
    caption: "Backend architecture",
    url: "/reference/diagrams/backend-architecture.html",
  },
  {
    id: "database",
    name: "数据库框架",
    caption: "Data & revisions",
    url: "/reference/diagrams/database-architecture.html",
  },
  { id: "logs", name: "模型调用日志", caption: "Usage & cache" },
  { id: "git", name: "Git 时间轴", caption: "Live commits & changes" },
  {
    id: "workflow",
    name: "GitFlow 规范",
    caption: "Branch lifecycle",
    url: "/reference/diagrams/git-workflow.html",
  },
  {
    id: "changelog",
    name: "变更记录",
    caption: "Changelog",
    url: "/reference/changelog.html",
  },
];
const current = computed(
  () => entries.find((entry) => entry.id === selected.value) || entries[0],
);
function choose(id) {
  if (!entries.some((entry) => entry.id === id)) return;
  selected.value = id;
  history.replaceState(null, "", `/developer?view=${id}`);
}
</script>
<template>
  <div class="developer-shell">
    <header class="product-navigation developer-topbar">
      <a href="/" class="product-brand"
        ><span class="product-monogram">S</span
        ><span>Semanote<small>DEVELOPER STUDIO</small></span></a
      >
      <div class="developer-title">
        <span class="rail-dot"></span>开发者中心
      </div>
      <a href="/" class="developer-return">返回文本工作台 ↗</a>
    </header>
    <nav class="developer-navigation" aria-label="开发者导航">
      <button
        v-for="entry in entries"
        :key="entry.id"
        :class="{ selected: current.id === entry.id }"
        :aria-current="current.id === entry.id ? 'page' : undefined"
        @click="choose(entry.id)"
      >
        {{ entry.name }}
      </button>
    </nav>
    <main class="developer-main">
      <GitTimeline v-if="current.id === 'git'" /><ModelLogs
        v-else-if="current.id === 'logs'"
      /><ArchitectureExplorer
        v-else-if="
          ['system', 'agent', 'frontend', 'backend', 'database'].includes(
            current.id,
          )
        "
        :view="current"
        @navigate="choose"
      /><iframe
        v-else
        :key="current.id"
        :src="current.url"
        :title="current.name"
        class="developer-frame"
      ></iframe>
    </main>
  </div>
</template>
