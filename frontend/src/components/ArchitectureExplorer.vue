<script setup>
import { ref } from "vue";
const props = defineProps({ view: Object });
const emit = defineEmits(["navigate"]);
const frame = ref(null);
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
    <div class="architecture-breadcrumb" aria-label="架构层级">
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
    <nav
      v-if="view.id === 'system'"
      aria-label="进入子框架"
      class="architecture-destinations"
    >
      <button
        v-for="(name, id) in names"
        :key="id"
        @click="$emit('navigate', id)"
      >
        <span>{{ name }}</span
        ><span>↗</span>
      </button>
    </nav>
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
