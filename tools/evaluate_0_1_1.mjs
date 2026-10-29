/** Explicit synthetic evaluation; never reads or sends the private CSV. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { annotate } from '../agent/agent.js';
import { taskTypes, validateResponse } from '../agent/contract.js';
import { generate } from '../agent/provider.js';

const examples=[
 {name:'实体、关系与事件',text:'2026年4月12日，林晓在杭州的向日葵书店支付120元购买图书。因为喜欢阅读，林晓第二天向同学陈明推荐这家书店。陈明说：“服务很好，我很满意！”'},
 {name:'情感与意图',text:'新书的装帧很精美，我非常喜欢。包裹破损让我很失望。书店位于城市中心。请帮我查一下营业时间。明天还有读书活动吗？我保证准时参加。'},
 {name:'列举与语义分段',text:'本次活动安排如下：第一，上午九点在图书馆签到；第二，十点开展读书分享；第三，下午两点交换书籍。请携带自己的书。总之，希望大家通过交流发现新的阅读方向。'},
 {name:'语法、用词与错别字',text:'今天天汽很好。我们在图书馆认真的学习。通过这次活动，使大家收获很多。我把书籍放回原处，明天继续阅读。'},
 {name:'重复与码点',text:'林晓在杭州遇见陈明。陈明说：“你好😀！”\r\n林晓又在杭州看见向日葵书店，随后与陈明一起购书。书店发布通知：“请在18:00前归还图书。”'},
 {name:'长文与分块',text:Array.from({length:18},(_,i)=>`第${i+1}项活动：林晓与陈明在杭州图书馆阅读并交流。因为活动安排合理，两人十分满意。下午林晓支付20元购买新书，随后回家。`).join('\n')},
 {name:'无实体与混合情绪',text:'这段说明介绍如何阅读：先浏览目录，再记录问题，最后整理笔记。这样的安排很方便，不过过多重复会令人厌烦。请保持原文不变，并独立记录阅读心得。'},
 {name:'事件时间与因果',text:'2026年5月1日，晨星公司在苏州举办读书会。由于下雨，活动从公园移至图书馆。上午九点，负责人李晨宣布活动开始。下午三点，参会者完成交流，活动圆满结束。'}
];
const round=Number(process.argv[process.argv.indexOf('--round')+1]);if(!Number.isInteger(round)||round<1||round>8)throw new Error('Use --round 1..8');
const replay=process.argv.includes('--replay');
const settings=JSON.parse(await readFile('profile/runtime/model-providers.json','utf8')),config=settings.providers.find(item=>item.id==='aliyun');
const example=examples[round-1],request={requestId:randomUUID(),revisionId:randomUUID(),text:example.text,tasks:taskTypes};
await mkdir('profile/verification/0.1.1',{recursive:true});
let call=0;
const providerCall=async(...arguments_)=>{const index=++call;if(replay)return {payload:JSON.parse(await readFile(`profile/verification/0.1.1/round-${round}-candidate-${index}.json`,'utf8')),log:{}};const reply=await generate(...arguments_);await writeFile(`profile/verification/0.1.1/round-${round}-candidate-${index}.json`,JSON.stringify(reply.payload));return reply;};
const first=await annotate(request,config,{providerCall,useCache:!replay});validateResponse(request,first);
const repeatedRequest={...request,requestId:randomUUID()},repeated=replay?null:await annotate(repeatedRequest,config);if(repeated)validateResponse(repeatedRequest,repeated);
const receipt={round,name:example.name,synthetic:true,offlineReplay:replay,actualNetworkCalls:replay?0:first.execution.networkCalls+(repeated?.execution.networkCalls||0),first,repeated,checks:{responseValid:true,sourcePreserved:repeated?first.textHash===repeated.textHash:true,cacheNoNetwork:repeated?repeated.execution.networkCalls===0:null,allLayers:first.status==='success'}};
await mkdir('profile/verification/0.1.1',{recursive:true});await writeFile(`profile/verification/0.1.1/${replay?'replay-':''}round-${round}.json`,JSON.stringify(receipt,null,2));
console.log(JSON.stringify({round,name:example.name,offlineReplay:replay,actualNetworkCalls:receipt.actualNetworkCalls,status:first.status,failures:Object.fromEntries(Object.entries(first.layers).filter(([,layer])=>layer.error).map(([task,layer])=>[task,layer.error.code])),items:Object.fromEntries(Object.entries(first.layers).map(([task,layer])=>[task,layer.result?.items.length??null])),first:replay?{fixtureCalls:call,durationMs:first.execution.durationMs}:first.execution,repeat:repeated?.execution,checks:receipt.checks}));
