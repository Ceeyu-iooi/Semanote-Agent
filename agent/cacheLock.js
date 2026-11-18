/** Serialize same-key cache publication across bridge processes; never retries inference. */
import { open, mkdir, readFile, unlink, rmdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export async function lockCache(path, timeoutMs) {
  const lockPath=path+'.lock', token=randomUUID(), started=Date.now();
  await mkdir(dirname(path),{recursive:true});
  for (;;) {
    try {
      const file=await open(lockPath,'wx',0o600);
      await file.writeFile(JSON.stringify({pid:process.pid,token}));
      return async()=>{await file.close();try{const owner=JSON.parse(await readFile(lockPath,'utf8'));if(owner.token===token)await unlink(lockPath);}catch(e){if(e.code!=='ENOENT')throw e;}};
    } catch(error) {
      if(error.code!=='EEXIST')throw error;
      // Reclaimers serialize too: a second waiter must not unlink a newly acquired lock.
      let reclaiming=false;
      try {
        await mkdir(lockPath+'.reclaim'); reclaiming=true;
        const owner=JSON.parse(await readFile(lockPath,'utf8'));
        if(Number.isInteger(owner.pid)&&owner.pid>0){
          let alive=true;try{process.kill(owner.pid,0);}catch(e){alive=e.code!=='ESRCH';}
          if(!alive)await unlink(lockPath);
        }
      }catch(e){if(!['EEXIST','ENOENT'].includes(e.code)&&!(e instanceof SyntaxError))throw e;}
      finally{if(reclaiming)await rmdir(lockPath+'.reclaim');}
      if(Date.now()-started>timeoutMs){const error=new Error('缓存正在由其他任务处理，请稍后重试。');error.code='cacheBusy';throw error;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
  }
}
