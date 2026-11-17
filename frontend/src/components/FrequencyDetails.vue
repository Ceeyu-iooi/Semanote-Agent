<script setup>
import { computed, ref, watch } from "vue";
import { entityNames, labelNames } from "../api.js";
import { frequencyGroups } from "../annotationPresentation.js";
import PointerTip from "./PointerTip.vue";
const props = defineProps({
  rows: Array,
  task: String,
  focusedIds: Array,
  sort: String,
});
const emit = defineEmits(["focus"]);
const selectedKey = ref(null), tip = ref(null),
  grouping = ref("term");
watch(
  () => props.task,
  (task) => {
    selectedKey.value = null;
    grouping.value = task === "keywords" ? "term" : "label";
  },
  { immediate: true },
);
// A new source or rail selection takes precedence over an earlier chart choice.
watch(() => props.focusedIds, () => { selectedKey.value = null; });
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
const palette = ['#50bdb5', '#8a83c4', '#e4ad68', '#699dc8', '#d58f9b', '#7daf7a', '#aa94be', '#d2b878'];
const ringGradient = computed(() => {
  let offset = 0;
  return `conic-gradient(${groups.value.map((row, index) => {
    const start = offset; offset += total.value ? row.count / total.value * 100 : 0;
    return `${palette[index % palette.length]} ${start}% ${offset}%`;
  }).join(', ')})`;
});
const selected = computed(
  () =>
    props.task === 'keywords' ? null : groups.value.find((row) => row.key === selectedKey.value) ||
    groups.value.find((row) =>
      row.items.some((item) => props.focusedIds?.includes(item.itemId)),
    ) || (props.task !== 'keywords' ? groups.value[0] : null),
);
function showTip(row, event) { const rect = event.currentTarget.getBoundingClientRect(); tip.value = { x: event.clientX || rect.left, y: event.clientY || rect.bottom, row }; }
const name = (row) =>
  grouping.value === "label"
    ? entityNames[row.text] || labelNames[row.text] || row.text
    : row.text;
</script>
<template>
  <section class="frequency-details" :class="{ 'has-selection': selected }" aria-label="标注频次图">
    <header v-if="task !== 'keywords'" class="frequency-summary">
      <div>
        <strong>{{ groups.length }}</strong
        ><span
          >{{ grouping === "label" ? "个类别" : "个不同词项"
          }}<small>共 {{ total }} 次标注出现</small></span
        >
      </div>
    </header>
    <div v-if="task !== 'keywords'" class="frequency-caption"><span>{{ grouping === "label" ? "类别分布" : "词项频次" }}</span><span>选择查看原文</span></div>
    <div v-if="grouping === 'label' && groups.length" class="frequency-donut-layout">
      <div class="frequency-donut" :style="{ background: ringGradient }"><div><strong>{{ total }}</strong><small>次标注</small></div></div>
      <div class="frequency-donut-legend"><button v-for="(row, index) in groups" :key="row.key" :class="{ selected: selected?.key === row.key }" :aria-pressed="selected?.key === row.key" @click="selectedKey = row.key"><i :style="{ background: palette[index % palette.length] }"></i><span>{{ name(row) }}</span><strong>{{ row.count }}</strong></button></div>
    </div>
    <div v-else class="frequency-rows" :class="{ 'word-cloud': task === 'keywords' }">
      <button
        v-for="(row, index) in groups"
        :key="row.key"
        class="frequency-row"
        :class="{ selected: selected?.key === row.key }"
        :aria-pressed="task === 'keywords' ? undefined : selected?.key === row.key"
        :aria-label="`${name(row)}，${row.count} 次`"
        :style="{ '--bubble-size': `${Math.max(48, 48 + 36 * row.count / maximum)}px`, '--word-size': `${16 + 22 * Math.sqrt(row.count / maximum)}px` }"
        @pointermove="showTip(row, $event)" @pointerleave="tip = null" @focus="showTip(row, $event)" @blur="tip = null"
        @click="task === 'keywords' ? showTip(row, $event) : selectedKey = row.key"
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
        ><b v-if="task !== 'keywords'"
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
    <p v-else-if="task !== 'keywords' && groups.length" class="caption muted frequency-guide">
      选择词项查看原文证据。
    </p>
    <PointerTip :anchor="tip"><strong>{{ tip?.row?.text }}</strong><p>{{ tip?.row?.count }} 次</p></PointerTip>
  </section>
</template>
