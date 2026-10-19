import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,copyFile,rm,stat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {checkLibrary} from '../tools/check-library.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const protectedRoot='d:\\desktop\\文档\\secret';if(root.toLowerCase()===protectedRoot||root.toLowerCase().startsWith(protectedRoot+'\\'))throw Error('Protected path');
const snapshot=checkLibrary(root);

test('The complete snapshot and all 1,639 local images match their checksums and contain no user state',async()=>{
 const {seed,lock}=await snapshot;assert.equal(lock.questions,7083);assert.equal(lock.assets,1639);assert.equal(seed.manifest.complete,true);
 const assigned=new Set(Object.values(seed.subjectMembership.subjects).flatMap(s=>s.ids));assert.equal(seed.questions.filter(q=>!assigned.has(q.id)).length,494);
});

test('All three entrances and the unassigned question list render from the full corpus',async()=>{
 const {seed}=await snapshot;const elements=new Map([['#app',{innerHTML:''}],['#replica-dialog',{addEventListener(){},close(){}}],['#toast',{classList:{add(){},remove(){}}}]]);
 const context=vm.createContext({console,seed,Date,Map,Set,Number,String,Object,Array,JSON,Math,URL,Blob,setTimeout:()=>0,clearTimeout(){},requestAnimationFrame(){},location:{hash:'#entrances'},document:{querySelector:s=>elements.get(s)||null,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){},scrollTo(){}},matchMedia:()=>({matches:false}),IntersectionObserver:class{observe(){}disconnect(){}},fetch:async()=>({ok:true,headers:{get:()=>null}})});
 const read=file=>readFile(resolve(root,file),'utf8');const mod={exports:{}};vm.runInNewContext(await read('public/vendor/katex.min.js'),{module:mod,exports:mod.exports,console});context.katex=mod.exports;
 const app=await read('public/app.js');vm.runInContext(app.slice(0,app.indexOf('(async()=>{try{const paths=')),context);for(const file of ['public/subjects.js','public/replica.js'])vm.runInContext(await read(file),context);
 const run=script=>vm.runInContext(script,context);run('questions=seed.questions;categories=seed.categories;manifest=seed.manifest;subjectMembership=seed.subjectMembership;assetMap=seed.assetMap;walk(categories);render();');assert.ok(elements.get('#app').innerHTML.includes('href="#unassigned"'));assert.ok(elements.get('#app').innerHTML.includes('/brand.png'));assert.ok(!elements.get('#app').innerHTML.includes('/brand.svg'));
 for(const [code,count]of [['math_1',5959],['math_2',4943],['math_3',5109]]){context.location.hash='#'+code+'/home';assert.equal(run('rSubjectQuestions().length'),count);run('render()');assert.ok(elements.get('#app').innerHTML.includes('离线版'));}
 context.location.hash='#unassigned';run('render()');assert.equal(run('rCurrentList.length'),494);assert.ok(elements.get('#app').innerHTML.includes('r-question-card'));
 const id=run('rCurrentList[0].id');context.location.hash='#question/'+id;run('render()');assert.ok(elements.get('#app').innerHTML.includes('id="r-q-'+id+'"'));
});

test('A fresh full-library launch serves all questions and local media without exposing the seed or private files',async()=>{
 const {seed}=await snapshot;const fixture=await mkdtemp(resolve(root,'tests/.server-bundled-'));let child;
 try{
  await copyFile(resolve(root,'server.mjs'),resolve(fixture,'server.mjs'));await mkdir(resolve(fixture,'lib'),{recursive:true});await copyFile(resolve(root,'lib/cs408-store.mjs'),resolve(fixture,'lib/cs408-store.mjs'));await mkdir(resolve(fixture,'library'));await copyFile(resolve(root,'library/bundled-library.json'),resolve(fixture,'library/bundled-library.json'));await mkdir(resolve(fixture,'public/assets/media'),{recursive:true});
  const imageUrl=Object.values(seed.assetMap)[0];await copyFile(resolve(root,'public','.'+imageUrl),resolve(fixture,'public','.'+imageUrl));
  child=spawn(process.execPath,[resolve(fixture,'server.mjs')],{env:{...process.env,EXAM_PORT:'0',EXAM_LAUNCHER:'1'},stdio:['pipe','pipe','pipe'],windowsHide:true});const exited=new Promise(r=>child.once('exit',r));
  const origin=await new Promise((ok,no)=>{let output='';const timer=setTimeout(()=>no(Error('Startup timeout')),10000);child.once('error',no);child.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/YU_READY (http:\/\/127\.0\.0\.1:\d+)/);if(m){clearTimeout(timer);ok(m[1]);}});});
  const qs=await(await fetch(origin+'/data/questions.json')).json();assert.equal(qs.length,7083);assert.equal(qs[0].user_state,undefined);const membership=await(await fetch(origin+'/assets/subject-membership.json')).json();assert.equal(membership.subjects.math_2.ids.length,4943);
  const picture=Buffer.from(await(await fetch(origin+imageUrl)).arrayBuffer());assert.equal(createHash('sha256').update(picture).digest('hex'),imageUrl.match(/[a-f0-9]{64}/)[0]);assert.equal((await fetch(origin+'/library/bundled-library.json')).status,404);assert.equal((await fetch(origin+'/data/progress.json')).status,403);assert.deepEqual((await(await fetch(origin+'/api/progress')).json()).records,{});
  await assert.rejects(stat(resolve(fixture,'data/progress.json')),{code:'ENOENT'});child.stdin.end('shutdown\n');assert.equal(await exited,0);
 }finally{if(child&&child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}if(!fixture.startsWith(resolve(root,'tests')+sep))throw Error('Unsafe cleanup');await rm(fixture,{recursive:true});}
});
