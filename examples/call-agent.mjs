/** Local original example: no supplier, credentials or remote request is needed. */
import { randomUUID } from 'node:crypto';
import { annotate } from '../agent/agent.js';
const text='林晓来到图书馆。她开始阅读。';
const result=await annotate({requestId:randomUUID(),revisionId:randomUUID(),text,tasks:['paragraphs']},null);
console.log(JSON.stringify(result,null,2));
