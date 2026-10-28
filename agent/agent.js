import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { taskTypes, hash, validateRequest, convertItems, positions, toRaw, validateResponse, requireValue } from './contract.js';
import { generate, cacheIdentity, readJson, atomicJson, runtimeRoot, recordCacheHit } from './provider.js';
import { promptVersion } from './prompts.js';
import { groundTokens,groundOrdered,sentenceEvidence } from './grounding.js';

export const adapterVersion='2.0.0';
/** Bounded, lossless chunks; only source boundaries are used and no text is trimmed. */
export function chunks(text,limit=650){
 const chars=Array.from(text),result=[];let start=0;
 while(start<chars.length){let end=Math.min(chars.length,start+limit);if(end<chars.length){for(let i=end;i>start+Math.floor(limit/2);i--)if(/[。！？!?；;\n]/u.test(chars[i-1])){end=i;break;}}
  result.push({text:chars.slice(start,end).join(''),start});start=end;
 }return result;
}
function candidate(task,payload){
 const value=payload[task];
 if(task==='segmentation')return (payload.tokens||[]).map(tuple=>({itemText:tuple[0]}));
 if(task==='pos')return (payload.tokens||[]).flatMap(tuple=>{
  const pieces=typeof tuple[0]==='string'?tuple[0].match(/[^\p{P}]+|\p{P}/gu)||[]:[];
  return pieces.map(piece=>({label:/^\p{P}$/u.test(piece)?'PUNCT':tuple[1]}));
 }).map((item,tokenIndex)=>({...item,tokenIndex}));
 requireValue(Array.isArray(value),'missingLayer','模型缺少所选标注层。');
 if(task==='keywords')return value.map(itemText=>({itemText}));
 if(task==='ner')return value.flatMap(tuple=>[{itemText:tuple[0],label:tuple[1]}]);
 if(['sentiment','intent','semantic'].includes(task))return value.map(tuple=>({itemText:tuple[0],label:tuple[1],occurrence:tuple[2]??0}));
 return value;
}
function expandNer(raw,text){const seen=new Set();return raw.flatMap(item=>positions(text,item.itemText).map((_,occurrence)=>({...item,occurrence}))).filter(item=>{const key=JSON.stringify(item);if(seen.has(key))return false;seen.add(key);return true;});}
function paragraphs(text,semantic=[]){
 const chars=Array.from(text),boundaries=new Set([0,chars.length]);
 for(let i=0;i<chars.length;i++)if(chars[i]==='\n')boundaries.add(i+1);
 for(const item of semantic){boundaries.add(item.spans[0].start);}
 const points=[...boundaries].sort((a,b)=>a-b);
 return points.slice(0,-1).map((start,index)=>({itemText:chars.slice(start,points[index+1]).join('')}));
}
function mergeItems(task,parts,text){
 if(task==='keywords'){const unique=[...new Set(parts.flatMap(part=>part.items.map(item=>item.itemText)))].slice(0,10);return convertItems(task,unique.map(itemText=>({itemText})),text);}
 return parts.flatMap(part=>part.items.map(item=>{
  const shift=value=>({...value,spans:value.spans.map(span=>({...span,start:span.start+part.start,end:span.end+part.start}))});
  const result=shift(item);if(item.subject)result.subject=shift(item.subject);if(item.object)result.object=shift(item.object);
  if(item.roles)result.roles=Object.fromEntries(Object.entries(item.roles).map(([role,entries])=>[role,entries.map(shift)]));return result;
 }));
}
export async function annotate(request,config,{previousResponse=null,onProgress=()=>{},providerCall=generate,useCache=true}={}){
 const {requestedTasks,effectiveTasks}=validateRequest(request);
 if(previousResponse)validateResponse(request,previousResponse);
 const layers=Object.fromEntries(taskTypes.map(task=>[task,previousResponse?.layers?.[task]?.status==='success'?structuredClone(previousResponse.layers[task]):{taskType:task,selectionReason:requestedTasks.includes(task)?'requested':effectiveTasks.includes(task)?'dependency':'notRequested',status:'notRequested',attempts:previousResponse?.layers?.[task]?.attempts||[],result:null,error:null}]));
 const pending=effectiveTasks.filter(task=>layers[task].status!=='success'),remoteTasks=pending.filter(task=>task!=='paragraphs');
 const parts=Object.fromEntries(remoteTasks.map(task=>[task,[]])),failures={};
 const counters={networkCalls:0,localCacheHits:0,chunks:0,promptTokens:0,completionTokens:0,cachedTokens:0,usageKnown:true};
 const startedAt=new Date().toISOString(),start=performance.now(),textChunks=chunks(request.text);
 for(const chunk of textChunks){
  if(!remoteTasks.length)break;counters.chunks++;
  const key=cacheIdentity(config,chunk.text),cachePath=resolve(runtimeRoot,'annotation-cache',key+'.json');
  let stored=useCache?await readJson(cachePath,{}):{};
  const valid={},missing=[];
  for(const task of remoteTasks){
   try{requireValue(Array.isArray(stored[task]));const tokens=task==='pos'?convertItems('segmentation',stored.segmentation||[],chunk.text):[];
    valid[task]=convertItems(task,stored[task],chunk.text,tokens);
   }catch{missing.push(task);}
  }
  if(Object.keys(valid).length){counters.localCacheHits++;if(useCache)await recordCacheHit(config,Object.keys(valid),request.requestId,chunk.text);}
  // A POS-only retry still needs the exact retained segmentation, supplied by the same joint output.
  const modelTasks=[...new Set([...missing,...(missing.includes('pos')?['segmentation']:[])])];
  let reply=null;
  if(modelTasks.length){
   onProgress({event:'progress',taskType:'joint',status:'running',layer:null,completedChunks:counters.chunks-1,totalChunks:textChunks.length});
   try{
    counters.networkCalls++;reply=await providerCall(config,chunk.text,modelTasks,{jobId:request.requestId});
    const usage=reply.log;counters.usageKnown&&=Number.isFinite(usage.promptTokens)&&Number.isFinite(usage.completionTokens);
    for(const field of ['promptTokens','completionTokens','cachedTokens'])counters[field]+=usage[field]||0;
    let chunkTokens=[];
    if(modelTasks.includes('segmentation')||modelTasks.includes('pos')){
     try{reply.payload.tokens=groundTokens(reply.payload.tokens,chunk.text);}catch(error){failures.segmentation=error.code||'tokenMismatch';failures.pos=error.code||'dependencyFailed';reply.payload.tokens=[];}
    }
    for(const task of modelTasks.sort((a,b)=>taskTypes.indexOf(a)-taskTypes.indexOf(b))){
     try{let raw=candidate(task,reply.payload);if(task==='ner')raw=expandNer(raw,chunk.text);
      if(['sentiment','intent','semantic'].includes(task))raw=groundOrdered(raw,chunk.text);
      if(['relations','events'].includes(task)){raw=sentenceEvidence(raw,chunk.text);const seen=new Set();raw=raw.filter(item=>{const key=JSON.stringify([item.itemText,item.label,item.occurrence,item.subject,item.object,item.roles]);if(seen.has(key))return false;seen.add(key);return true;});}
    const items=convertItems(task,raw,chunk.text,chunkTokens);if(task==='segmentation'){chunkTokens=items;stored.segmentation=raw;}
      if(task==='sentiment'){const covered=new Set(items.flatMap(item=>item.spans.flatMap(span=>Array.from({length:span.end-span.start},(_,i)=>span.start+i))));requireValue(Array.from(chunk.text).every((char,index)=>/\s/u.test(char)||covered.has(index)),'incompleteSentiment','情感标注未覆盖每个句子。');}
      valid[task]=items;stored[task]=raw;
     }catch(error){failures[task]=error.code||'invalidAnnotation';delete stored[task];}
    }
    if(useCache)await atomicJson(cachePath,stored);
   }catch(error){for(const task of missing)failures[task]=error.code||'providerUnavailable';counters.usageKnown=false;}
  }
  for(const task of remoteTasks){if(valid[task])parts[task].push({start:chunk.start,items:valid[task]});else failures[task]||='missingLayer';}
  onProgress({event:'progress',taskType:'joint',status:'running',layer:null,completedChunks:counters.chunks,totalChunks:textChunks.length});
 }
 for(const task of pending){
  let items;
  try{
   requireValue(!failures[task],failures[task]||'invalidAnnotation');
   if(task==='paragraphs')items=convertItems(task,paragraphs(request.text,mergeItems('semantic',parts.semantic||[],request.text)),request.text);
   else items=mergeItems(task,parts[task],request.text);
   if(task==='pos'){
    requireValue(layers.segmentation.status==='success','dependencyFailed');const tokens=layers.segmentation.result.items;
    requireValue(items.length===tokens.length&&items.every((item,index)=>item.itemText===tokens[index].itemText&&isDeepStrictEqual(item.spans,tokens[index].spans)),'posDependencyMismatch');
    items=items.map((item,index)=>({...item,tokenItemId:tokens[index].itemId}));
   }
   const layer=layers[task];layer.status='success';layer.error=null;layer.result={resultId:randomUUID(),revisionId:request.revisionId,specVersion:'1.1.0',producerKind:'automatic',dependencyResultId:task==='pos'?layers.segmentation.result.resultId:null,items};
  }catch(error){layers[task].status='failed';layers[task].result=null;layers[task].error={code:error.code||'invalidAnnotation',message:'该层未通过原文或模型校验，请检查后显式重试。',retryable:true};}
  layers[task].attempts.push({attemptId:randomUUID(),provider:config.id,model:config.model,resolvedModel:config.model,adapterVersion,promptVersion,startedAt,finishedAt:new Date().toISOString(),status:layers[task].status,providerRequestId:null,error:layers[task].error});
  onProgress({event:'progress',taskType:task,status:layers[task].status,layer:layers[task]});
 }
 const successful=effectiveTasks.filter(task=>layers[task].status==='success').length;
 return {contractVersion:'1.1.0',requestId:request.requestId,revisionId:request.revisionId,textHash:hash(request.text),textLength:Array.from(request.text).length,offsetUnit:'unicodeCodePoint',requestedTasks,effectiveTasks,status:successful===effectiveTasks.length?'success':successful?'partialFailure':'failed',layers,execution:{...counters,durationMs:Math.round(performance.now()-start),strategy:'jointChunked',adapterVersion}};
}
export function manual(envelope){
 const {text,revisionId}=envelope;requireValue(typeof text==='string'&&text.isWellFormed()&&text.trim()&&Array.from(text).length<=10000&&typeof revisionId==='string'&&revisionId.length>0&&envelope.layers&&Object.keys(envelope.layers).every(task=>taskTypes.includes(task)),'invalidManual');
 const layers={};let tokens=[],segmentationId=null;
 for(const task of taskTypes){if(!Object.hasOwn(envelope.layers,task)){layers[task]={taskType:task,status:'notRequested',result:null,error:null};continue;}
  requireValue(task!=='pos'||segmentationId,'dependencyFailed');const items=convertItems(task,envelope.layers[task],text,tokens),resultId=randomUUID();if(task==='segmentation'){tokens=items;segmentationId=resultId;}
  layers[task]={taskType:task,status:'success',error:null,result:{resultId,revisionId,specVersion:'1.1.0',producerKind:'manual',dependencyResultId:task==='pos'?segmentationId:null,items}};
 }return {layers};
}
