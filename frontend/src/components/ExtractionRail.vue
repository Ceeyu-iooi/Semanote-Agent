<script setup>
import { computed, ref, watch } from "vue";
import { taskNames, entityNames, labelNames } from "../api.js";
const props = defineProps({
  tasks: Array,
  layers: Object,
  side: String,
  activeTask: String,
  processing: Boolean,
  source: String,
  selectedTasks: Array,
});
const emit = defineEmits(["focus", "activate"]);
const opened = ref(
  props.tasks?.includes(props.activeTask) ? props.activeTask : props.tasks?.[0],
);
watch(
  () => props.activeTask,
  (task) => {
    if (props.tasks.includes(task)) opened.value = task;
  },
);
function toggle(card) {
  const next = opened.value === card.task ? null : card.task;
  if (next) emit("activate", card.task);
  opened.value = next;
}
const cards = computed(() =>
  props.tasks.map((task, index) => {
    const layer = props.layers?.[task],
      items = layer?.status === "success" ? layer.result?.items || [] : [];
    return {
      task,
      index,
      layer,
      items,
      status: layer?.status || "notRequested",
      requested: props.selectedTasks?.includes(task),
      key: layer?.result?.resultId || layer?.status || "empty",
    };
  }),
);
const titles = { left: "词项与证据", right: "语义与上下文" };
function label(item) {
  return entityNames[item.label] || labelNames[item.label] || item.label || "";
}
function previewText(task, item) {
  if (task === "relations")
    return `${item.subject?.itemText || "主体"} → ${item.object?.itemText || "客体"}`;
  if (task === "events")
    return `${item.label} · ${(item.roles?.time || []).map((entry) => entry.itemText).join("、") || "时间未标明"}`;
  return item.itemText;
}
function choose(card, item = null) {
  emit("focus", { task: card.task, itemId: item?.itemId || null });
}
</script>
<template>
  <aside
    class="extraction-rail accordion"
    :class="`rail-${side}`"
    :aria-label="titles[side]"
  >
    <header>
      <span class="rail-dot"></span>
      <h2>{{ titles[side] }}</h2>
      <small>{{ source }}</small>
    </header>
    <article
      v-for="card in cards"
      :key="card.task"
      class="extraction-card accordion-item"
      :class="[
        {
          selected: activeTask === card.task,
          waiting: processing && card.requested && card.status !== 'success',
        },
        `extraction-${card.task}`,
      ]"
      :style="{ '--card-delay': `${card.index * 45}ms` }"
    >
      <h3 class="accordion-header">
        <button
          class="extraction-card-heading accordion-button"
          :class="{ collapsed: opened !== card.task }"
          :id="`rail-${side}-${card.task}-heading`"
          :aria-expanded="opened === card.task"
          :aria-controls="`rail-${side}-${card.task}`"
          @click="toggle(card)"
        >
          <span class="extraction-kind-mark" :class="card.task">{{
            taskNames[card.task].slice(0, 1)
          }}</span
          ><strong>{{ taskNames[card.task] }}</strong
          ><span class="extraction-count">{{
            card.status === "success"
              ? card.items.length
              : card.status === "failed"
                ? "!"
                : "—"
          }}</span>
        </button>
      </h3>
      <div
        :id="`rail-${side}-${card.task}`"
        class="accordion-collapse collapse"
        :class="{ show: opened === card.task }"
        :inert="opened !== card.task"
        :aria-hidden="opened !== card.task"
        role="region"
        :aria-labelledby="`rail-${side}-${card.task}-heading`"
      >
        <Transition name="extract" mode="out-in"
          ><div :key="card.key" class="extraction-card-content">
            <template v-if="card.status === 'success'"
              ><div v-if="card.items.length" class="extraction-chips">
                <button
                  v-for="item in card.items.slice(0, 60)"
                  :key="item.itemId"
                  class="extraction-chip"
                  :class="`chip-${item.label || card.task}`"
                  @click="choose(card, item)"
                >
                  <span>{{ previewText(card.task, item) }}</span
                  ><small v-if="label(item)">{{ label(item) }}</small>
                </button>
              </div>
              <p v-else class="extraction-empty">
                本篇未发现{{ taskNames[card.task] }}
              </p>
              <button
                v-if="card.items.length"
                class="extraction-more"
                @click="choose(card)"
              >
                {{
                  ["relations", "events"].includes(card.task)
                    ? "打开交互图谱"
                    : ["paragraphs", "semantic"].includes(card.task)
                      ? "在正文查看此层"
                      : `查看频次 · ${card.items.length} 项`
                }}
                <span>↗</span>
              </button></template
            >
            <p v-else-if="card.status === 'failed'" class="extraction-error">
              该层未通过校验，可查看详情后重试。
            </p>
            <div
              v-else-if="processing && card.requested"
              class="extraction-waiting"
            >
              <span></span><span></span><small>等待真实结果</small>
            </div>
            <p v-else class="extraction-empty">
              {{ card.requested ? "等待标注" : "尚未选择此层" }}
            </p>
          </div></Transition
        >
      </div>
    </article>
  </aside>
</template>
