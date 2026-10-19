import {mkdir,readdir,copyFile,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,join,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(root.toLowerCase().startsWith('d:\\desktop\\文档\\secret'))throw Error('Protected path');
if(process.platform!=='win32')throw Error('The ZIP packager currently requires Windows PowerShell.');
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const name=`宇的数学大观离线版-v${pkg.version}-windows`,assetName=`yu-math-daguan-offline-v${pkg.version}-windows.zip`,output=resolve(root,'release'),folder=resolve(output,'.stage-'+Date.now(),name),zip=resolve(output,assetName);
if(!folder.startsWith(root+sep)||!zip.startsWith(root+sep))throw Error('Output outside project');
try{await stat(folder);throw Error('This version is already packaged. Choose a new version or a new release output directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(folder,{recursive:true});
const files=['server.mjs','package.json','README.md','LICENSE','THIRD_PARTY_NOTICES.md','使用说明.txt','启动考研数学.cmd','examples/demo-library.json'];
for(const name of ['public','tests','tools'])await walk(name);
async function walk(dir){for(const entry of await readdir(join(root,dir),{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('Symlinks are not packaged');const rel=join(dir,entry.name);if(rel.replaceAll('\\','/').startsWith('public/assets/media'))continue;if(entry.isDirectory())await walk(rel);else if(/\.(?:mjs|js|css|html|json|svg|txt|woff2?|ttf)$/.test(entry.name))files.push(rel);}}
for(const file of files){const target=resolve(folder,file);if(!target.startsWith(folder+sep))throw Error('Invalid relative path');await mkdir(dirname(target),{recursive:true});await copyFile(join(root,file),target);}
const demo=JSON.parse(await readFile(join(root,'examples/demo-library.json'),'utf8'));
if(demo.questions.length!==6||demo.questions.some(q=>q.source!=='自编演示题 · 非历年真题'))throw Error('Only the original six authored demo questions may be packaged automatically.');
await mkdir(join(folder,'data'),{recursive:true});for(const[name,value]of [['questions',demo.questions],['categories',demo.categories],['manifest',demo.manifest],['subject-membership',demo.subjectMembership]])await writeFile(join(folder,`data/${name}.json`),JSON.stringify(value,null,2));
// Membership and asset mappings also come from the authored demo, not the user's library.
await writeFile(join(folder,'public/assets/subject-membership.json'),JSON.stringify(demo.subjectMembership,null,2));await writeFile(join(folder,'public/assets/map.json'),'{}\n');
const ps="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:YU_PACKAGE_FOLDER,$env:YU_PACKAGE_ZIP,[System.IO.Compression.CompressionLevel]::Optimal,$true)";
const packed=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{cwd:root,env:{...process.env,YU_PACKAGE_FOLDER:folder,YU_PACKAGE_ZIP:zip},encoding:'utf8',windowsHide:true});if(packed.status!==0)throw Error(packed.stderr||'ZIP creation failed');
const bytes=await readFile(zip),hash=createHash('sha256').update(bytes).digest('hex');await writeFile(join(output,'SHA256SUMS.txt'),`${hash}  ${assetName}\n`);console.log(JSON.stringify({archive:relative(root,zip),bytes:bytes.length,sha256:hash}));
