import {readFile,lstat} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export async function checkLibrary(root=resolve(dirname(fileURLToPath(import.meta.url)),'..')){
 const protectedRoot='d:\\desktop\\文档\\secret';root=resolve(root);if(root.toLowerCase()===protectedRoot||root.toLowerCase().startsWith(protectedRoot+'\\'))throw Error('Protected path');
 const lock=JSON.parse(await readFile(join(root,'library/snapshot.json'))),bytes=await readFile(join(root,'library/bundled-library.json'));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),lock.bundleSha256,'Bundled library checksum mismatch');
 const seed=JSON.parse(bytes),ids=new Set(seed.questions.map(q=>q.id));assert.equal(seed.questions.length,lock.questions);assert.equal(ids.size,lock.questions);assert.equal(Object.keys(seed.assetMap).length,lock.assets);
 const codes=['math_1','math_2','math_3'];for(const code of codes){const members=seed.subjectMembership.subjects[code].ids;assert.equal(members.length,lock.subjects[code]);assert.equal(new Set(members).size,members.length);assert.ok(members.every(id=>ids.has(id)));const set=new Set(members);assert.ok(seed.questions.every(q=>q.exam_subjects.includes(code)===set.has(q.id)));}
 for(const q of seed.questions){assert.ok(!Object.hasOwn(q,'user_state')&&!Object.hasOwn(q,'has_note'));assert.ok(Number.isSafeInteger(q.id)&&typeof q.document?.stem_md==='string');for(const ref of q.document?.asset_refs||[])assert.ok(seed.assetMap[ref],`Missing image mapping: ${q.id}`);}
 const walk=list=>{for(const c of list){for(const key of ['completed_count','finished_count','total_completed_count'])assert.ok(!Object.hasOwn(c,key));walk(c.children||[]);}};walk(seed.categories);
 let assetBytes=0;const files=[];for(const [reference,url]of Object.entries(seed.assetMap)){
  const match=url.match(/^\/assets\/media\/([a-f0-9]{64})\.png$/);assert.ok(match,'Unexpected bundled asset path');assert.equal(reference,'asset://sha256/'+match[1]);const path=resolve(root,'public','.'+url);assert.ok(path.startsWith(resolve(root,'public/assets/media')+sep));assert.ok(!(await lstat(path)).isSymbolicLink());const image=await readFile(path);assert.equal(createHash('sha256').update(image).digest('hex'),match[1],'Image checksum mismatch');assetBytes+=image.length;files.push('public'+url);
 }
 assert.equal(assetBytes,lock.assetBytes);return {seed,lock,files};
}
