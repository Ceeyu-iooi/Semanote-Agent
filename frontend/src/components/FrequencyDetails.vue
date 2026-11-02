<script setup>
import { computed, ref, watch } from "vue";
import { entityNames, labelNames } from "../api.js";
import { frequencyGroups } from "../annotationPresentation.js";
const props = defineProps({
  rows: Array,
  task: String,
  focusedIds: Array,
  sort: String,
});
const emit = defineEmits(["focus"]);
const selectedKey = ref(null),
  grouping = ref("term");
watch(
  () => props.task,
  (task) => {
    selectedKey.value = null;
    grouping.value = ["pos", "sentiment", "intent", "errors"].includes(task)
      ? "label"
      : "term";
  },
  { immediate: true },
);
const groups = computed(() => {
  const rows = frequencyGroups(
    (props.rows || []).map((row) => row.item),
    grouping.value,
  );
  return rows.sort((a, b) =>
    props.sort === "position"
      ? (a.items[0].spans[0]?.start || 0) - (b.items[0].spans[0]?.start || 0)
      : b.count - a.count ||
        (a.items[0].spans[0]?.start || 0) - (b.items[0].spans[0]?.start || 0),
  );
});
const maximum = computed(() =>
  Math.max(1, ...groups.value.map((row) => row.count)),
);
const total = computed(() =>
  groups.value.reduce((sum, row) => sum + row.count, 0),
);
const selected = computed(
  () =>
    groups.value.find((row) => row.key === selectedKey.value) ||
    groups.value.find((row) =>
      row.items.some((item) => props.focusedIds?.includes(item.itemId)),
    ),
);
const name = (row) =>
  grouping.value === "label"
    ? entityNames[row.text] || labelNames[row.text] || row.text
    : row.text;
</script>
<template>
  <section class="frequency-details" :class="{ 'has-selection': selected }" aria-label="标注频次图">
    <header class="frequency-summary">
      <div>
        <strong>{{ groups.length }}</strong
        ><span
          >{{ grouping === "label" ? "个类别" : "个不同词项"
          }}<small>共 {{ total }} 次标注出现</small></span
        >
      </div>
      <div
        v-if="task !== 'segmentation' && task !== 'keywords'"
        class="btn-group btn-group-sm"
        role="group"
        aria-label="频次聚合方式"
      >
        <button
          class="btn btn-outline-primary"
          :class="{ active: grouping === 'term' }"
          :aria-pressed="grouping === 'term'"
          @click="
            grouping = 'term';
            selectedKey = null;
          "
        >
          按词项</button
        ><button
          class="btn btn-outline-primary"
          :class="{ active: grouping === 'label' }"
          :aria-pressed="grouping === 'label'"
          @click="
            grouping = 'label';
            selectedKey = null;
          "
        >
          按类别
        </button>
      </div>
    </header>
    <div class="frequency-caption">
      <span>{{ grouping === "label" ? "类别分布" : "词项频次" }}</span
      ><span>0 <i></i> {{ maximum }} 次</span>
    </div>
    <div class="frequency-rows">
      <button
        v-for="(row, index) in groups"
        :key="row.key"
        class="frequency-row"
        :class="{ selected: selected?.key === row.key }"
        :aria-pressed="selected?.key === row.key"
        :aria-label="`${name(row)}，${row.count} 次`"
        @click="selectedKey = row.key"
      >
        <span class="frequency-name"
          ><small class="frequency-rank">{{
            String(index + 1).padStart(2, "0")
          }}</small
          ><span
            ><strong>{{ name(row) }}</strong
            ><small v-if="grouping === 'term' && row.label">{{
              entityNames[row.label] || labelNames[row.label] || row.label
            }}</small></span
          ></span
        ><span class="frequency-track"
          ><span
            :style="{ width: `${(row.count / maximum) * 100}%` }"
          ></span></span
        ><b
          >{{ row.count
          }}<small
            >{{ total ? ((row.count / total) * 100).toFixed(1) : 0 }}%</small
          ></b
        >
      </button>
    </div>
    <section v-if="selected" class="frequency-evidence">
      <header>
        <strong>{{ name(selected) }}</strong
        ><span class="badge text-bg-light"
          >{{ selected.count }} 次 · 原文证据</span
        >
      </header>
      <p class="caption muted">
        选择具体出现位置，定位到正文。区间使用 Unicode 码点。
      </p>
      <div class="frequency-occurrences">
        <article
          v-for="{ item, span } in [...selected.positions.values()].sort(
            (a, b) => a.span.start - b.span.start,
          )"
          :key="`${item.itemId}-${span.start}`"
        >
          <button
            class="evidence-occurrence"
            @click="emit('focus', { ...item, focusStart: span.start })"
          >
            <span>{{ item.itemText }}</span
            ><small>{{ span.start }}–{{ span.end }} ↗</small>
          </button>
          <p v-if="item.suggestion !== undefined" class="correction-detail">
            建议：{{ item.suggestion || "删除"
            }}<small>{{ item.explanation }}</small>
          </p>
        </article>
      </div>
    </section>
    <p v-else-if="groups.length" class="caption muted frequency-guide">
      点击柱条展开对应的原文证据。
    </p>
  </section>
</template>
