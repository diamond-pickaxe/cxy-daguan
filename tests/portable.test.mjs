import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,copyFile,rm} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {request} from 'node:http';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const protectedRoot='d:\\desktop\\文档\\secret';if(root.toLowerCase()===protectedRoot||root.toLowerCase().startsWith(protectedRoot+'\\'))throw Error('Protected path');

test('Original site icons match the recorded source, and attribution is included',async()=>{
 const source=JSON.parse(await readFile(resolve(root,'launcher/icon-source.json'),'utf8'));
 assert.equal(source.originalAuthor,'潇澄宇');assert.equal(source.site,'https://cxyonly.fans/');
 for(const item of source.icons){const bytes=await readFile(resolve(root,item.file));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.ok(bytes.readUInt32BE(16)<=256);}
 const readme=await readFile(resolve(root,'README.md'),'utf8');assert.ok(readme.includes('原作者：潇澄宇'));assert.ok(readme.includes('https://cxyonly.fans/'));assert.ok(readme.includes('无需安装 Node.js'));
});

test('Launcher protocol chooses a free port and finishes an in-flight save before exiting',async()=>{
 const fixture=await mkdtemp(resolve(root,'tests/.server-portable-'));let child;
 try{
  await copyFile(resolve(root,'server.mjs'),resolve(fixture,'server.mjs'));await mkdir(resolve(fixture,'lib'),{recursive:true});await copyFile(resolve(root,'lib/cs408-store.mjs'),resolve(fixture,'lib/cs408-store.mjs'));await mkdir(resolve(fixture,'library'));await copyFile(resolve(root,'examples/demo-library.json'),resolve(fixture,'library/bundled-library.json'));
  child=spawn(process.execPath,[resolve(fixture,'server.mjs')],{cwd:root,env:{...process.env,EXAM_PORT:'0',EXAM_LAUNCHER:'1'},stdio:['pipe','pipe','pipe'],windowsHide:true});
  const exited=new Promise((ok,no)=>{child.once('exit',(code,signal)=>ok({code,signal}));child.once('error',no);});
  const origin=await new Promise((ok,no)=>{let output='';const timer=setTimeout(()=>no(Error('Readiness timeout')),10000);child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/YU_READY (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);ok(match[1]);}});child.once('error',no);});
  assert.notEqual(new URL(origin).port,'0');const old=await fetch(origin+'/api/progress');const etag=old.headers.get('etag');await old.text();
  const progress={version:1,records:{1:{note:'关闭窗口前的写入'}},history:[],targetDate:''};const body=JSON.stringify(progress);let finishUpload;
  const saved=new Promise((ok,no)=>{
   const req=request(origin+'/api/progress',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'If-Match':etag}},res=>{res.resume();res.once('end',()=>ok(res.statusCode));});req.once('error',no);req.write(body.slice(0,20));finishUpload=()=>req.end(body.slice(20));
  });
  // Let the PUT headers reach the server, then close while its body is still arriving.
  await new Promise(r=>setTimeout(r,80));child.stdin.end('shutdown\n');await new Promise(r=>setTimeout(r,80));assert.equal(child.exitCode,null);finishUpload();assert.equal(await saved,200);
  const result=await Promise.race([exited,new Promise((_,no)=>setTimeout(()=>no(Error('Shutdown timeout')),10000).unref())]);assert.equal(result.code,0);assert.equal(result.signal,null);
  assert.equal(JSON.parse(await readFile(resolve(fixture,'data/progress.json'),'utf8')).records[1].note,'关闭窗口前的写入');
  await assert.rejects(fetch(origin+'/api/progress'));
 }finally{if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}const target=resolve(fixture);if(!target.startsWith(resolve(root,'tests')+sep))throw Error('Unsafe cleanup');await rm(target,{recursive:true});}
});
