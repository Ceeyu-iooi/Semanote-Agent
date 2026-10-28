import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { hash, requireValue } from './contract.js';
import { systemPrompt, promptVersion } from './prompts.js';
import { parseStrictJson } from './json.js';

export const runtimeRoot=resolve(process.env.SEMANOTE_RUNTIME_ROOT||'profile/runtime');
export async function readJson(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
export async function atomicJson(path,value){await mkdir(resolve(path,'..'),{recursive:true});const temporary=path+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(value),{mode:0o600});await rename(temporary,path);}
export function validateProvider(config){
 requireValue(config&&/^[a-z][a-z0-9_]{0,39}$/.test(config.id),'invalidProvider');
 let url;try{url=new URL(config.baseUrl);}catch{requireValue(false,'invalidEndpoint','供应商地址无效。');}
 requireValue(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&!/[\s\x00-\x1f]/.test(config.baseUrl)&&!isIP(url.hostname),'invalidEndpoint','使用无凭据的公开 HTTPS 基础地址。');
 requireValue(typeof config.model==='string'&&/^[A-Za-z0-9_.:/-]{1,120}$/.test(config.model),'invalidModel');
 requireValue(typeof config.apiKey==='string'&&config.apiKey.trim()&&!/\s/.test(config.apiKey),'missingApiKey','请先配置供应商密钥。');
 requireValue(Number.isInteger(config.timeoutSeconds)&&config.timeoutSeconds>=10&&config.timeoutSeconds<=240,'invalidTimeout');
 return config;
}
function privateAddress(address){
 if(address.includes(':'))return /^(::|fc|fd|fe[89ab])/i.test(address)||address.includes('ffff:');
 const [a,b]=address.split('.').map(Number);return a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a>=224;
}
export async function generate(config,text,tasks,context={}){
 validateProvider(config);
 const id=randomUUID(),startedAt=new Date().toISOString(),start=performance.now();
 const log={id,jobId:context.jobId||null,provider:config.id,model:config.model,tasks,startedAt,state:'running',cache:'miss',inputCodePoints:Array.from(text).length,promptTokens:null,completionTokens:null,cachedTokens:null,totalTokens:null,durationMs:null,errorCode:null,promptVersion};
 const logPath=resolve(runtimeRoot,'model-logs',id+'.json');await atomicJson(logPath,log);
 try{
  const endpoint=config.baseUrl.replace(/\/$/,'')+'/chat/completions';
  const addresses=await lookup(new URL(endpoint).hostname,{all:true});
  requireValue(addresses.length&&!addresses.some(entry=>privateAddress(entry.address)),'invalidEndpoint','供应商地址必须解析到公开网络。');
  const body={model:config.model,messages:[{role:'system',content:systemPrompt},{role:'user',content:JSON.stringify({tasks,text})}],temperature:0,max_tokens:config.maxOutputTokens||8192,stream:false};
  if(config.jsonMode!==false)body.response_format={type:'json_object'};
  if(config.id==='deepseek')body.thinking={type:'disabled'};
  if(config.id==='aliyun')body.enable_thinking=false;
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.apiKey},body:JSON.stringify(body),signal:AbortSignal.timeout(config.timeoutSeconds*1000),redirect:'error'});
  requireValue(response.ok,response.status===401?'providerAuthentication':response.status===429?'providerRateLimited':'providerHttpError','模型服务请求失败，请核对配置或稍后显式重试。');
  const reader=response.body.getReader(),buffers=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8*1024*1024){await reader.cancel();requireValue(false,'responseTooLarge');}buffers.push(value);}
  const data=parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(buffers))),usage=data.usage||{};
  const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
  log.promptTokens=count(usage.prompt_tokens);log.completionTokens=count(usage.completion_tokens);
  log.cachedTokens=count(usage.prompt_tokens_details?.cached_tokens)??count(usage.prompt_cache_hit_tokens);
  if(log.promptTokens!==null&&log.cachedTokens>log.promptTokens)log.cachedTokens=null;
  log.totalTokens=count(usage.total_tokens);log.providerRequestId=typeof data.id==='string'?data.id.slice(0,200):null;log.resolvedModel=typeof data.model==='string'?data.model.slice(0,120):null;
  requireValue(data.choices?.[0]?.finish_reason==='stop','incompleteCompletion','模型未完整生成，未自动重发。');
  const content=data.choices[0].message?.content;requireValue(typeof content==='string'&&content.length,'emptyCompletion');
  let payload;try{payload=parseStrictJson(content);}catch{requireValue(false,'invalidJson','模型结果不是完整 JSON。');}
  requireValue(payload&&typeof payload==='object'&&!Array.isArray(payload),'invalidJson');
  log.state='success';return {payload,log};
 }catch(error){log.state='failed';log.errorCode=error.name==='TimeoutError'?'providerTimeout':error.code||'providerUnavailable';throw Object.assign(new Error('模型调用未完成；没有自动重试。'),{code:log.errorCode,log});}
 finally{log.finishedAt=new Date().toISOString();log.durationMs=Math.round(performance.now()-start);await atomicJson(logPath,log);}
}
export async function recordCacheHit(config,tasks,jobId,text){const id=randomUUID();await atomicJson(resolve(runtimeRoot,'model-logs',id+'.json'),{id,jobId,provider:config.id,model:config.model,tasks,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),state:'success',cache:'local',inputCodePoints:Array.from(text).length,promptTokens:0,completionTokens:0,cachedTokens:0,totalTokens:0,durationMs:0,promptVersion});}
export function cacheIdentity(config,text){return hash(JSON.stringify(['source-contract-2.2',config.id,config.baseUrl,hash(config.apiKey),config.model,config.jsonMode,config.maxOutputTokens||8192,promptVersion,hash(systemPrompt),hash(text)]));}
