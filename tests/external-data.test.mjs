import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,mkdtemp,readdir,rm,chmod,stat} from 'node:fs/promises';
import {resolve,dirname,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const blocked='d:\\desktop\\文档\\secret';if(root.toLowerCase()===blocked||root.toLowerCase().startsWith(blocked+'\\'))throw Error('Protected path');

test('A read-only app uses external data for both systems and survives restart and library import',async()=>{
 const fixture=await mkdtemp(resolve(root,'tests/.server-external-')),app=join(fixture,'App resources with spaces'),data=join(fixture,'Application Support','cxy-daguan');let child;
 const fingerprint=async()=>{const files={};async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const p=join(dir,item.name);if(item.isDirectory())await walk(p);else files[p.slice(app.length)]=createHash('sha256').update(await readFile(p)).digest('hex');}}await walk(app);return files;};
 async function start(){child=spawn(process.execPath,[join(app,'server.mjs')],{cwd:fixture,env:{...process.env,EXAM_PORT:'0',EXAM_LAUNCHER:'1',EXAM_DATA_DIR:data},stdio:['pipe','pipe','pipe'],windowsHide:true});return await new Promise((ok,no)=>{let output='',errors='';const timer=setTimeout(()=>no(Error('Start timeout '+errors)),10000);child.once('error',no);child.stderr.on('data',b=>errors+=b);child.once('exit',code=>{if(code){clearTimeout(timer);no(Error(errors));}});child.stdout.on('data',b=>{output+=b;const match=output.match(/YU_READY (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);ok(match[1]);}});});}
 async function stop(){const exited=new Promise(r=>child.once('exit',r));child.stdin.end('shutdown\n');assert.equal(await exited,0);}
 try{
  for(const dir of ['lib','library','public'])await mkdir(join(app,dir),{recursive:true});
  for(const file of ['server.mjs','lib/cs408-store.mjs'])await copyFile(join(root,file),join(app,file));
  const library=JSON.parse(await readFile(join(root,'examples/demo-library.json'),'utf8'));
  await writeFile(join(app,'library/bundled-library.json'),JSON.stringify(library));await writeFile(join(app,'public/hub.html'),'<h1>offline</h1>');
  const before=await fingerprint();
  if(process.platform!=='win32')for(const dir of ['lib','library','public',''])await chmod(join(app,dir),0o555);
  let origin=await start();
  const math={version:1,records:{1:{note:'external math record'}},history:[],targetDate:'',mathDirectory:{learned:{1:true}}};
  const cs={version:1,mastery:{800:1},notes:{800:'external 408 record'},attempts:{},history:{},answers:{},collections:[]};
  for(const [route,body]of [['/api/progress',math],['/api/408/progress',cs]]){const old=await fetch(origin+route);const saved=await fetch(origin+route,{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json','If-Match':old.headers.get('etag')},body:JSON.stringify(body)});assert.equal(saved.status,200);}
  assert.equal((await fetch(origin+'/data/progress.json')).status,403);assert.equal((await fetch(origin+'/data/408/progress.json')).status,403);
  const imported={...library,questions:[{...library.questions[0],id:1001,exam_subjects:['math_2']}]};delete imported.subjectMembership;
  assert.equal((await fetch(origin+'/api/library',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(imported)})).status,200);
  assert.deepEqual((await(await fetch(origin+'/assets/subject-membership.json')).json()).subjects.math_2.ids,[1001]);
  await stop();origin=await start();
  assert.deepEqual(await(await fetch(origin+'/api/progress')).json(),math);assert.deepEqual(await(await fetch(origin+'/api/408/progress')).json(),cs);
  assert.equal((await(await fetch(origin+'/data/questions.json')).json())[0].id,1001);
  assert.deepEqual((await(await fetch(origin+'/assets/subject-membership.json')).json()).subjects.math_2.ids,[1001]);
  assert.equal((await fetch(origin+'/assets/map.json')).status,200);await stop();
  assert.deepEqual(await fingerprint(),before,'App bundle must never be changed by boot, save, import or restart');
  await assert.rejects(stat(join(app,'data')),{code:'ENOENT'});
 }finally{
  if(child&&child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}
  if(!fixture.startsWith(resolve(root,'tests')+sep))throw Error('Unsafe cleanup');
  if(process.platform!=='win32')for(const dir of ['lib','library','public',''])await chmod(join(app,dir),0o755).catch(()=>{});
  await rm(fixture,{recursive:true});
 }
});
