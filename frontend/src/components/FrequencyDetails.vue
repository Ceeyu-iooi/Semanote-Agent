<script setup>
import { computed, ref, watch } from "vue";
import { entityNames, labelNames } from "../api.js";
const props = defineProps({ rows: Array, task: String, focusedIds: Array });
const emit = defineEmits(["focus"]);
const selectedKey = ref(null);
const groups = computed(() => {
  const groups = new Map();
  for (const { item } of props.rows || []) {
    const key = JSON.stringify([item.itemText, item.label]);
    if (!groups.has(key))
      groups.set(key, {
        key,
        text: item.itemText,
        label: item.label,
        count: 0,
        items: [],
        spans: new Set(),
      });
    const group = groups.get(key);
    group.items.push(item);
    for (const span of item.spans || [])
      group.spans.add(`${span.start}:${span.end}`);
    group.count = group.spans.size;
  }
  return [...groups.values()];
});
const maximum = computed(() =>
  Math.max(1, ...groups.value.map((row) => row.count)),
);
const selected = computed(
  () =>
    groups.value.find((row) =>
      row.items.some((item) => props.focusedIds?.includes(item.itemId)),
    ) || groups.value.find((row) => row.key === selectedKey.value),
);
function choose(row) {
  selectedKey.value = row.key;
  emit("focus", row.items[0]);
}
watch(
  () => props.task,
  () => (selectedKey.value = null),
);
</script>
<template>
  <div class="frequency-details">
    <div class="frequency-caption">
      <span>词项 / 类别</span><span>原文出现次数</span>
    </div>
    <div class="frequency-rows">
      <button
        v-for="row in groups"
        :key="row.key"
        class="frequency-row"
        :class="{
          selected: row.items.some((item) => focusedIds?.includes(item.itemId)),
        }"
        :aria-label="`${row.text}，${row.count} 次`"
        @click="choose(row)"
      >
        <span class="frequency-name"
          ><strong>{{ row.text }}</strong
          ><small v-if="row.label">{{
            entityNames[row.label] || labelNames[row.label] || row.label
          }}</small></span
        ><span class="frequency-track"
          ><span
            :style="{ width: `${(row.count / maximum) * 100}%` }"
          ></span></span
        ><b>{{ row.count }}</b>
      </button>
    </div>
    <div v-if="selected" class="frequency-evidence">
      <strong>{{ selected.text }}</strong>
      <div
        v-for="item in selected.items.filter(
          (item) => item.suggestion !== undefined,
        )"
        :key="item.itemId"
        class="correction-detail"
      >
        建议：{{ item.suggestion || "删除"
        }}<small>{{ item.explanation }}</small>
      </div>
      <span class="caption muted">点击位置回到原文</span>
      <div class="d-flex flex-wrap gap-2">
        <template v-for="item in selected.items" :key="item.itemId"
          ><button
            v-for="span in item.spans"
            :key="span.start"
            class="btn btn-outline-primary btn-sm"
            @click="emit('focus', { ...item, focusStart: span.start })"
          >
            {{ span.start }}–{{ span.end }} ↗
          </button></template
        >
      </div>
    </div>
  </div>
</template>
