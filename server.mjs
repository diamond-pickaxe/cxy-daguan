import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,rename,copyFile} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url));
if(root.toLowerCase().startsWith('d:\\desktop\\文档\\secret'))throw Error('Protected path');
const port=Number(process.env.EXAM_PORT||4180),origin=`http://127.0.0.1:${port}`;
const statePath=resolve(root,'data/progress.json');
await mkdir(resolve(root,'data/backups'),{recursive:true});
const seed=JSON.parse(await readFile(resolve(root,'examples/demo-library.json'),'utf8'));
for(const [name,value]of [['questions',seed.questions],['categories',seed.categories],['manifest',seed.manifest],['subject-membership',seed.subjectMembership]]){const path=resolve(root,'data/'+name+'.json');try{await readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(path,JSON.stringify(value,null,2));}}
await mkdir(resolve(root,'public/assets'),{recursive:true});for(const [name,value]of [['subject-membership',seed.subjectMembership],['map',{}]]){const path=resolve(root,'public/assets/'+name+'.json');try{await readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(path,JSON.stringify(value));}}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
let queue=Promise.resolve();
const defaultProgress='{"version":1,"records":{},"history":[],"targetDate":""}';
const tag=body=>'"'+createHash('sha256').update(body).digest('hex')+'"';
async function readProgress(){try{return await readFile(statePath,'utf8');}catch(e){if(e.code==='ENOENT')return defaultProgress;throw e;}}
const server=createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
 try{
  if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`){res.writeHead(403).end();return;}
  const url=new URL(req.url,origin);
  if(url.pathname==='/api/library'){
   if(req.method!=='PUT'){res.writeHead(405).end();return;}
   if(![origin,`http://localhost:${port}`].includes(req.headers.origin)||req.headers['content-type']!=='application/json'){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>80_000_000){res.writeHead(413).end();return;}}
   const next=JSON.parse(body),ids=new Set();
   function validateCategories(list,depth=0){if(!Array.isArray(list)||depth>15)return false;return list.every(c=>c&&Number.isSafeInteger(c.id)&&typeof c.name==='string'&&validateCategories(c.children||[],depth+1));}
   if(!Array.isArray(next.questions)||!next.questions.length||!validateCategories(next.categories)){res.writeHead(400).end('题库格式无效');return;}
   for(const q of next.questions){if(!q||!Number.isSafeInteger(q.id)||ids.has(q.id)||typeof(q.document?.stem_md??q.stem)!=='string'){res.writeHead(400).end('题号重复或题干无效');return;}ids.add(q.id);}
   const codes=['math_1','math_2','math_3'];
   for(const q of next.questions)if(q.exam_subjects!==undefined&&(!Array.isArray(q.exam_subjects)||q.exam_subjects.some(code=>!codes.includes(code)))){res.writeHead(400).end('适用科目标记无效');return;}
   const membership={format:1,source:next.subjectMembership?.source||'用户导入题库',preparedAt:new Date().toISOString(),subjects:Object.fromEntries(codes.map(code=>{const provided=next.subjectMembership?.subjects?.[code]?.ids;if(provided!==undefined&&(!Array.isArray(provided)||provided.some(id=>!Number.isSafeInteger(id))))throw Object.assign(Error('Invalid membership'),{status:400});const selected=new Set((provided||[]).filter(id=>ids.has(id)));for(const q of next.questions)if(Array.isArray(q.exam_subjects)){q.exam_subjects.includes(code)?selected.add(q.id):selected.delete(q.id);}return [code,{sourceTotal:selected.size,ids:[...selected],missingLocally:[]}];}))};
   const task=queue.then(async()=>{
    const stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
    const current={questions:JSON.parse(await readFile(resolve(root,'data/questions.json'),'utf8')),categories:JSON.parse(await readFile(resolve(root,'data/categories.json'),'utf8')),manifest:JSON.parse(await readFile(resolve(root,'data/manifest.json'),'utf8'))};
    await writeFile(resolve(root,`data/backups/library-${stamp}.json`),JSON.stringify(current));
    const updatedManifest={...current.manifest,...next.manifest,downloaded:next.questions.length,expected:next.questions.length,complete:true,editedAt:new Date().toISOString()};
    for(const [file,value] of [['questions',next.questions],['categories',next.categories],['manifest',updatedManifest],['subject-membership',membership]]){const path=resolve(root,`data/${file}.json`);await writeFile(path+'.tmp',JSON.stringify(value));await rename(path+'.tmp',path);}
    await mkdir(resolve(root,'public/assets'),{recursive:true});const mapPath=resolve(root,'public/assets/subject-membership.json');await writeFile(mapPath+'.tmp',JSON.stringify(membership));await rename(mapPath+'.tmp',mapPath);
   });queue=task.catch(()=>{});await task;res.writeHead(200,{'Content-Type':types['.json']}).end('{"ok":true}');return;
  }
  if(url.pathname==='/api/progress'){
   if(req.method==='GET'){const body=await readProgress();res.writeHead(200,{'Content-Type':types['.json'],'ETag':tag(body)}).end(body);return;}
   if(req.method!=='PUT'){res.writeHead(405).end();return;}
   if(![origin,`http://localhost:${port}`].includes(req.headers.origin)||req.headers['content-type']!=='application/json'){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>30_000_000){res.writeHead(413).end();return;}}
   const next=JSON.parse(body);
   if(next.version!==1||!next.records||typeof next.records!=='object'||Array.isArray(next.records)||!Array.isArray(next.history)) {res.writeHead(400).end('Invalid backup');return;}
   const savedBody=JSON.stringify(next,null,2);
   const task=queue.then(async()=>{if(req.headers['if-match']&&req.headers['if-match']!==tag(await readProgress()))throw Object.assign(Error('记录已在另一个窗口更新，请导出当前记录再刷新。'),{status:409});try{await copyFile(statePath,resolve(root,'data/backups/previous.json'));const day=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});await copyFile(statePath,resolve(root,`data/backups/${day}.json`),1).catch(e=>{if(e.code!=='EEXIST')throw e;});}catch(e){if(e.code!=='ENOENT')throw e;}await writeFile(statePath+'.tmp',savedBody);await rename(statePath+'.tmp',statePath);});
   queue=task.catch(()=>{});await task;res.writeHead(200,{'Content-Type':types['.json'],'ETag':tag(savedBody)}).end('{"ok":true}');return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  const pathname=decodeURIComponent(url.pathname);
  const allowedData=['/data/questions.json','/data/categories.json','/data/manifest.json'];
  const base=pathname.startsWith('/data/')?root:resolve(root,'public');
  if(pathname.startsWith('/data/')&&!allowedData.includes(pathname)){res.writeHead(403).end();return;}
  const file=resolve(base,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(base+sep)){res.writeHead(403).end();return;}
  const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:body);
 }catch(e){res.writeHead(e.status||(e.code==='ENOENT'?404:500)).end(e.status===409?e.message:e.code==='ENOENT'?'Not found':'操作失败，请检查本机文件或重试。');}
});
function openBrowser(){if(process.argv.includes('--open')&&process.platform==='win32')execFile('cmd.exe',['/c','start','',origin],{windowsHide:true},()=>{});}
server.listen(port,'127.0.0.1',()=>{console.log(`考研数学离线题库：${origin}\n学习记录：${statePath}\n关闭此窗口即可停止服务。`);openBrowser();});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 正在使用，请先打开 ${origin}`:e.message);if(e.code==='EADDRINUSE')openBrowser();process.exitCode=1;});
