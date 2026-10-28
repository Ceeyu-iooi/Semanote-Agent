<script setup>
import { computed,ref } from 'vue';
import GitTimeline from './GitTimeline.vue';
import AppIcon from './AppIcon.vue';
const selected=ref(new URLSearchParams(location.search).get('view')||'design');
const entries=[
 {id:'design',name:'设计规范',caption:'Foundations & components',url:'/reference/design/preview.html'},
 {id:'system',name:'系统架构',caption:'System architecture',url:'/reference/diagrams/system-architecture.html'},
 {id:'agent',name:'智能体框架',caption:'Agent orchestration',url:'/reference/diagrams/agent-architecture.html'},
 {id:'frontend',name:'前端框架',caption:'Frontend architecture',url:'/reference/diagrams/frontend-architecture.html'},
 {id:'backend',name:'后端框架',caption:'Backend architecture',url:'/reference/diagrams/backend-architecture.html'},
 {id:'database',name:'数据库框架',caption:'Data & revisions',url:'/reference/diagrams/database-architecture.html'},
 {id:'git',name:'Git 时间轴',caption:'Live commits & changes'},
 {id:'workflow',name:'GitFlow 规范',caption:'Branch lifecycle',url:'/reference/diagrams/git-workflow.html'},
 {id:'changelog',name:'变更记录',caption:'Changelog',url:'/reference/changelog.html'}
];
const current=computed(()=>entries.find(entry=>entry.id===selected.value)||entries[0]);
function choose(id){selected.value=id;history.replaceState(null,'',`/developer?view=${id}`);}
</script>
<template>
 <div class="developer-shell"><header class="global-header"><a href="/" class="brand"><span class="brand-symbol">S</span>Semanote <span class="developer-wordmark">Developer</span></a><a href="/" class="global-link">返回文本工作台 ↗</a></header><div class="developer-workspace"><aside class="developer-sidebar"><p class="eyebrow">PROJECT STUDIO</p><h1>开发者中心</h1><nav aria-label="开发者导航"><button v-for="entry in entries" :key="entry.id" :class="{selected:current.id===entry.id}" @click="choose(entry.id)"><AppIcon :name="entry.id==='git'?'jobs':entry.id==='design'?'layers':'code'"/><span>{{ entry.name }}<small>{{ entry.caption }}</small></span></button></nav><p class="caption muted">与工作台共用设计语言。</p></aside><main class="developer-main"><GitTimeline v-if="current.id==='git'"/><template v-else><div class="developer-bar"><span>{{ current.name }}</span><a :href="current.url" class="text-action caption" target="_blank" rel="noreferrer">全屏查看 ↗</a></div><iframe :key="current.id" :src="current.url" :title="current.name" class="developer-frame"></iframe></template></main></div></div>
</template>
