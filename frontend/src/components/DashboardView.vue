<script setup>
import { computed, ref } from "vue";
import AppIcon from "./AppIcon.vue";
import PointerTip from "./PointerTip.vue";
import AnimatedNumber from "./AnimatedNumber.vue";
import { dashboardModel } from "../dashboardModel.js";

const props = defineProps({ documents: Array, jobs: Array, statistics: Object });
const emit = defineEmits(["navigate", "open", "create"]);
const model = computed(() => dashboardModel(props.documents, props.jobs, props.statistics));
const recent = computed(() => model.value.recent);
const running = computed(() => model.value.running);
const failed = computed(() => model.value.failed);
const rows = computed(() => model.value.rows);
const maximum = computed(() => model.value.maximum);
const entities = computed(() => model.value.entities);
const entityTotal = computed(() => model.value.entityTotal);
const layerCurve = computed(() => rows.value.map((item, i, all) => {
  const x = (i + .5) * 1000 / all.length, y = 100 - item.value / maximum.value * 85;
  if (!i) return `M ${x} ${y}`;
  const previous = all[i - 1], px = (i - .5) * 1000 / all.length, py = 100 - previous.value / maximum.value * 85, mid = (px + x) / 2;
  return `C ${mid} ${py}, ${mid} ${y}, ${x} ${y}`;
}).join(' '));
const tip = ref(null);
function showChartTip(item, event) { const box = event.currentTarget.getBoundingClientRect(); tip.value = { x: event.clientX || box.left, y: event.clientY || box.bottom, item }; }
function date(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(parsed);
}
</script>

<template>
  <div class="dashboard">
    <section class="dashboard-heading">
      <div><p class="dashboard-kicker">工作空间概览</p><h1>开始今天的标注</h1><p>查看文本和标注进展，继续上次的工作。</p></div>
      <div class="dashboard-actions"><button class="dashboard-icon-button" aria-label="搜索文本" title="搜索文本" @click="emit('navigate', 'library')"><AppIcon name="search" /></button><button class="dashboard-secondary" @click="emit('navigate', 'statistics')">查看统计</button><button class="dashboard-accent" @click="emit('create')"><AppIcon name="plus" />新建文本</button></div>
    </section>
    <section class="dashboard-grid" aria-label="工作空间数据">
      <article class="dashboard-balance">
        <div class="balance-top"><div class="balance-label">文本总数 <AppIcon name="file" /></div><strong><AnimatedNumber :value="model.activeCount" /></strong><span class="balance-caption">当前未归档文本</span><div class="balance-actions"><button @click="emit('navigate', 'library')"><AppIcon name="library" />打开文本库</button><button @click="emit('create')"><AppIcon name="plus" />新建文本</button></div></div>
        <div class="balance-details"><div><span>已保存快照</span><strong>{{ model.savedCount }}</strong></div><div><span>未保存快照</span><strong>{{ Math.max(0, model.activeCount - model.savedCount) }}</strong></div></div><p class="balance-foot">统计对应当前文本修订</p>
      </article>
      <article class="dashboard-summary"><div class="summary-block"><div class="summary-head"><AppIcon name="layers" /><button @click="emit('navigate', 'statistics')">统计详情 <AppIcon name="arrow" /></button></div><span>已保存标注文本</span><strong>{{ statistics?.savedCount ?? 0 }}</strong><small>份文本</small></div><div class="summary-block"><div class="summary-head"><AppIcon name="jobs" /><button @click="emit('navigate', 'jobs')">查看任务 <AppIcon name="arrow" /></button></div><span>进行中的任务</span><strong>{{ running }}</strong><small v-if="failed">{{ failed }} 项需关注</small><small v-else>暂无失败或中断</small></div></article>
      <article class="dashboard-panel dashboard-recent"><div class="panel-heading"><div><h2>最近文本</h2><p>按最近更新排序</p></div><button class="dashboard-link" @click="emit('navigate', 'library')">全部文本 <AppIcon name="arrow" /></button></div><div class="dashboard-table-wrap"><table><thead><tr><th>更新</th><th>标题</th><th>状态</th><th><span class="visually-hidden">操作</span></th></tr></thead><tbody><tr v-for="document in recent" :key="document.id"><td>{{ date(document.updatedAt) }}</td><td><button class="document-link" @click="emit('open', document.id)">{{ document.title }}</button></td><td><span class="status-dot" :class="{ saved: document.currentSnapshotId }"></span>{{ document.currentSnapshotId ? '已保存' : '待标注' }}</td><td><button class="table-open" :aria-label="`打开 ${document.title}`" @click="emit('open', document.id)"><AppIcon name="arrow" /></button></td></tr></tbody></table><p v-if="!recent.length" class="dashboard-empty">还没有文本，创建或导入后会显示在这里。</p></div></article>
      <article class="dashboard-panel dashboard-distribution"><div class="panel-heading"><div><h2>标注图层</h2><p>当前修订的已保存条目</p></div><button class="dashboard-link" @click="emit('navigate', 'statistics')">查看统计 <AppIcon name="arrow" /></button></div><div v-if="rows.length" class="column-chart"><svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path :d="layerCurve" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" /></svg><button v-for="item in rows" :key="item.key" class="column-item" :aria-label="`${item.name}：${item.value} 条已保存标注`" @pointermove="showChartTip(item, $event)" @pointerleave="tip = null" @focus="showChartTip(item, $event)" @blur="tip = null"><strong>{{ item.value.toLocaleString() }}</strong><span class="column-track"><span :style="{ height: `${item.value / maximum * 85}%` }"></span></span><small>{{ item.name }}</small></button></div><p v-else class="dashboard-empty">保存标注后，这里会展示各图层条目数。</p></article>
      <article class="dashboard-panel dashboard-entities"><div class="panel-heading"><div><h2>实体类别</h2><p>已保存快照中的实体</p></div><button class="dashboard-link" @click="emit('navigate', 'statistics')">详情 <AppIcon name="arrow" /></button></div><div class="entity-overview"><div class="entity-bubble"><strong>{{ entityTotal.toLocaleString() }}</strong><span>处实体</span></div><div v-if="entities.length" class="entity-legend"><div v-for="item in entities.slice(0, 5)" :key="item.key"><span>{{ item.name }}</span><strong>{{ item.value }}</strong></div></div><p v-else class="dashboard-empty">暂无已保存实体</p></div></article>
    </section>
    <PointerTip :anchor="tip"><strong>{{ tip?.item?.name }}</strong><p>{{ tip?.item?.value?.toLocaleString() }} 条已保存标注</p></PointerTip>
  </div>
</template>
