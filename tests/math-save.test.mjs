import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInContext} from 'node:vm';
import {JSDOM,VirtualConsole} from 'jsdom';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),blocked='d:\\desktop\\文档\\secret';
if(root.toLowerCase()===blocked||root.toLowerCase().startsWith(blocked+'\\'))throw Error('Protected');
const source=await readFile(resolve(root,'public/app.js'),'utf8');
const blank=()=>({version:1,records:{},history:[],targetDate:''});
const wait=()=>new Promise(r=>setTimeout(r,0));
async function boot(server={value:blank(),revision:0},draft=null){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM('<div id="app"></div><div id="toast"></div><span class="save-status"></span><input id="import-file"><a href="/" id="home">首页</a>',{url:'http://127.0.0.1:3333/math/',runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window,requests=[];w.scrollTo=()=>{};
 if(draft)w.sessionStorage.setItem('cxy-daguan-math-pending-v1',draft);
 w.fetch=async(url,options={})=>{
  if(options.method==='PUT'){
   const ok=options.headers['If-Match']==='"'+server.revision+'"';
   requests.push({body:JSON.parse(options.body),keepalive:!!options.keepalive,ok});
   if(ok){server.value=JSON.parse(options.body);server.revision++;}
   const revision=server.revision;return {ok,status:ok?200:409,headers:{get:()=>'"'+revision+'"'}};
  }
  const values={'/data/questions.json':[], '/data/categories.json':[], '/data/manifest.json':{},'/api/progress':server.value,'/assets/map.json':{},'/assets/subject-membership.json':null};
  return {ok:true,headers:{get:()=>'"'+server.revision+'"'},json:async()=>structuredClone(values[url])};
 };
 const run=s=>runInContext(s,dom.getInternalVMContext());run(source);run('render=()=>{}');
 for(let i=0;i<100&&!run('saveReady');i++)await wait();assert.ok(run('saveReady'));
 return {dom,w,run,server,requests,errors};
}
test('Math exit flush waits for the previous ETag and saves the latest edit without a parallel PUT',async()=>{
 const app=await boot();try{
  let release;const gate=new Promise(r=>release=r),fetch=app.w.fetch;
  app.w.fetch=async(url,options={})=>{const result=await fetch(url,options);if(options.method==='PUT'&&JSON.parse(options.body).records[1]?.note==='A')await gate;return result;};
  app.run("patchRecord(1,{note:'A'})");const first=app.run('flushSave()');await wait();
  app.run("patchRecord(1,{note:'B'})");const leaving=new app.w.Event('beforeunload',{cancelable:true});app.w.dispatchEvent(leaving);assert.ok(leaving.defaultPrevented);
  app.w.dispatchEvent(new app.w.Event('pagehide'));await wait();assert.equal(app.requests.length,1);
  assert.equal(JSON.parse(JSON.parse(app.w.sessionStorage.getItem('cxy-daguan-math-pending-v1')).body).records[1].note,'B');
  release();await first;await app.run('saveQueue');await wait();
  assert.deepEqual(app.requests.map(r=>[r.body.records[1].note,r.ok]),[['A',true],['B',true]]);
  assert.equal(app.server.value.records[1].note,'B');assert.equal(app.run('hasUnsavedProgress()'),false);
  assert.equal(app.w.sessionStorage.getItem('cxy-daguan-math-pending-v1'),null);
 }finally{app.dom.window.close();}
});
test('Math large edits use ordinary requests and navigation drains subsequent edits; other-window conflicts remain protected',async()=>{
 const app=await boot();try{
  app.run("patchRecord(1,{note:'大'.repeat(80000)})");await app.run('flushSave({leaving:true})');
  assert.equal(app.requests[0].keepalive,false);assert.equal(app.server.value.records[1].note.length,80000);
  let release;const gate=new Promise(r=>release=r),fetch=app.w.fetch;
  app.w.fetch=async(url,options={})=>{const result=await fetch(url,options);if(options.method==='PUT'&&JSON.parse(options.body).records[1].note==='C')await gate;return result;};
  app.run("patchRecord(1,{note:'C'})");const navigate=app.run('saveBeforeNavigation()');await wait();
  app.run("patchRecord(1,{note:'D'})");release();assert.equal(await navigate,true);assert.equal(app.server.value.records[1].note,'D');
  app.server.revision++;app.server.value.records[1].note='other window';app.run("patchRecord(1,{note:'local edit'})");
  assert.equal(await app.run('saveBeforeNavigation()'),false);assert.equal(app.server.value.records[1].note,'other window');
  const event=new app.w.MouseEvent('click',{bubbles:true,cancelable:true});app.w.document.querySelector('#home').dispatchEvent(event);assert.ok(event.defaultPrevented);await wait();
  assert.match(app.w.document.querySelector('.save-status').textContent,/另一窗口/);
  app.w.confirm=()=>false;assert.equal(await app.run('reloadSavedProgress()'),false);assert.equal(app.run('state.records[1].note'),'local edit');
  app.w.confirm=()=>true;assert.equal(await app.run('reloadSavedProgress()'),true);assert.equal(app.run('state.records[1].note'),'other window');
  assert.equal(app.run('saveConflict'),false);assert.equal(app.w.sessionStorage.getItem('cxy-daguan-math-pending-v1'),null);
 }finally{app.dom.window.close();}
});
test('Reload recovers a pending tab draft and keeps conflicting drafts blocked on repeated reloads',async()=>{
 const server={value:blank(),revision:0};let app=await boot(server),draft;
 app.run("patchRecord(1,{note:'pending reload'})");draft=app.w.sessionStorage.getItem('cxy-daguan-math-pending-v1');app.dom.window.close();
 app=await boot(server,draft);assert.equal(app.run('state.records[1].note'),'pending reload');await app.run('flushSave()');assert.equal(server.value.records[1].note,'pending reload');app.dom.window.close();
 const conflicting=JSON.stringify({body:JSON.stringify({...blank(),records:{1:{note:'local recovery'}}}),baseBody:JSON.stringify(blank()),revision:'"0"'});
 server.value.records[1].note='another window';server.revision++;
 for(let i=0;i<2;i++){
  app=await boot(server,i?draft:conflicting);assert.equal(app.run('state.records[1].note'),'local recovery');assert.equal(await app.run('flushSave()'),false);
  assert.equal(server.value.records[1].note,'another window');draft=app.w.sessionStorage.getItem('cxy-daguan-math-pending-v1');app.dom.window.close();
 }
});
