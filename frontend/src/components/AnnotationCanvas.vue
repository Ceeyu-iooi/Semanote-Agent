<script setup>
import { computed, ref } from 'vue';
import { entityNames, taskNames } from '../api.js';
const props=defineProps({text:{type:String,default:''},items:{type:Array,default:()=>[]},selectable:Boolean,focusedItem:String,preferences:Object,revealKey:String});
const emit=defineEmits(['select','focus']);
const canvas=ref(null),tip=ref(null);
const segments=computed(()=>{
 const chars=Array.from(props.text),boundaries=new Set([0,chars.length]);
 for(const item of props.items)for(const span of item.spans||[]){boundaries.add(span.start);boundaries.add(span.end);}
 const points=[...boundaries].filter(point=>point>=0&&point<=chars.length).sort((a,b)=>a-b);
 return points.slice(0,-1).map((start,index)=>{
  const end=points[index+1],matches=props.items.filter(item=>item.spans?.some(span=>span.start<=start&&span.end>=end));
  return {start,end,text:chars.slice(start,end).join(''),matches,tokenEnd:matches.some(item=>item.task==='segmentation'&&item.spans.some(span=>span.end===end)),classes:matches.map(item=>`mark-${item.task} ${item.task==='ner'?'entity-'+item.label:''} ${item.task==='pos'?'pos-'+item.label:''}`)};
 });
});
function selectText(){
 if(!props.selectable)return;const selection=window.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;
 const range=selection.getRangeAt(0);if(!canvas.value.contains(range.startContainer)||!canvas.value.contains(range.endContainer))return;
 const prefix=range.cloneRange();prefix.selectNodeContents(canvas.value);prefix.setEnd(range.startContainer,range.startOffset);
 const text=range.toString();if(!text.trim())return;const start=Array.from(prefix.toString()).length;
 emit('select',{start,end:start+Array.from(text).length,text});
}
function showTip(segment,event){
 if(!segment.matches.length)return;const rectangle=event.currentTarget.getBoundingClientRect();
 const left=Math.max(12,Math.min(rectangle.left,window.innerWidth-292)),below=rectangle.bottom+10;
 tip.value={...segment,left,top:below>window.innerHeight-150?Math.max(12,rectangle.top-130):below};
}
</script>
<template>
 <div ref="canvas" class="annotation-canvas" :class="{'annotation-reveal':revealKey}" :style="{fontFamily:preferences?.fontFamily,fontSize:`${preferences?.fontSize||19}px`,lineHeight:preferences?.lineHeight||2.1}" @mouseup="selectText" @keyup="selectText" @pointerleave="tip=null">
 <span v-for="(segment,index) in segments" :key="`${revealKey}-${segment.start}`" :class="[segment.classes,{'has-annotation':segment.matches.length,'token-end':segment.tokenEnd,'focused-text':segment.matches.some(item=>item.itemId===focusedItem)}]" :style="{'--reveal-delay':`${Math.min(index*12,1200)}ms`}" :tabindex="segment.matches.length?0:undefined" :aria-label="segment.matches.length?segment.matches.map(item=>`${taskNames[item.task]} ${item.itemText} ${entityNames[item.label]||item.label||''}`).join('；'):undefined" @pointerenter="showTip(segment,$event)" @focus="showTip(segment,$event)" @blur="tip=null" @click="segment.matches.length&&emit('focus',segment.matches.map(item=>item.itemId))" @keydown.enter="emit('focus',segment.matches.map(item=>item.itemId))">{{ segment.text }}</span>
 </div>
 <Teleport to="body"><div v-if="tip" class="annotation-popover" role="tooltip" :style="{left:`${tip.left}px`,top:`${tip.top}px`}"><strong>{{ tip.text }}</strong><div v-for="item in tip.matches" :key="item.itemId" class="popover-row"><span>{{ taskNames[item.task] }}</span><b>{{ entityNames[item.label]||item.label||(item.rank?`第 ${item.rank} 位`:'词项') }}</b></div><small>区间 {{ tip.start }}–{{ tip.end }} · 点击定位条目</small></div></Teleport>
</template>
