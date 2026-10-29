<script setup>
import { computed,nextTick,onMounted,ref,watch } from 'vue';
import { request } from '../api.js';
const data=ref(null),index=ref(0),detail=ref(null),error=ref(''),busy=ref(false),patchVisible=ref(false),track=ref(null),branch=ref('all');
const rows=computed(()=>data.value?.commits||[]),selected=computed(()=>rows.value[index.value]);
const branches=computed(()=>[...new Set(rows.value.flatMap(row=>row.refs.split(', ').filter(Boolean)))].filter(value=>!value.includes('HEAD')));
const ordered=computed(()=>[...rows.value].reverse());
const position=computed({get:()=>rows.value.length-1-index.value,set:value=>{index.value=rows.value.length-1-Number(value);}});
const fill=computed(()=>rows.value.length<=1?100:position.value/(rows.value.length-1)*100);
const graph=computed(()=>{
 const lanes=[],nodes=[],positions=new Map();
 rows.value.forEach((commit,i)=>{
  let lane=lanes.indexOf(commit.id);if(lane<0){lane=lanes.findIndex(value=>value===null);if(lane<0)lane=lanes.length;lanes[lane]=commit.id;}
  const node={...commit,x:(rows.value.length-1-i)*252+126,y:20+lane*24};nodes.push(node);positions.set(commit.id,node);
  lanes[lane]=commit.parents[0]||null;
  for(const parent of commit.parents.slice(1))if(!lanes.includes(parent)){let free=lanes.findIndex(value=>value===null);if(free<0)free=lanes.length;lanes[free]=parent;}
 });
 const edges=nodes.flatMap(node=>node.parents.map(parent=>positions.get(parent)).filter(Boolean).map(parent=>({id:node.id+'-'+parent.id,d:`M ${parent.x} ${parent.y} C ${(parent.x+node.x)/2} ${parent.y}, ${(parent.x+node.x)/2} ${node.y}, ${node.x} ${node.y}`})));
 return {nodes,edges,width:rows.value.length*252,height:Math.max(64,...nodes.map(node=>node.y+24))};
});
let sequence=0;
async function load(){busy.value=true;error.value='';try{data.value=await request('/development/git');index.value=0;await loadDetail();}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function loadDetail(){const id=selected.value?.id;if(!id)return;const current=++sequence;detail.value=null;error.value='';try{const result=await request(`/development/git/${id}`);if(current===sequence)detail.value=result;}catch(e){if(current===sequence)error.value=e.message;}await nextTick();track.value?.querySelector(`[data-commit="${id}"]`)?.scrollIntoView({block:'nearest',inline:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
function selectBranch(){const match=rows.value.findIndex(row=>row.refs.split(', ').includes(branch.value));if(match>=0)index.value=match;}
watch(index,loadDetail);onMounted(load);
</script>
<template>
 <section class="git-view horizontal-git"><div class="panel-toolbar"><div><p class="eyebrow">LIVE REPOSITORY</p><h2>项目 Git 时间轴</h2><small class="muted">{{ data?.branch }} · 当前仓库 · 最近 {{ rows.length }} 次提交</small></div><button class="btn btn-outline-primary" :disabled="busy" @click="load">刷新记录</button></div><p v-if="error" class="feedback error-feedback" role="alert">{{ error }}</p>
 <div v-if="data" class="git-body"><label class="branch-jump caption">定位分支标记<select v-model="branch" class="form-select" @change="selectBranch"><option value="all">全部历史</option><option v-for="name in branches" :key="name">{{ name }}</option></select></label><div ref="track" class="horizontal-commit-track" tabindex="0" aria-label="从左向右：较早到较新的实际提交"><div :style="{width:`${graph.width}px`}"><svg :width="graph.width" :height="graph.height" aria-label="实际 Git 父提交关系"><path v-for="edge in graph.edges" :key="edge.id" :d="edge.d" fill="none" stroke="var(--color-chip)" stroke-width="2"/><circle v-for="node in graph.nodes" :key="node.id" :cx="node.x" :cy="node.y" :r="selected?.id===node.id?7:4" fill="var(--color-primary)"><title>{{ node.subject }} · {{ node.id.slice(0,7) }}</title></circle></svg><div class="horizontal-commits"><button v-for="commit in ordered" :key="commit.id" :data-commit="commit.id" class="horizontal-commit" :class="{selected:commit.id===selected?.id}" :aria-pressed="commit.id===selected?.id" @click="index=rows.findIndex(row=>row.id===commit.id)"><time>{{ commit.date.slice(0,10) }}</time><b>{{ commit.subject }}</b><small>{{ commit.id.slice(0,7) }}{{ commit.parents.length>1?' · 合并':'' }}</small><em v-if="commit.refs">{{ commit.refs }}</em></button></div></div></div>
 <div class="timeline-controls"><button class="utility-button" :disabled="index>=rows.length-1" @click="index++">← 较早</button><label class="timeline-range">时间定位<input v-model.number="position" type="range" min="0" :max="Math.max(0,rows.length-1)" :style="{'--range-fill':`${fill}%`}" aria-label="切换 Git 提交时间轴"><small>{{ selected?.date?.slice(0,16).replace('T',' ') }}</small></label><button class="utility-button" :disabled="index<=0" @click="index--">较新 →</button></div>
 <article class="commit-detail"><p class="eyebrow">{{ selected?.parents.length>1?'MERGE COMMIT':'COMMIT' }} / {{ selected?.id.slice(0,7) }}</p><h2>{{ selected?.subject }}</h2><p class="caption muted">父提交 {{ selected?.parents.map(id=>id.slice(0,7)).join(' · ') || '无' }}</p><div class="segmented-control"><button :class="{selected:!patchVisible}" @click="patchVisible=false">文件变更</button><button :class="{selected:patchVisible}" @click="patchVisible=true">代码差异</button></div><pre v-if="detail" class="git-diff">{{ patchVisible?(detail.patch||'本次没有可展示的文本代码差异。'):detail.summary }}</pre><div v-else-if="!error" class="empty-state">正在读取提交…</div></article></div></section>
</template>
