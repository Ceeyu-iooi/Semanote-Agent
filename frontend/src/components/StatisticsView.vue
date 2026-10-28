<script setup>
import { computed } from 'vue';
import { entityNames, taskNames } from '../api.js';
const props = defineProps({ statistics: Object });
const emit = defineEmits(['refresh']);
const entityRows = computed(() => Object.entries(props.statistics?.entityLabels || {}));
const posRows = computed(() => Object.entries(props.statistics?.posLabels || {}));
const maxEntity = computed(() => Math.max(1, ...entityRows.value.map(([, count]) => count)));
const maxPos = computed(() => Math.max(1, ...posRows.value.map(([, count]) => count)));
</script>

<template>
  <section class="page-heading"><div><p class="eyebrow">INSIGHTS / SAVED SNAPSHOTS</p><h1>标注统计</h1><p class="muted">只统计未归档文本当前修订的已保存快照。</p></div><button class="btn btn-outline-primary" @click="emit('refresh')">刷新统计</button></section>
  <template v-if="statistics"><div class="metric-grid"><article class="metric-card"><p class="caption muted">文本总数</p><strong>{{ statistics.documentCount }}</strong><span class="caption">{{ statistics.savedCount }} 份已有保存快照</span></article><article v-for="(name, task) in taskNames" :key="task" class="metric-card"><p class="caption muted">{{ name }}条目</p><strong>{{ statistics.itemCounts[task] }}</strong><span class="caption">覆盖 {{ statistics.coverage[task] }} / {{ statistics.documentCount }} 份文本</span></article></div>
  <div v-if="!statistics.savedCount" class="empty-state surface"><span class="empty-mark">◌</span><h2>从第一份保存快照开始。</h2><p class="muted">自动候选与未保存的人工草稿不会进入统计。</p></div>
  <div v-else class="statistics-grid"><article class="surface chart-panel"><h2>实体类别</h2><p class="caption muted">每次出现分别计数，允许重叠实体。</p><div v-if="!entityRows.length" class="muted py-4">已保存快照暂无实体条目；也可能尚未包含实体层。</div><div v-for="([label, count]) in entityRows" :key="label" class="bar-row"><span>{{ entityNames[label] }} <small>{{ label }}</small></span><div class="bar-track"><span :style="{ width: `${count / maxEntity * 100}%` }"></span></div><strong>{{ count }}</strong></div></article>
  <article class="surface chart-panel"><h2>关键词</h2><p class="caption muted">按原文出现次数汇总，显示前 20 个。</p><div v-if="!statistics.keywords.length" class="muted py-4">暂无已保存关键词。</div><ol class="keyword-ranking"><li v-for="keyword in statistics.keywords" :key="keyword.itemText"><span>{{ keyword.itemText }}</span><strong>{{ keyword.count }} <small>次</small></strong></li></ol></article>
  <article class="surface chart-panel full-width"><h2>词性分布</h2><p class="caption muted">UD 标签绑定同一快照的分词。</p><div v-if="!posRows.length" class="muted py-4">暂无已保存词性层。</div><div class="pos-chart"><div v-for="([label, count]) in posRows" :key="label" class="bar-row"><span>{{ label }}</span><div class="bar-track"><span :style="{ width: `${count / maxPos * 100}%` }"></span></div><strong>{{ count }}</strong></div></div></article></div></template>
</template>
