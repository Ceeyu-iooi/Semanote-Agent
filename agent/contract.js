import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const taskTypes = ['segmentation','keywords','pos','ner','paragraphs','relations','events','sentiment','intent','semantic','errors'];
export const posLabels = ['ADJ','ADP','ADV','AUX','CCONJ','DET','INTJ','NOUN','NUM','PART','PRON','PROPN','PUNCT','SCONJ','SYM','VERB','X'];
export const entityLabels = ['PERSON','LOCATION','ORGANIZATION','TIME','MONEY'];
export const labels = {ner:entityLabels,pos:posLabels,sentiment:['POSITIVE','NEGATIVE','NEUTRAL'],intent:['INFORM','REQUEST','QUESTION','COMMAND','PROMISE','OTHER'],semantic:['TOPIC','LIST_ITEM','EXPLANATION','CONCLUSION','OTHER'],errors:['GRAMMAR','WORD_CHOICE','TYPO','PUNCTUATION']};
export const hash = value => createHash('sha256').update(value).digest('hex');
export function requireValue(condition, code='invalidAnnotation', message='标注数据不符合契约。') { if (!condition) throw Object.assign(new Error(message),{code}); }
export function positions(text,word) {
 if(typeof word!=='string'||!word.isWellFormed())return [];
 const source=Array.from(text),needle=Array.from(word),found=[];
 if(!needle.length)return found;
 // String#indexOf is linear in the native runtime; convert only matched UTF-16 boundaries.
 let offset=0,previous=0,codePoints=0;
 while((offset=text.indexOf(word,offset))>=0){codePoints+=Array.from(text.slice(previous,offset)).length;found.push(codePoints);previous=offset;offset+=source[codePoints]?.length||1;}
 return found;
}
export function span(text,start,end){const chars=Array.from(text);requireValue(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&start<end&&end<=chars.length,'invalidSpan');return {start,end,surfaceText:chars.slice(start,end).join('')};}
function sourceItem(text,raw,task){
 requireValue(raw&&typeof raw==='object'&&typeof raw.itemText==='string'&&raw.itemText.isWellFormed()&&raw.itemText.trim(),'invalidItem');
 const starts=positions(text,raw.itemText);requireValue(starts.length,'sourceMismatch','标注证据未逐字出现在原文中。');
 const occurrence=raw.occurrence??0;
 requireValue(Number.isInteger(occurrence)&&occurrence>=0&&occurrence<starts.length,'invalidOccurrence');
 const selected=task==='keywords'?starts:[starts[occurrence]];
 const item={itemId:randomUUID(),itemText:raw.itemText,spans:selected.map(start=>span(text,start,start+Array.from(raw.itemText).length))};
 if(task!=='keywords'&&task!=='paragraphs'){
  requireValue(typeof raw.label==='string'&&raw.label.length>0&&raw.label.length<=80,'invalidLabel');
  if(labels[task])requireValue(labels[task].includes(raw.label),'invalidLabel');
  item.label=raw.label;
 }
 return item;
}
function sourceRole(text,value,evidence){
 const itemText=typeof value==='string'?value:value?.itemText;
 const item=sourceItem(text,{itemText},'keywords');
 if(typeof value==='object'&&value!==null){
  requireValue(Array.isArray(value.occurrences)&&value.occurrences.length>0&&new Set(value.occurrences).size===value.occurrences.length,'invalidRoleOccurrence');
  item.spans=value.occurrences.map(index=>{requireValue(Number.isInteger(index)&&index>=0&&index<item.spans.length,'invalidRoleOccurrence');return item.spans[index];});
 }else{
  const inside=item.spans.filter(s=>s.start>=evidence.start&&s.end<=evidence.end);
  if(inside.length)item.spans=inside;
  else requireValue(item.spans.length===1,'ambiguousRole','角色有多处出现，请明确原文位置。');
 }
 return item;
}
export function convertItems(task,raw,text,tokens=[]){
 requireValue(taskTypes.includes(task)&&Array.isArray(raw)&&raw.length<=20000,'invalidItems');
 const chars=Array.from(text);let cursor=0;
 if(task==='segmentation'){
  const result=[];
  for(const value of raw){const word=value.itemText;requireValue(typeof word==='string'&&word.length&&!/\s/u.test(word),'invalidToken');
   // The provider may group punctuation with a token; split deterministically without changing text.
   const pieces=word.match(/[^\p{P}]+|\p{P}/gu)||[];
   for(const piece of pieces){while(cursor<chars.length&&/\s/u.test(chars[cursor]))cursor++;const end=cursor+Array.from(piece).length;
    requireValue(chars.slice(cursor,end).join('')===piece,'tokenMismatch','分词顺序或词面与原文不符。');result.push({itemId:randomUUID(),itemText:piece,spans:[span(text,cursor,end)]});cursor=end;}
  }
  requireValue(chars.slice(cursor).every(char=>/\s/u.test(char)),'incompleteTokens','分词未覆盖完整原文。');return result;
 }
 if(task==='pos'){
  requireValue(raw.length===tokens.length,'posCountMismatch','词性必须逐项对应分词。');
  return raw.map((value,index)=>{requireValue(value.tokenIndex===index&&posLabels.includes(value.label),'invalidPos');return {...tokens[index],itemId:randomUUID(),tokenItemId:tokens[index].itemId,label:value.label};});
 }
 if(task==='paragraphs'){
  const items=raw.map(value=>{requireValue(typeof value.itemText==='string'&&value.itemText.length,'invalidParagraph');const end=cursor+Array.from(value.itemText).length;requireValue(chars.slice(cursor,end).join('')===value.itemText,'paragraphMismatch');const item={itemId:randomUUID(),itemText:value.itemText,spans:[span(text,cursor,end)]};cursor=end;return item;});
  requireValue(cursor===chars.length,'incompleteParagraphs','分段必须无损覆盖原文。');return items;
 }
 requireValue(task!=='keywords'||raw.length<=10,'tooManyKeywords');
 const seen=new Set();return raw.map((value,index)=>{
  const item=sourceItem(text,value,task);const identity=JSON.stringify([item.itemText,item.label,item.spans,value.subject,value.object,value.roles]);requireValue(!seen.has(identity),'duplicateItem');seen.add(identity);
  if(task==='keywords')item.rank=index+1;
  if(task==='relations'){
   for(const role of ['subject','object'])item[role]=sourceRole(text,value[role],item.spans[0]);
  }
  if(task==='events'){
   requireValue(value.roles&&typeof value.roles==='object'&&!Array.isArray(value.roles),'invalidRoles');item.roles={};
   for(const [role,entries] of Object.entries(value.roles)){
    requireValue(['subject','object','time','location','cause','result'].includes(role)&&Array.isArray(entries)&&entries.length<=20,'invalidRole');
    item.roles[role]=entries.map(entry=>sourceRole(text,entry,item.spans[0]));
   }
  }
  if(task==='errors'){requireValue(typeof value.suggestion==='string'&&value.suggestion.length<=1000&&typeof value.explanation==='string'&&value.explanation.length<=1000,'invalidCorrection');item.suggestion=value.suggestion;item.explanation=value.explanation;}
  return item;
 });
}
export function validateRequest(request){
 requireValue(request&&typeof request.requestId==='string'&&request.requestId.length>0&&typeof request.revisionId==='string'&&request.revisionId.length>0,'invalidIdentity');
 requireValue(typeof request.text==='string'&&request.text.trim()&&Array.from(request.text).length<=10000&&!/[\uD800-\uDFFF]/u.test(request.text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,'')),'invalidText');
 requireValue(Array.isArray(request.tasks)&&request.tasks.length&&new Set(request.tasks).size===request.tasks.length&&request.tasks.every(task=>taskTypes.includes(task)),'invalidTasks');
 const requestedTasks=taskTypes.filter(task=>request.tasks.includes(task)),effectiveTasks=taskTypes.filter(task=>requestedTasks.includes(task)||(task==='segmentation'&&requestedTasks.includes('pos')));
 return {requestedTasks,effectiveTasks};
}
export function toRaw(task,items,text,tokens=[]){return items.map((item,index)=>{
 if(task==='pos')return {tokenIndex:index,label:item.label};
 const result={itemText:item.itemText};if(item.label)result.label=item.label;
 if(!['keywords','paragraphs','segmentation'].includes(task))result.occurrence=positions(text,item.itemText).indexOf(item.spans[0].start);
 if(task==='relations')for(const role of ['subject','object'])result[role]={itemText:item[role].itemText,occurrences:item[role].spans.map(span=>positions(text,item[role].itemText).indexOf(span.start))};
 if(task==='events')result.roles=Object.fromEntries(Object.entries(item.roles||{}).map(([role,entries])=>[role,entries.map(entry=>({itemText:entry.itemText,occurrences:entry.spans.map(span=>positions(text,entry.itemText).indexOf(span.start))}))]));
 if(task==='errors'){result.suggestion=item.suggestion;result.explanation=item.explanation;}
 return result;
});}
/** Rebuild all spans and identities, then compare trusted data, including dependent references. */
export function validateResponse(request,response){
 const {requestedTasks,effectiveTasks}=validateRequest(request);
 requireValue(response&&['1.0.0','1.1.0'].includes(response.contractVersion)&&response.requestId===request.requestId&&response.revisionId===request.revisionId&&response.textHash===hash(request.text)&&response.textLength===Array.from(request.text).length&&response.offsetUnit==='unicodeCodePoint','incompatibleRetry');
 requireValue(JSON.stringify(response.requestedTasks)===JSON.stringify(requestedTasks)&&JSON.stringify(response.effectiveTasks)===JSON.stringify(effectiveTasks),'incompatibleRetry');
 const ids=new Set();
 for(const task of taskTypes){const layer=response.layers?.[task];if(!effectiveTasks.includes(task)){requireValue(!layer||layer.status==='notRequested','invalidLayer');continue;}
  requireValue(layer&&['success','failed'].includes(layer.status)&&layer.taskType===task,'invalidLayer');
  if(layer.status==='failed'){requireValue(layer.result===null&&layer.error?.code,'invalidFailedLayer');continue;}
  const result=layer.result;requireValue(result?.revisionId===request.revisionId&&Array.isArray(result.items)&&result.producerKind==='automatic'&&typeof result.resultId==='string'&&!ids.has(result.resultId),'invalidResult');ids.add(result.resultId);
  const tokens=response.layers.segmentation?.result?.items||[];
  requireValue(task!=='pos'||(response.layers.segmentation.status==='success'&&result.dependencyResultId===response.layers.segmentation.result.resultId),'invalidDependency');
  const rebuilt=convertItems(task,toRaw(task,result.items,request.text,tokens),request.text,tokens);
  for(let i=0;i<rebuilt.length;i++){const item=result.items[i];requireValue(typeof item.itemId==='string'&&!ids.has(item.itemId),'duplicateIdentity');ids.add(item.itemId);
   requireValue(isDeepStrictEqual(item.spans,rebuilt[i].spans)&&item.itemText===rebuilt[i].itemText&&item.label===rebuilt[i].label,'invalidSavedSpan');
   if(task==='pos')requireValue(item.tokenItemId===tokens[i].itemId,'invalidDependency');
   if(task==='keywords')requireValue(item.rank===i+1,'invalidRank');
   if(task==='relations')for(const role of ['subject','object'])requireValue(isDeepStrictEqual(item[role].spans,rebuilt[i][role].spans),'invalidRoleSpan');
   if(task==='events')for(const role of Object.keys(rebuilt[i].roles))requireValue(isDeepStrictEqual(item.roles[role].map(e=>e.spans),rebuilt[i].roles[role].map(e=>e.spans)),'invalidRoleSpan');
  }
 }
 const count=effectiveTasks.filter(task=>response.layers[task].status==='success').length;
 requireValue(response.status===(count===effectiveTasks.length?'success':count?'partialFailure':'failed'),'invalidStatus');return response;
}
