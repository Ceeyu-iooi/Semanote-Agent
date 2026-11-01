<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import GitTimeline from "./GitTimeline.vue";
import ModelLogs from "./ModelLogs.vue";
import ArchitectureExplorer from "./ArchitectureExplorer.vue";
const selected = ref(
  new URLSearchParams(location.search).get("view") || "design",
);
const designFrame = ref(null);
function syncFrameMotion() {
  const root = designFrame.value?.contentDocument?.documentElement;
  if (root)
    root.dataset.motion = document.documentElement.dataset.motion || "full";
}
let motionObserver;
onMounted(() => {
  motionObserver = new MutationObserver(syncFrameMotion);
  motionObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-motion"],
  });
});
onUnmounted(() => motionObserver?.disconnect());
const entries = [
  {
    id: "design",
    name: "设计规范",
    caption: "Foundations & components",
    url: "/reference/design/preview.html?revision=1.4",
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
const navigationEntries = entries.filter(
  (entry) => !["agent", "frontend", "backend", "database"].includes(entry.id),
);
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

      <nav class="developer-navigation nav nav-pills" aria-label="开发者导航">
        <button
          v-for="entry in navigationEntries"
          :key="entry.id"
          :class="{ selected: current.id === entry.id }"
          :aria-current="current.id === entry.id ? 'page' : undefined"
          @click="choose(entry.id)"
        >
          {{ entry.name }}
        </button>
      </nav>
      <a href="/" class="developer-return">返回文本工作台 ↗</a>
    </header>
    <main :key="current.id" class="developer-main page-arrival">
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
        ref="designFrame"
        @load="syncFrameMotion"
        :key="current.id"
        :src="current.url"
        :title="current.name"
        class="developer-frame"
      ></iframe>
    </main>
  </div>
</template>
