import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM,VirtualConsole} from 'jsdom';
import {runInContext} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const blocked='d:\\desktop\\文档\\secret';
if(root.toLowerCase()===blocked||root.toLowerCase().startsWith(blocked+'\\'))throw Error('Protected path');
const read=name=>readFile(resolve(root,name),'utf8');
const scripts=await Promise.all(['app','subjects','replica'].map(name=>read('public/'+name+'.js')));
const html=await read('public/index.html');
const leaf={id:331,name:'极限的计算',parent_id:329,children:[]};
const categories=[{id:223,name:'高等数学',parent_id:null,children:[{id:321,name:'极限',parent_id:223,children:[{id:329,name:'极限方法',parent_id:321,children:[leaf,{id:332,name:'非真题专题',parent_id:329,children:[]}]}]}]}];
const questions=Array.from({length:201},(_,i)=>({id:i+1,stem:'计算极限 '+(i+1),source_tags:i<100?['2020年真题']:[],category_id:i<100?331:332,category_ids:i<100?[331,329]:[332],exam_subjects:i===200?['math_1']:['math_1','math_2'],source:i<100?'2020年·数二':'模拟题'}));

async function boot(initial={version:1,records:{},history:[],targetDate:''},corpus={questions,categories}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(html,{url:'http://127.0.0.1:12345/math/#math_2/home',runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window;let saved=structuredClone(initial),revision=0;
 w.scrollTo=()=>{};w.requestAnimationFrame=fn=>fn();w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.matchMedia=()=>({matches:false});w.IntersectionObserver=class{observe(){}disconnect(){}};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.fetch=async(url,options={})=>{
  if(options.method==='PUT'){assert.equal(options.headers['If-Match'],'"'+revision+'"');saved=JSON.parse(options.body);revision++;}
  const values={'/data/questions.json':corpus.questions,'/data/categories.json':corpus.categories,'/data/manifest.json':{},'/api/progress':saved,'/assets/map.json':{},'/assets/subject-membership.json':corpus.subjectMembership||null};
  return {ok:true,status:200,headers:{get:()=>'"'+revision+'"'},json:async()=>structuredClone(values[url])};
 };
 const run=script=>runInContext(script,dom.getInternalVMContext());
 for(const script of scripts)run(script);
 for(let i=0;i<100&&!w.document.querySelector('[data-category="321"]');i++)await new Promise(r=>setTimeout(r,10));
 assert.ok(w.document.querySelector('[data-category="321"]'),'chapter should render');
 const click=selector=>{const el=w.document.querySelector(selector);assert.ok(el,selector);el.click();};
 return {dom,w,run,click,errors,get saved(){return saved;}};
}

test('Chapter labels expand in place; independent marks, scope and expansion survive save/reload',async()=>{
 let app=await boot();let saved;
 try{
  const {w,click,run}=app,d=w.document,hash=w.location.hash;
  assert.equal(d.querySelectorAll('.r-scope button').length,2);assert.ok(!d.body.textContent.includes('严选'));
  assert.equal(d.querySelector('[data-r="tree"][data-id="321"]').getAttribute('aria-expanded'),'false');
  click('[data-r="tree"][data-id="321"]');assert.equal(w.location.hash,hash);
  assert.ok(d.querySelector('[data-category="329"]'));
  click('[data-r="learned"][data-id="321"]');assert.equal(w.location.hash,hash);
  assert.equal(d.querySelector('[data-r="tree"][data-id="321"]').getAttribute('aria-expanded'),'true');
  assert.equal(d.querySelector('[data-r="learned"][data-id="321"]').getAttribute('aria-pressed'),'true');
  assert.equal(d.querySelector('[data-r="learned"][data-id="223"]').getAttribute('aria-pressed'),'false');
  click('[data-r="tree"][data-id="329"]');
  assert.equal(d.querySelector('[data-category="331"] a').getAttribute('href'),'#math_2/practice/331');
  click('[data-r="scope"][data-value="nonexam"]');
  assert.equal(d.querySelector('[data-category="321"] small').textContent,'0/100');
  assert.ok(d.querySelector('[data-r="learned"][data-id="331"]').classList.contains('empty'));
  await run('flushSave()');saved=structuredClone(app.saved);assert.equal(saved.mathDirectory.learned[321],true);
  assert.equal(saved.mathDirectory.expanded['math_2/321'],true);assert.equal(saved.mathDirectory.scope,'nonexam');
  assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
 app=await boot(saved);
 try{
  assert.equal(app.w.document.querySelector('[data-r="learned"][data-id="321"]').getAttribute('aria-pressed'),'true');
  assert.ok(app.w.document.querySelector('[data-category="331"]'));
  app.click('[data-r="learned"][data-id="321"]');await app.run('flushSave()');assert.equal(app.saved.mathDirectory.learned[321],false);
  assert.equal(app.saved.mathDirectory.expanded['math_2/321'],true);
 }finally{app.dom.window.close();}
});

test('Progress boundaries count unique questions and latest outcomes, independently of manual marks',async()=>{
 const app=await boot();
 try{
  const {run}=app;
  function stats(done,wrong=false){return JSON.parse(run(`state.records={};state.history=Array.from({length:${done}},(_,i)=>({id:i+1,mastery:${wrong}&&i===0?'wrong':'mastered',day:'2026-10-19',at:'2026-10-19T01:00:00Z'}));rKnowledgeCache=null;JSON.stringify(rKnowledgeStats(categoryIndex.get('321')))`));}
  for(const [done,color]of [[0,'red'],[39,'red'],[40,'yellow'],[69,'yellow'],[70,'green'],[80,'green'],[81,'blue'],[100,'blue']]){
   const p=stats(done);assert.equal(p.color,color,done+'%');assert.equal(p.done,done);assert.equal(p.total,100);
  }
  assert.equal(stats(81,true).color,'green');
  run(`state.history.push({id:1,mastery:'mastered',day:'2026-10-19',at:'2026-10-19T02:00:00Z'});rKnowledgeCache=null`);
  assert.equal(run("rKnowledgeStats(categoryIndex.get('321')).color"),'blue');
  assert.equal(run("rKnowledgeStats(categoryIndex.get('321')).done"),81,'repeated attempt is not another completed question');
  run(`state.history.push({id:1,mastery:'wrong',day:'2026-10-18',at:'2026-10-18T02:00:00Z'});rKnowledgeCache=null`);
  assert.equal(run("rKnowledgeStats(categoryIndex.get('321')).color"),'blue','older imported attempt must not replace latest');
  run(`state.mathDirectory={learned:{321:true}};rKnowledgeCache=null`);
  assert.equal(run("rKnowledgeStats(categoryIndex.get('321')).color"),'blue');
  run(`state.history=[];state.records={1:{mastery:'wrong'},2:{mastery:'mastered'}};rKnowledgeCache=null`);
  assert.equal(run("rKnowledgeStats(categoryIndex.get('321')).done"),2,'old record-only backups remain usable');
  run(`state.history=[{id:1,mastery:'mastered',at:'2026-10-19T02:00:00Z'}];state.records={1:{mastery:'not_started'}};rKnowledgeCache=null`);
  assert.equal(run("rKnowledgeStats(categoryIndex.get('321')).done"),1,'resetting a mastery tag does not erase attempt history');
 }finally{app.dom.window.close();}
});

test('Practice and mobile chapter dialogs use the same expandable controls and aggregate chapter questions',async()=>{
 const app=await boot();
 try{
  const {run,click,w}=app;
  w.location.hash='#math_2/practice/321';run('render()');assert.equal(run('rCurrentList.length'),100);
  assert.ok(w.document.querySelector('#r-directory [data-r="learned"]'));
  run('rChapterDialog()');
  click('#replica-dialog [data-r="tree"][data-id="321"]');
  assert.equal(w.document.querySelector('#replica-dialog [data-r="tree"][data-id="321"]').getAttribute('aria-expanded'),'false');
  click('#replica-dialog [data-r="learned"][data-id="321"]');
  assert.equal(w.document.querySelector('#replica-dialog [data-r="learned"][data-id="321"]').getAttribute('aria-pressed'),'true');
  assert.ok(w.document.querySelector('#replica-dialog').open);assert.equal(w.location.hash,'#math_2/practice/321');
  click('#replica-dialog [data-r="scope"][data-value="nonexam"]');assert.equal(run('rCurrentList.length'),100);
  assert.equal(w.document.querySelector('#replica-dialog [data-value="nonexam"]').getAttribute('aria-checked'),'true');
  assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
});

test('The real corpus exposes the full limit chapter and truthfully partitions exam/non-exam questions',async()=>{
 const corpus=JSON.parse(await read('library/bundled-library.json'));
 const app=await boot(undefined,corpus);
 try{
  const {run,click,w}=app;
  click('[data-r="tree"][data-id="321"]');assert.ok(w.document.querySelector('[data-category="327"]'));
  assert.ok(w.document.querySelector('[data-category="329"]'));
  for(const code of ['math_1','math_2','math_3']){
   w.location.hash='#'+code+'/home';run('render()');
   assert.equal(!!w.document.querySelector('[data-category="8"]'),code==='math_1','math-one-only directory is restricted');
   assert.ok(run("[...document.querySelectorAll('[data-category]')].every(el=>rCategoryAllowed(categoryIndex.get(el.dataset.category)))"));
   const all=run('rSubjectQuestions().length');const exams=run("rScope='exam';rScopeQuestions(questions).length");
   const other=run("rScope='nonexam';rScopeQuestions(questions).length");assert.equal(exams+other,all);assert.ok(exams>0&&other>0);
  }
  w.location.hash='#math_2/home';run("rScope='exam';render()");
  assert.ok(run('rSubjectQuestions().some(q=>q.id===941)'),'shared exam question remains in math two');
  assert.equal(run("rCategoryQuestions(categoryIndex.get('8')).length"),0);
  assert.equal(run("rCategoryQuestions(categoryIndex.get('2764')).length"),0);
  assert.equal(run('rQuestionCategory(questions.find(q=>q.id===941)).id'),2495,'use the math-two paper association');
  run('practice(941)');assert.ok(run('rCurrentList.some(q=>q.id===941)'));
  assert.deepEqual(app.errors,[]);
 }finally{app.dom.window.close();}
});
