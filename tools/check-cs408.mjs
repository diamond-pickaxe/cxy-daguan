import {readFile} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
export async function check408(root=resolve(dirname(fileURLToPath(import.meta.url)),'..')){
 root=resolve(root);const blocked='d:\\desktop\\文档\\secret';if(root.toLowerCase()===blocked||root.toLowerCase().startsWith(blocked+'\\'))throw Error('Protected path');
 const read=name=>readFile(join(root,name),'utf8'),lock=JSON.parse(await read('library/cs408-snapshot.json')),data=await read('public/408/data.js');
 const hash=value=>createHash('sha256').update(value).digest('hex');assert.equal(hash(data),lock.dataSha256);const box={window:{}};runInNewContext(data,box);runInNewContext(await read('public/408/seed.js'),box);
 const questions=box.window.OFFLINE_DATA.questions;assert.equal(questions.length,846);assert.equal(new Set(questions.map(q=>q.id)).size,846);
 for(const q of questions){for(const key of ['currentMastery','masteryHistory','isCollected'])assert.ok(!Object.hasOwn(q,key));for(const field of ['questionHtml','answerHtml','analysisHtml'])assert.ok(!/\b(?:src|poster|xlink:href)\s*=\s*["'](?!data:|#)/i.test(q[field]));}
 for(const key of ['mastery','notes','attempts','collections'])assert.equal(Object.keys(box.window.OFFLINE_SEED[key]).length,0);
 const styles=JSON.parse(await read('library/cs408-styles.json'));assert.ok(styles.assets.length>=5);for(const asset of styles.assets){const path=resolve(root,asset.file);assert.ok(path.startsWith(resolve(root,'public/408/original')+sep));assert.equal(hash(await readFile(path)),asset.sha256);}
 return lock;
}
