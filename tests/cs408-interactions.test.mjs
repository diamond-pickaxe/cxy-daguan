import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {JSDOM,VirtualConsole} from 'jsdom';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),blocked='d:\\desktop\\文档\\secret';
if(root.toLowerCase()===blocked||root.toLowerCase().startsWith(blocked+'\\'))throw Error('Protected');
const read=p=>readFile(resolve(root,p),'utf8');
const scripts=Object.fromEntries(await Promise.all(['data','seed','storage','app','replica'].map(async n=>[n,await read('public/408/'+n+'.js')])));
const html=await read('public/408/index.html'),box={window:{}};runInNewContext(scripts.data,box);runInNewContext(scripts.seed,box);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function boot(server={value:null,revision:0}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(html,{url:'http://127.0.0.1:3333/408/',runScripts:'outside-only',virtualConsole:vc}),w=dom.window;
 w.structuredClone=structuredClone;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};
 w.matchMedia=()=>({matches:false,addEventListener(){}});w.IntersectionObserver=class{observe(){}disconnect(){}};w.ResizeObserver=class{observe(){}disconnect(){}};
 w.HTMLDialogElement.prototype.show=function(){this.open=true};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.confirm=()=>true;
 w.fetch=async(url,options={})=>{
  if(options.method==='PUT'){assert.equal(options.headers['If-Match'],'"'+server.revision+'"');server.value=JSON.parse(options.body);server.revision++;}
  return {ok:true,status:200,headers:{get:()=>'"'+server.revision+'"'},json:async()=>structuredClone(server.value)};
 };
 w.OFFLINE_DATA=structuredClone(box.window.OFFLINE_DATA);w.OFFLINE_SEED=structuredClone(box.window.OFFLINE_SEED);
 for(const n of ['storage','app','replica'])w.eval(scripts[n]);
 for(let i=0;i<100&&!w.Yu408Replica;i++)await wait(10);assert.ok(w.Yu408Replica);await w.Yu408Store.idle();
 const d=w.document,click=selector=>{const el=d.querySelector(selector);assert.ok(el,selector);el.click();};
 const type=value=>{const el=d.querySelector('#replica408 [data-filter="type"]');el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
 return {dom,w,d,click,type,server,errors};
}
test('408 note, collection and review entries include their target despite stale filters; year starts clear filters',async()=>{
 const app=await boot();try{
  const {w,d,click,type}=app,s=w.Offline408.state;s.notes[800]='Test note';s.collections=[{id:'a',name:'A',ids:[800]}];s.mastery[800]=3;
  for(const page of ['notes','collections','statistics']){
   type('2');click('#replica408 [data-page="'+(page==='collections'?'notes':page)+'"]');
   if(page==='collections'){click('#replica408 [data-action="account"]');click('#r408-collections');}
   click('#replica408 [data-q="800"]');assert.ok(w.Yu408Replica.session.ids.includes(800));assert.equal(w.Yu408Replica.session.current,800);
   assert.ok(d.querySelector('[data-card="800"]'));assert.equal(d.querySelector('#replica408 [data-filter="type"]').value,'');
   click('[data-action="back"]');
  }
  type('2');click('[data-year="2026"]');click('#r408-dialog [data-confirm]');assert.equal(d.querySelector('[data-filter="type"]').value,'');assert.equal(w.Yu408Replica.session.ids.length,47);
  assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
});
test('408 choices immediately judge, reveal and persist; reopening a paper resets only temporary answers',async()=>{
 const server={value:null,revision:0};let app=await boot(server);
 try{
  const {w,d,click}=app;click('[data-year="2026"]');click('#r408-dialog [data-confirm]');
  const q=w.Offline408.byId.get(800),correct=String(q.answer).split('||')[0].trim(),wrong=['A','B','C','D'].find(a=>!String(q.answer).includes(a));
  click('[data-card="800"] [data-choice="'+wrong+'"]');
  assert.ok(d.querySelector('[data-card="800"] .cs-solution'));assert.match(d.querySelector('[data-card="800"] .cs-result').textContent,/回答错误/);
  await w.Yu408Store.idle();assert.equal(server.value.answers[800].correct,false);assert.equal(server.value.mastery[800],3);assert.equal(server.value.history[800].length,1);
  click('[data-card="800"] [data-choice="'+correct+'"]');await w.Yu408Store.idle();
  assert.match(d.querySelector('[data-card="800"] .cs-result').textContent,/回答正确/);assert.equal(server.value.answers[800].correct,true);assert.equal(server.value.mastery[800],1);assert.equal(server.value.history[800].length,2);
  click('[data-card="800"] [data-choice="'+correct+'"]');click('[data-answer="800"]');click('[data-answer="800"]');await w.Yu408Store.idle();assert.equal(server.value.history[800].length,2,'reveal toggles and same-choice double clicks do not invent attempts');
  w.Offline408.state.notes[800]='Keep note';click('[data-favorite="800"]');await w.Yu408Store.idle();
  click('[data-action="back"]');click('[data-year="2026"]');click('#r408-dialog [data-confirm]');
  assert.equal(d.querySelector('[data-card="800"] .cs-solution'),null);assert.equal(d.querySelector('[data-card="800"] .option-card.selected'),null);
  click('[data-answer="800"]');assert.equal(d.querySelector('[data-card="800"] .cs-result'),null,'previous answer must not be called this attempt');
  assert.equal(w.Offline408.state.notes[800],'Keep note');assert.equal(w.Offline408.state.history[800].length,2);
  click('[data-card="800"] [data-choice="'+correct+'"]');await w.Yu408Store.idle();assert.equal(server.value.history[800].length,3);
  assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
 app=await boot(server);try{assert.equal(app.w.Offline408.state.history[800].length,3);assert.equal(app.w.Offline408.state.notes[800],'Keep note');assert.ok(app.w.Offline408.state.collections.some(c=>c.ids.includes(800)));}finally{app.dom.window.close();}
});
test('408 collection selection removes only the chosen association and persists after reload',async()=>{
 const server={value:null,revision:0};let app=await boot(server);
 try{
  const {w,d,click}=app;w.Offline408.state.collections=[{id:'a',name:'A',ids:[800,801]},{id:'b',name:'B',ids:[800,802]}];click('[data-year="2026"]');click('#r408-dialog [data-confirm]');
  click('[data-favorite="800"]');d.querySelector('[data-collection-index="0"]').checked=false;click('#r408-dialog [data-close]');assert.ok(w.Offline408.state.collections[0].ids.includes(800),'cancel does not mutate');
  click('[data-favorite="800"]');d.querySelector('[data-collection-index="0"]').checked=false;click('#r408-dialog [data-confirm]');await w.Yu408Store.idle();
  assert.deepEqual(server.value.collections.map(c=>c.ids),[[801],[800,802]]);assert.equal(d.querySelector('[data-favorite="800"]').getAttribute('aria-pressed'),'true');assert.equal(d.activeElement.dataset.favorite,'800');
 }finally{app.dom.window.close();}
 app=await boot(server);try{assert.deepEqual(JSON.parse(JSON.stringify(app.w.Offline408.state.collections.map(c=>c.ids))),[[801],[800,802]]);}finally{app.dom.window.close();}
});
test('408 debounced search retains cursor and defers rerender while Chinese input is composing',async()=>{
 const app=await boot();try{
  const {w,d,click}=app;click('#replica408 [data-page="bank"]');let input=d.querySelector('#r408-search');input.focus();input.value='2026';input.setSelectionRange(2,2);input.dispatchEvent(new w.Event('input',{bubbles:true}));await wait(420);
  input=d.querySelector('#r408-search');assert.equal(d.activeElement,input);assert.equal(input.selectionStart,2);assert.equal(input.value,'2026');
  input.dispatchEvent(new w.CompositionEvent('compositionstart',{bubbles:true}));input.value='计算';input.dispatchEvent(new w.InputEvent('input',{bubbles:true,isComposing:true}));await wait(420);assert.equal(d.querySelector('#r408-search'),input);
  input.dispatchEvent(new w.CompositionEvent('compositionend',{bubbles:true,data:'计算'}));await wait(420);assert.equal(d.activeElement,d.querySelector('#r408-search'));assert.equal(d.activeElement.value,'计算');
  assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
});
