import {readFile,writeFile,mkdir,copyFile,rename} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
export function create408Store(root){
 const blocked='d:\\desktop\\文档\\secret',full=resolve(root).toLowerCase();if(full===blocked||full.startsWith(blocked+'\\'))throw Error('Protected path');
 const folder=resolve(root,'data/408'),path=resolve(folder,'progress.json'),backups=resolve(folder,'backups');if(!folder.startsWith(resolve(root)+sep))throw Error('Outside project');
 let queue=Promise.resolve();const tag=body=>'"'+createHash('sha256').update(body).digest('hex')+'"';
 const read=async()=>{try{return await readFile(path,'utf8');}catch(e){if(e.code==='ENOENT')return 'null';throw e;}};
 const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
 function valid(s){if(!s||s.version!==1||!['mastery','notes','attempts','history','answers'].every(k=>object(s[k]))||!Array.isArray(s.collections))return false;const id=k=>/^\d+$/.test(k)&&Number(k)>=1&&Number(k)<=846;return Object.entries(s.mastery).every(([k,v])=>id(k)&&[0,1,2,3].includes(v))&&Object.entries(s.notes).every(([k,v])=>id(k)&&typeof v==='string')&&s.collections.every(c=>c&&typeof c.name==='string'&&Array.isArray(c.ids)&&c.ids.every(n=>Number.isInteger(n)&&id(String(n))));}
 return {idle:()=>queue,async handle(req,res,url,origin){
  if(url.pathname!=='/api/408/progress')return false;
  if(req.method==='GET'){const body=await read();res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','ETag':tag(body)}).end(body);return true;}
  if(req.method!=='PUT'){res.writeHead(405).end();return true;}
  if(![origin,origin.replace('127.0.0.1','localhost')].includes(req.headers.origin)||req.headers['content-type']!=='application/json'){res.writeHead(403).end();return true;}
  if(!req.headers['if-match']){res.writeHead(428).end('请刷新页面后再保存。');return true;}
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>30_000_000){res.writeHead(413).end();return true;}chunks.push(chunk);}
  let next;try{next=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{res.writeHead(400).end('备份格式无效');return true;}
  if(!valid(next)){res.writeHead(400).end('408 学习记录格式无效');return true;}
  const body=JSON.stringify(next,null,2);const task=queue.then(async()=>{
   const previous=await read();if(req.headers['if-match']!==tag(previous))throw Object.assign(Error('408 记录已在其他窗口更新，请先导出当前记录，再刷新页面。'),{status:409});
   await mkdir(backups,{recursive:true});if(previous!=='null'){await copyFile(path,resolve(backups,'previous.json'));const day=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});await copyFile(path,resolve(backups,day+'.json'),1).catch(e=>{if(e.code!=='EEXIST')throw e;});}
   await writeFile(path+'.tmp',body);await rename(path+'.tmp',path);
  });queue=task.catch(()=>{});await task;res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','ETag':tag(body)}).end('{"ok":true}');return true;
 }};
}
