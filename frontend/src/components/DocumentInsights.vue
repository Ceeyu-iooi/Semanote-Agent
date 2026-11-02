<script setup>
import { computed, ref, watch } from "vue";
import { taskNames, entityNames } from "../api.js";
import PointerTip from "./PointerTip.vue";
import RelationshipExplorer from "./RelationshipExplorer.vue";
const props = defineProps({
  layers: { type: Object, default: () => ({}) },
  source: String,
  text: String,
  activeTask: String,
  graphFocus: Object,
});
const emit = defineEmits(["focus"]);
const tip = ref(null),
  chart = ref("bar");
const items = (task) =>
  props.layers[task]?.status === "success"
    ? props.layers[task].result.items
    : [];
const rows = computed(() =>
  Object.entries(taskNames).map(([task, name]) => ({
    task,
    name,
    count: items(task).length,
    status: props.layers[task]?.status || "notRequested",
  })),
);
const maxCount = computed(() =>
  Math.max(1, ...rows.value.map((row) => row.count)),
);
const entities = computed(() =>
  Object.entries(
    items("ner").reduce((result, item) => {
      result[item.label] = (result[item.label] || 0) + 1;
      return result;
    }, {}),
  ),
);
const entityTotal = computed(() =>
  entities.value.reduce((total, [, count]) => total + count, 0),
);
const rings = computed(() => {
  let offset = 0;
  return entities.value.map(([label, count]) => {
    const ring = {
      label,
      count,
      offset,
      length: (count / Math.max(1, entityTotal.value)) * 440,
    };
    offset += ring.length;
    return ring;
  });
});
const radar = computed(() =>
  rows.value.map((row, index) => {
    const angle = (index / rows.value.length) * Math.PI * 2 - Math.PI / 2,
      radius = (72 * row.count) / maxCount.value;
    return {
      ...row,
      x: 110 + Math.cos(angle) * radius,
      y: 110 + Math.sin(angle) * radius,
      lx: 110 + Math.cos(angle) * 94,
      ly: 110 + Math.sin(angle) * 94,
    };
  }),
);
function show(event, label, count) {
  const rect = event.currentTarget.getBoundingClientRect();
  tip.value = {
    x: event.clientX ?? rect.left,
    y: event.clientY ?? rect.bottom,
    height: 110,
    label,
    count,
  };
}
watch(
  () => props.layers,
  () => {
    tip.value = null;
  },
);
</script>
<template>
  <section
    v-if="rows.some((row) => row.status === 'success')"
    class="document-insights"
  >
    <header class="insights-heading">
      <div>
        <p class="eyebrow">THIS DOCUMENT</p>
        <h2>这篇文本的信息图谱</h2>
        <p class="caption muted">{{ source }} · 仅统计当前展示版本</p>
      </div>
      <div class="segmented-control">
        <button
          v-for="[id, name] in [
            ['bar', '柱状图'],
            ['radar', '雷达图'],
            ['donut', '实体环图'],
          ]"
          :key="id"
          :class="{ selected: chart === id }"
          @click="chart = id"
        >
          {{ name }}
        </button>
      </div>
    </header>
    <div class="surface document-charts" @pointerleave="tip = null">
      <div v-if="chart === 'bar'" class="document-bar-chart">
        <button
          v-for="row in rows"
          :key="row.task"
          class="bar-row"
          @pointermove="show($event, row.name, row.count)"
          @focus="show($event, row.name, row.count)"
          @click="emit('focus', { task: row.task, itemId: null })"
        >
          <span>{{ row.name }}</span
          ><span class="bar-track"
            ><span
              :style="{ width: `${(row.count / maxCount) * 100}%` }"
            ></span></span
          ><strong>{{ row.status === "success" ? row.count : "—" }}</strong>
        </button>
      </div>
      <div v-else-if="chart === 'radar'" class="radar-layout">
        <svg
          viewBox="0 0 220 220"
          class="radar-chart"
          aria-label="各标注层条目数雷达图"
        >
          <circle
            v-for="radius in [24, 48, 72]"
            :key="radius"
            cx="110"
            cy="110"
            :r="radius"
            fill="none"
            stroke="var(--color-border)"
          />
          <line
            v-for="point in radar"
            :key="point.task"
            x1="110"
            y1="110"
            :x2="point.lx"
            :y2="point.ly"
            stroke="var(--color-border)"
          />
          <polygon
            :points="radar.map((point) => `${point.x},${point.y}`).join(' ')"
            fill="var(--color-primary-soft)"
            stroke="var(--color-primary)"
            stroke-width="1.5"
          />
          <g v-for="point in radar" :key="point.task">
            <circle
              :cx="point.x"
              :cy="point.y"
              r="5"
              fill="var(--color-primary)"
              tabindex="0"
              @pointermove="show($event, point.name, point.count)"
              @focus="show($event, point.name, point.count)"
              @click="emit('focus', { task: point.task, itemId: null })"
            />
            <text
              :x="point.lx"
              :y="point.ly"
              text-anchor="middle"
              font-size="7"
              fill="var(--color-secondary)"
            >
              {{ point.name }}
            </text>
          </g>
        </svg>
        <p class="caption muted">
          每条轴表示本篇的条目数量，统一以最大数量缩放。该图不表示准确率或质量评分。
        </p>
      </div>
      <div v-else class="donut-layout">
        <svg
          viewBox="0 0 200 200"
          width="200"
          height="200"
          aria-label="本篇实体构成"
        >
          <circle
            cx="100"
            cy="100"
            r="70"
            fill="none"
            stroke="var(--color-page)"
            stroke-width="28"
          />
          <circle
            v-for="ring in rings"
            :key="ring.label"
            cx="100"
            cy="100"
            r="70"
            fill="none"
            :stroke="`var(--annotation-${ring.label.toLowerCase()})`"
            stroke-width="28"
            :stroke-dasharray="`${ring.length} ${440 - ring.length}`"
            :stroke-dashoffset="-ring.offset"
            transform="rotate(-90 100 100)"
            tabindex="0"
            @pointermove="show($event, entityNames[ring.label], ring.count)"
            @focus="show($event, entityNames[ring.label], ring.count)"
          />
          <text
            x="100"
            y="105"
            text-anchor="middle"
            font-size="28"
            fill="var(--color-ink)"
          >
            {{ entityTotal }}
          </text>
        </svg>
        <div class="donut-legend">
          <button
            v-for="[label, count] in entities"
            :key="label"
            class="legend-row"
            @pointermove="show($event, entityNames[label], count)"
            @focus="show($event, entityNames[label], count)"
          >
            <i
              :style="{
                background: `var(--annotation-${label.toLowerCase()})`,
              }"
            ></i
            ><span>{{ entityNames[label] }}</span
            ><b>{{ count }}</b>
          </button>
          <p v-if="!entityTotal" class="caption muted">本篇没有实体。</p>
        </div>
      </div>
    </div>
    <RelationshipExplorer
      :graph-focus="graphFocus"
      :layers="layers"
      :text="text"
      :active-task="activeTask"
      @focus="emit('focus', $event)"
    />
    <PointerTip :anchor="tip"
      ><strong>{{ tip?.label }}</strong>
      <p>
        {{ tip?.count }} {{ chart === "donut" ? "处实体" : "个条目" }}
      </p></PointerTip
    >
  </section>
</template>
