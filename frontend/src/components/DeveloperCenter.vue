<script setup>
import { computed, ref } from 'vue';
const selected = ref('design');
const entries = [
  { id: 'design', name: '设计规范', caption: '共享视觉语言与组件', url: '/reference/design/preview.html' },
  { id: 'system', name: '系统架构', caption: '浏览器、后端、数据库与智能体', url: '/reference/diagrams/system-architecture.html' },
  { id: 'agent', name: '智能体架构', caption: '推理、校验与显式恢复', url: '/reference/diagrams/agent-architecture.html' },
  { id: 'frontend', name: '前端架构', caption: 'Vue 组件与数据流', url: '/reference/diagrams/frontend-architecture.html' },
  { id: 'backend', name: '后端架构', caption: 'Spring Boot 与本地调用', url: '/reference/diagrams/backend-architecture.html' },
  { id: 'database', name: '数据库架构', caption: '修订、候选与保存快照', url: '/reference/diagrams/database-architecture.html' },
  { id: 'git', name: 'Git 工作流', caption: '分支、评审与版本发布', url: '/reference/diagrams/git-workflow.html' },
  { id: 'changelog', name: 'Changelog', caption: '实际变更与发布记录', url: '/reference/changelog.html' },
];
const current = computed(() => entries.find(entry => entry.id === selected.value));
</script>

<template>
  <section class="page-heading"><div><p class="eyebrow">DEVELOPER / REFERENCE</p><h1>开发者中心</h1><p class="muted">从共同的设计语言，看到系统的每一层。</p></div><span class="quiet-badge">本地项目资料</span></section>
  <div class="developer-layout">
    <nav class="developer-menu" aria-label="开发者资料"><button v-for="entry in entries" :key="entry.id" class="reference-tab" :class="{ selected: selected === entry.id }" @click="selected = entry.id"><strong>{{ entry.name }}</strong><small>{{ entry.caption }}</small></button></nav>
    <section class="reference-panel"><div class="panel-toolbar"><div><strong>{{ current.name }}</strong><p class="caption muted mb-0">{{ current.caption }}</p></div><a class="text-action" :href="current.url" target="_blank" rel="noreferrer">独立查看 ↗</a></div><iframe :key="current.id" :src="current.url" :title="current.name" class="reference-frame"></iframe></section>
  </div>
</template>
