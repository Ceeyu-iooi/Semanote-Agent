import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
test('separate bridge processes serialize one cache key and reuse its publication',async()=>{
 const root=resolve('profile/verification/cache-lock-tests');await mkdir(root,{recursive:true});const dir=await mkdtemp(resolve(root,'run-'));
 try{const module=pathToFileURL(resolve('agent/cacheLock.js')).href;
 const code=`import {lockCache} from ${JSON.stringify(module)};import {existsSync} from 'node:fs';import {writeFile,appendFile} from 'node:fs/promises';const p=process.argv[1];const release=await lockCache(p,5000);try{if(!existsSync(p)){await appendFile(p+'.calls','call\\n');await new Promise(r=>setTimeout(r,120));await writeFile(p,'validated');}}finally{await release();}`;
 const run=()=>new Promise((done,fail)=>{const child=spawn(process.execPath,['--input-type=module','-e',code,resolve(dir,'cache.json')],{windowsHide:true,stdio:'ignore'});child.on('error',fail);child.on('exit',code=>code===0?done():fail(Error('Child failed')));});
 await Promise.all([run(),run()]);assert.equal(await readFile(resolve(dir,'cache.json.calls'),'utf8'),'call\n');
 }finally{assert.ok(dir.startsWith(root+sep));await rm(dir,{recursive:true});}
});
