<script setup>
import { computed, ref, watch } from "vue";
import { entityNames, taskNames } from "../api.js";
import PointerTip from "./PointerTip.vue";
import AnimatedNumber from "./AnimatedNumber.vue";
const tip = ref(null);
function showTip(event, label, count) {
  const rectangle = event.currentTarget.getBoundingClientRect();
  tip.value = {
    x: event.clientX ?? rectangle.left,
    y: event.clientY ?? rectangle.bottom,
    label,
    count,
  };
}
const props = defineProps({ statistics: Object });
const emit = defineEmits(["refresh"]);
const activeEntity = ref(null),
  activePos = ref(null),
  activeKeyword = ref(null);
watch(
  () => props.statistics,
  (current) => {
    if (
      activeEntity.value &&
      current?.entityLabels?.[activeEntity.value] === undefined
    )
      activeEntity.value = null;
    if (activePos.value) {
      const label = activePos.value[0],
        count = current?.posLabels?.[label];
      activePos.value = count === undefined ? null : [label, count];
    }
    if (activeKeyword.value)
      activeKeyword.value =
        current?.keywords?.find(
          (item) => item.itemText === activeKeyword.value.itemText,
        ) || null;
  },
);
const entityRows = computed(() =>
    Object.entries(props.statistics?.entityLabels || {}).sort(
      (a, b) => b[1] - a[1],
    ),
  ),
  posRows = computed(() =>
    Object.entries(props.statistics?.posLabels || {}).sort(
      (a, b) => b[1] - a[1],
    ),
  );
const totalEntities = computed(() =>
  entityRows.value.reduce((sum, [, count]) => sum + count, 0),
);
const maxEntity = computed(() =>
    Math.max(1, ...entityRows.value.map(([, count]) => count)),
  ),
  maxPos = computed(() =>
    Math.max(1, ...posRows.value.map(([, count]) => count)),
  );
const entityColors = {
  PERSON: "var(--annotation-person)",
  LOCATION: "var(--annotation-location)",
  ORGANIZATION: "var(--annotation-organization)",
  TIME: "var(--annotation-time)",
  MONEY: "var(--annotation-money)",
};
const rings = computed(() => {
  let offset = 0;
  return entityRows.value.map(([label, count]) => {
    const length = (count / Math.max(1, totalEntities.value)) * 440;
    const ring = { label, count, length, offset };
    offset += length;
    return ring;
  });
});
const selectedEntity = computed(() =>
  entityRows.value.find(([label]) => label === activeEntity.value),
);
const percentage = (count, total) =>
  total ? `${((count / total) * 100).toFixed(1)}%` : "0%";
</script>
<template>
  <section class="page-heading">
    <div>
      <p class="eyebrow">FROM WORDS TO INSIGHTS</p>
      <h1>标注统计<span class="heading-period">.</span></h1>
      <p class="muted">当前修订的已保存结果。</p>
    </div>
    <button class="btn btn-outline-primary" @click="emit('refresh')">
      刷新统计
    </button>
  </section>
  <template v-if="statistics"
    ><section class="statistics-hero row g-0" v-reveal>
      <div class="col-lg-6 statistics-lead">
        <p class="eyebrow">SAVED ANNOTATIONS</p>
        <h2>从标注，到全貌。</h2>
        <div class="hero-number">
          <AnimatedNumber :value="statistics.savedCount" /><small
            >份已保存标注</small
          >
        </div>
        <p class="caption">
          共 {{ statistics.documentCount.toLocaleString() }} 份文本 ·
          自动候选和人工草稿不计入
        </p>
        <div
          class="progress"
          role="progressbar"
          aria-label="已保存文本占比"
          :aria-valuenow="statistics.savedCount"
          aria-valuemin="0"
          :aria-valuemax="Math.max(1, statistics.documentCount)"
        >
          <div
            class="progress-bar"
            :style="{
              width: percentage(
                statistics.savedCount,
                statistics.documentCount,
              ),
            }"
          ></div>
        </div>
        <span class="caption"
          >保存覆盖
          {{
            percentage(statistics.savedCount, statistics.documentCount)
          }}</span
        >
      </div>
      <div class="col-lg-6 statistics-highlights">
        <div>
          <span>实体出现</span
          ><strong><AnimatedNumber :value="totalEntities" /></strong
          ><small>按出现位置统计</small>
        </div>
        <div>
          <span>标注条目</span
          ><strong
            ><AnimatedNumber
              :value="
                Object.values(statistics.itemCounts || {}).reduce(
                  (sum, n) => sum + n,
                  0,
                )
              " /></strong
          ><small>十一层保存结果</small>
        </div>
      </div>
    </section>
    <div v-if="!statistics.savedCount" class="empty-state surface">
      <h2>保存第一份标注，发现更多信息。</h2>
      <p class="muted">自动候选和人工草稿不计入统计。</p>
    </div>
    <div v-else class="statistics-grid" @pointerleave="tip = null">
      <article class="surface chart-panel" v-reveal>
        <p class="eyebrow">ENTITY DISTRIBUTION</p>
        <h2>实体构成</h2>
        <p class="caption muted chart-selection">
          {{
            selectedEntity
              ? `${entityNames[selectedEntity[0]]} · ${selectedEntity[1]} 次 · ${percentage(selectedEntity[1], totalEntities)}`
              : "悬停图环或选择类别，查看构成"
          }}
        </p>
        <div v-if="!entityRows.length" class="empty-state caption">
          当前保存结果中没有实体。
        </div>
        <div v-else class="donut-layout">
          <svg
            viewBox="0 0 200 200"
            width="180"
            height="180"
            role="group"
            aria-label="实体类别环形图"
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
              :stroke="entityColors[ring.label]"
              :stroke-width="activeEntity === ring.label ? 34 : 28"
              :stroke-dasharray="`${ring.length} ${440 - ring.length}`"
              :stroke-dashoffset="-ring.offset"
              transform="rotate(-90 100 100)"
              tabindex="0"
              role="button"
              :aria-label="`${entityNames[ring.label]} ${ring.count} 次，${percentage(ring.count, totalEntities)}`"
              @pointermove="
                activeEntity = ring.label;
                showTip($event, entityNames[ring.label], ring.count);
              "
              @focus="activeEntity = ring.label"
              @click="activeEntity = ring.label"
            >
              <title>{{ entityNames[ring.label] }}：{{ ring.count }} 次</title>
            </circle>
            <text
              x="100"
              y="99"
              text-anchor="middle"
              fill="var(--color-ink)"
              font-size="28"
              font-weight="600"
            >
              {{ selectedEntity?.[1] ?? totalEntities }}
            </text>
            <text
              x="100"
              y="121"
              text-anchor="middle"
              fill="var(--color-muted)"
              font-size="10"
            >
              {{
                selectedEntity ? entityNames[selectedEntity[0]] : "实体出现总数"
              }}
            </text>
          </svg>
          <div class="donut-legend">
            <button
              v-for="[label, count] in entityRows"
              :key="label"
              class="legend-row"
              :class="{ active: activeEntity === label }"
              @pointermove="
                activeEntity = label;
                showTip($event, entityNames[label], count);
              "
              @focus="activeEntity = label"
              @click="activeEntity = activeEntity === label ? null : label"
            >
              <i :style="{ background: entityColors[label] }"></i
              ><span>{{ entityNames[label] }}</span
              ><strong>{{ count }}</strong>
            </button>
          </div>
        </div>
        <p class="caption muted mt-3 mb-0">按出现位置计数，允许嵌套实体。</p>
      </article>
      <article class="surface chart-panel">
        <p class="eyebrow">LAYER COVERAGE</p>
        <h2>标注层覆盖</h2>
        <button
          v-for="(name, task) in taskNames"
          :key="task"
          class="bar-row"
          :title="`${name}已覆盖 ${statistics.coverage[task]} / ${statistics.documentCount} 份文本`"
        >
          <span>{{ name }}</span
          ><span class="bar-track"
            ><span
              :style="{
                width: percentage(
                  statistics.coverage[task],
                  statistics.documentCount,
                ),
              }"
            ></span></span
          ><strong>{{ statistics.coverage[task] }}</strong>
        </button>
        <p class="caption muted mt-3 mb-0">
          缺层和成功零条目分别记录。覆盖率不表示准确率。
        </p>
      </article>
      <article class="surface chart-panel">
        <p class="eyebrow">PARTS OF SPEECH</p>
        <h2>词性分布</h2>
        <p class="caption muted chart-selection">
          {{
            activePos
              ? `${activePos[0]} · ${activePos[1]} 次`
              : "选择柱条查看词性数量"
          }}
        </p>
        <p v-if="!posRows.length" class="muted caption">暂无保存的词性结果。</p>
        <button
          v-for="[label, count] in posRows"
          :key="label"
          class="bar-row"
          :class="{ active: activePos?.[0] === label }"
          @pointermove="
            activePos = [label, count];
            showTip($event, label, count);
          "
          @focus="activePos = [label, count]"
          @click="activePos = [label, count]"
        >
          <span>{{ label }}</span
          ><span class="bar-track"
            ><span
              :style="{ width: `${(count / maxPos) * 100}%` }"
            ></span></span
          ><strong>{{ count }}</strong>
        </button>
      </article>
      <article class="surface chart-panel">
        <p class="eyebrow">KEYWORDS IN CONTEXT</p>
        <h2>关键词频次</h2>
        <p v-if="!statistics.keywords.length" class="muted caption">
          暂无保存的关键词。
        </p>
        <ol class="keyword-ranking">
          <li
            v-for="(keyword, index) in statistics.keywords"
            :key="keyword.itemText"
          >
            <button
              class="keyword-chart-button"
              :class="{ active: activeKeyword?.itemText === keyword.itemText }"
              @pointermove="
                activeKeyword = keyword;
                showTip($event, keyword.itemText, keyword.count);
              "
              @focus="activeKeyword = keyword"
              @click="activeKeyword = keyword"
            >
              <small>{{ String(index + 1).padStart(2, "0") }}</small
              ><span>{{ keyword.itemText }}</span
              ><strong>{{ keyword.count }} <small>次</small></strong>
            </button>
          </li>
        </ol>
      </article>
    </div>
    <details class="statistics-layer-details">
      <summary>各标注层的详细数量与覆盖</summary>
      <div class="metric-grid secondary-metrics">
        <article class="metric-card">
          <p class="muted">文本总数</p>
          <strong><AnimatedNumber :value="statistics.documentCount" /></strong
          ><span>{{ statistics.savedCount }} 份已保存标注</span>
        </article>
        <article
          v-for="(name, task) in taskNames"
          v-reveal
          :key="task"
          class="metric-card"
        >
          <p class="muted">{{ name }}条目</p>
          <strong
            ><AnimatedNumber
              :value="statistics.itemCounts[task] || 0" /></strong
          ><span>覆盖 {{ statistics.coverage[task] }} 份文本</span>
        </article>
      </div>
    </details></template
  ><PointerTip :anchor="tip"
    ><strong>{{ tip?.label }}</strong>
    <p>{{ tip?.count }} 次</p></PointerTip
  >
</template>
