<script setup>
import { computed,onMounted,ref,watch } from 'vue';
import { request } from '../api.js';
const data=ref(null),index=ref(0),detail=ref(null),error=ref(''),busy=ref(false),patchVisible=ref(false),branch=ref('all');
const rows=computed(()=>data.value?.commits||[]),selected=computed(()=>rows.value[index.value]);
const branches=computed(()=>[...new Set(rows.value.flatMap(row=>row.refs.split(', ').filter(Boolean)))].filter(value=>!value.includes('HEAD')));
const filtered=computed(()=>branch.value==='all'?rows.value:rows.value.filter(row=>row.refs.includes(branch.value)));
const graph=computed(()=>{
 const lanes=[],nodes=[],positions=new Map();
 rows.value.forEach((commit,index)=>{
  let lane=lanes.indexOf(commit.id);if(lane<0){lane=lanes.findIndex(value=>value===null);if(lane<0)lane=lanes.length;lanes[lane]=commit.id;}
  const node={...commit,x:12+lane*14,y:index*96+22};nodes.push(node);positions.set(commit.id,node);
  lanes[lane]=commit.parents[0]||null;
  for(const parent of commit.parents.slice(1))if(!lanes.includes(parent)){let free=lanes.findIndex(value=>value===null);if(free<0)free=lanes.length;lanes[free]=parent;}
 });
 const edges=nodes.flatMap(node=>node.parents.map(parent=>positions.get(parent)).filter(Boolean).map(parent=>({id:node.id+'-'+parent.id,d:`M ${node.x} ${node.y} C ${node.x} ${node.y+44}, ${parent.x} ${parent.y-44}, ${parent.x} ${parent.y}`})));
 return {nodes,edges,width:Math.max(40,...nodes.map(node=>node.x+14)),height:rows.value.length*96};
});
let sequence=0;
async function load(){busy.value=true;error.value='';try{data.value=await request('/development/git');index.value=0;await loadDetail();}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function loadDetail(){const id=selected.value?.id;if(!id)return;const current=++sequence;detail.value=null;try{const result=await request(`/development/git/${id}`);if(current===sequence)detail.value=result;}catch(e){if(current===sequence)error.value=e.message;}}
watch(index,loadDetail);onMounted(load);
</script>
<template>
 <section class="git-view"><div class="panel-toolbar"><div><p class="eyebrow">LIVE REPOSITORY</p><h2>项目 Git 时间轴</h2><small class="muted">{{ data?.branch }} · 当前仓库 · 最近 {{ rows.length }} 次提交</small></div><button class="btn btn-outline-primary" :disabled="busy" @click="load">刷新记录</button></div><p v-if="error" class="feedback error-feedback" role="alert">{{ error }}</p>
 <div v-if="data" class="git-body"><div class="timeline-controls"><button class="utility-button" :disabled="index>=rows.length-1" @click="index++">← 较早</button><label class="timeline-range">时间定位<input v-model.number="index" type="range" min="0" :max="Math.max(0,rows.length-1)" aria-label="切换 Git 提交时间轴"><small>{{ selected?.date?.slice(0,16).replace('T',' ') }}</small></label><button class="utility-button" :disabled="index<=0" @click="index--">较新 →</button></div>
 <div class="git-columns"><div class="commit-list"><label class="caption">分支标记<select v-model="branch" class="form-select"><option value="all">全部历史</option><option v-for="name in branches" :key="name">{{ name }}</option></select></label><div class="commit-graph-list" :style="{'--graph-width':`${graph.width}px`}"><svg v-if="branch==='all'" class="commit-graph" :width="graph.width" :height="graph.height" aria-label="实际 Git 父提交关系"><path v-for="edge in graph.edges" :key="edge.id" :d="edge.d" fill="none" stroke="var(--color-chip)" stroke-width="1.5"/><circle v-for="node in graph.nodes" :key="node.id" :cx="node.x" :cy="node.y" :r="selected?.id===node.id?5:3.5" fill="var(--color-primary)"><title>{{ node.subject }} · {{ node.id.slice(0,7) }}</title></circle></svg><button v-for="commit in filtered" :key="commit.id" class="commit-row" :style="branch==='all'?{paddingLeft:`${graph.width+8}px`}:{}" :title="commit.subject" :class="{selected:commit.id===selected?.id}" @click="index=rows.findIndex(row=>row.id===commit.id)"><span v-if="branch!=='all'" class="commit-rail" :class="{merge:commit.parents.length>1}"><i></i><i v-if="commit.parents.length>1" class="merge-dot"></i></span><span><b>{{ commit.subject }}</b><small>{{ commit.id.slice(0,7) }} · {{ commit.date.slice(0,10) }}</small><em v-if="commit.refs">{{ commit.refs }}</em></span></button></div></div>
 <article class="commit-detail"><p class="eyebrow">{{ selected?.parents.length>1?'MERGE COMMIT':'COMMIT' }} / {{ selected?.id.slice(0,7) }}</p><h2>{{ selected?.subject }}</h2><p class="caption muted">父提交 {{ selected?.parents.map(id=>id.slice(0,7)).join(' · ') || '无' }}</p><div class="segmented-control"><button :class="{selected:!patchVisible}" @click="patchVisible=false">文件变更</button><button :class="{selected:patchVisible}" @click="patchVisible=true">代码差异</button></div><pre v-if="detail" class="git-diff">{{ patchVisible?(detail.patch||'本次没有可展示的文本代码差异。'):detail.summary }}</pre><div v-else class="empty-state">正在读取提交…</div></article></div></div></section>
</template>
