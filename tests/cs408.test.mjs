import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {JSDOM,VirtualConsole} from 'jsdom';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const blocked='d:\\desktop\\文档\\secret';if(root.toLowerCase()===blocked||root.toLowerCase().startsWith(blocked+'\\'))throw Error('Protected path');
const read=name=>readFile(resolve(root,name),'utf8');
const scripts=Object.fromEntries(await Promise.all(['data','seed','storage','app','replica'].map(async name=>[name,await read('public/408/'+name+'.js')])));
const box={window:{}};runInNewContext(scripts.data,box);runInNewContext(scripts.seed,box);

test('408 includes all 18 papers with embedded media, blank personal state and the original styles',async()=>{
 const snapshot=JSON.parse(await read('library/cs408-snapshot.json'));assert.equal(createHash('sha256').update(scripts.data).digest('hex'),snapshot.dataSha256);
 const data=box.window.OFFLINE_DATA;assert.equal(data.questions.length,846);for(let year=2009;year<=2026;year++)assert.equal(data.questions.filter(q=>q.year===year).length,47);
 for(const q of data.questions){for(const field of ['questionHtml','answerHtml','analysisHtml']){assert.ok(q[field]);assert.ok(!/\b(?:src|poster|xlink:href)\s*=\s*["'](?!data:|#)/i.test(q[field]));}for(const key of ['currentMastery','masteryHistory','isCollected'])assert.ok(!Object.hasOwn(q,key));}
 for(const field of ['mastery','notes','attempts','collections'])assert.equal(Object.keys(box.window.OFFLINE_SEED[field]).length,0);
 for(const name of ['Home','AppLayout','ExerciseView','MobileNavBar']){const css=await read('public/408/original/'+name+'.css');assert.ok(css.length>500);assert.ok(!/\[data-v-/.test(css));}
 const hub=await read('public/hub.html');assert.ok(hub.includes('href="/408/"')&&hub.includes('href="/math/#entrances"'));
});

test('The 408 overview, knowledge scope, question types, answers, notes and records work with file-backed storage',async()=>{
 const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error));let saved=null,revision=0;
 async function boot(){
  const dom=new JSDOM(await read('public/408/index.html'),{url:'http://127.0.0.1:34567/408/',runScripts:'outside-only',virtualConsole:console});const w=dom.window;
  w.structuredClone=structuredClone;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};w.matchMedia=()=>({matches:true,addEventListener(){}});w.IntersectionObserver=class{observe(){}disconnect(){}};w.ResizeObserver=class{observe(){}disconnect(){}};
  w.HTMLDialogElement.prototype.show=function(){this.open=true};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.confirm=()=>true;
  w.fetch=async(url,options={})=>{if(options.method==='PUT'){assert.equal(options.headers['If-Match'],'"'+revision+'"');saved=JSON.parse(options.body);revision++;}return{ok:true,status:200,headers:{get:()=>'"'+revision+'"'},json:async()=>structuredClone(saved)};};
  w.OFFLINE_DATA=structuredClone(box.window.OFFLINE_DATA);w.OFFLINE_SEED=structuredClone(box.window.OFFLINE_SEED);w.eval(scripts.storage);w.eval(scripts.app);w.eval(scripts.replica);for(let i=0;i<100&&!w.Yu408Replica;i++)await new Promise(r=>setTimeout(r,10));assert.ok(w.Yu408Replica);await w.Yu408Store.idle();return dom;
 }
 let dom=await boot();try{
  const w=dom.window,d=w.document,click=selector=>{const el=d.querySelector('#replica408 '+selector)||d.querySelector(selector);assert.ok(el,selector);el.click();};
  assert.equal(d.querySelectorAll('#replica408 .cells-grid .cell').length,846);assert.equal(w.Yu408Replica.page,'overview');assert.equal(Object.keys(saved.mastery).length,0);
  const filter=d.querySelector('#replica408 [data-filter="type"]');filter.value='2';filter.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(w.Yu408Replica.questions.length,126);
  click('[data-action="clear-scope"]');click('[data-knowledge="4"]');assert.ok(w.Yu408Replica.questions.length>0&&w.Yu408Replica.questions.length<846);click('[data-action="clear-scope"]');
  click('[data-year="2026"]');click('#r408-dialog [data-confirm]');assert.equal(w.Yu408Replica.session.ids.length,47);assert.equal(d.querySelectorAll('#replica408 .question-card').length,10);
  click('[data-card="800"] [data-choice="A"]');click('[data-answer="800"]');click('[data-card="800"] [data-mark="2"]');click('[data-note="800"]');const note=d.querySelector('[data-save-note="800"]');note.value='合并应用测试笔记';note.dispatchEvent(new w.Event('input',{bubbles:true}));click('[data-favorite="800"]');await w.Yu408Store.idle();assert.equal(saved.notes[800],'合并应用测试笔记');assert.equal(saved.mastery[800],2);assert.equal(saved.answers[800].answer,'A');assert.ok(saved.collections.some(c=>c.ids.includes(800)));
  const type=d.querySelector('#replica408 [data-filter="type"]');type.value='2';type.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(d.querySelectorAll('#replica408 .question-card').length,7);
  assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
 dom=await boot();try{assert.equal(dom.window.Offline408.state.notes[800],'合并应用测试笔记');assert.equal(dom.window.Offline408.state.mastery[800],2);assert.equal(dom.window.Yu408Replica.page,'overview');}finally{dom.window.close();}
});

test('Math and 408 save independently, reject conflicts, and restore records after a service restart on a new port',async()=>{
 const fixture=await mkdtemp(resolve(root,'tests/.server-combined-'));let child;
 async function start(){
  child=spawn(process.execPath,[resolve(fixture,'server.mjs')],{env:{...process.env,EXAM_PORT:'0',EXAM_LAUNCHER:'1'},stdio:['pipe','pipe','pipe'],windowsHide:true});
  return await new Promise((ok,no)=>{let output='';const timer=setTimeout(()=>no(Error('Server timeout')),10000);child.once('error',no);child.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/YU_READY (http:\/\/127\.0\.0\.1:\d+)/);if(m){clearTimeout(timer);ok(m[1]);}});});
 }
 async function stop(){const exited=new Promise(r=>child.once('exit',r));child.stdin.end('shutdown\n');assert.equal(await exited,0);}
 try{
  for(const dir of ['lib','library','public/408'])await mkdir(resolve(fixture,dir),{recursive:true});for(const file of ['server.mjs','lib/cs408-store.mjs','library/bundled-library.json','public/hub.html','public/index.html','public/408/index.html'])await copyFile(resolve(root,file),resolve(fixture,file));
  let origin=await start();assert.ok((await(await fetch(origin)).text()).includes('宇的大观本地版'));assert.ok((await(await fetch(origin+'/math/')).text()).includes('宇的数学大观离线版'));assert.ok((await(await fetch(origin+'/408/')).text()).includes('真题总览'));
  const initial=await fetch(origin+'/api/408/progress'),revision=initial.headers.get('etag');assert.equal(await initial.json(),null);
  const value={version:1,mastery:{800:2},notes:{800:'重启后保留'},attempts:{},history:{},answers:{},collections:[],lastId:800,updatedAt:null};
  const put=(data,match=revision,requestOrigin=origin)=>fetch(origin+'/api/408/progress',{method:'PUT',headers:{'Content-Type':'application/json',Origin:requestOrigin,...(match?{'If-Match':match}:{})},body:JSON.stringify(data)});
  assert.equal((await put(value,null)).status,428);assert.equal((await put(value,revision,'https://invalid.example')).status,403);assert.equal((await put({...value,mastery:{900:1}})).status,400);assert.equal((await put(value)).status,200);assert.equal((await put({...value,notes:{800:'冲突'}})).status,409);
  assert.deepEqual((await(await fetch(origin+'/api/progress')).json()).records,{});assert.equal((await fetch(origin+'/data/408/progress.json')).status,403);assert.equal((await fetch(origin+'/data/408/backups/previous.json')).status,403);const oldPort=new URL(origin).port;await stop();
  origin=await start();assert.equal((await(await fetch(origin+'/api/408/progress')).json()).notes[800],'重启后保留');assert.equal(JSON.parse(await readFile(resolve(fixture,'data/408/progress.json'))).mastery[800],2);assert.deepEqual((await(await fetch(origin+'/api/progress')).json()).records,{});assert.ok(oldPort&&new URL(origin).port);await stop();
 }finally{if(child&&child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}if(!fixture.startsWith(resolve(root,'tests')+sep))throw Error('Unsafe cleanup');await rm(fixture,{recursive:true});}
});
