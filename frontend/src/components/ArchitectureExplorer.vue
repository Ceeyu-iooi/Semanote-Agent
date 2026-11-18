<script setup>
import { ref, onMounted, onUnmounted } from "vue";
const props = defineProps({ view: Object });
const emit = defineEmits(["navigate"]);
const frame = ref(null);
function syncTheme() { const doc = frame.value?.contentDocument; const theme = document.documentElement.dataset.theme || 'light'; if (doc?.documentElement.dataset.theme !== theme) doc?.getElementById('btn-theme')?.click(); }
let observer;
onMounted(() => { observer = new MutationObserver(syncTheme); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); });
onUnmounted(() => observer?.disconnect());
const destinations = {
  vue: "frontend",
  spring: "backend",
  agent: "agent",
  mysql: "database",
};
const names = {
  frontend: "前端框架",
  backend: "后端框架",
  agent: "智能体框架",
  database: "数据库框架",
};
function connect() {
  const document = frame.value?.contentDocument;
  syncTheme();
  if (!document || props.view.id !== "system") return;
  for (const [id, destination] of Object.entries(destinations)) {
    const element =
      document.querySelector(`[data-node-id="${id}"]`) ||
      document.getElementById(id);
    if (element) {
      element.style.cursor = "pointer";
      element.setAttribute("tabindex", "0");
      element.setAttribute("role", "link");
      element.setAttribute("aria-label", `进入${names[destination]}`);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        emit("navigate", destination);
      });
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          emit("navigate", destination);
        }
      });
    }
  }
}
</script>
<template>
  <section class="architecture-explorer">
    <div v-if="view.id !== 'system'" class="architecture-breadcrumb" aria-label="架构层级">
      <button
        :class="{ current: view.id === 'system' }"
        @click="$emit('navigate', 'system')"
      >
        系统总览</button
      ><template v-if="view.id !== 'system'"
        ><span>›</span><strong>{{ view.name }}</strong></template
      ><span class="architecture-hint">{{
        view.id === "system"
          ? "选择框架，进入对应实现"
          : "独立框架 · 可缩放与查看源码"
      }}</span>
    </div>
    <Transition name="architecture-zoom" mode="out-in"
      ><iframe
        ref="frame"
        :key="view.id"
        :src="view.url"
        :title="view.name"
        class="developer-frame"
        @load="connect"
      ></iframe
    ></Transition>
  </section>
</template>
