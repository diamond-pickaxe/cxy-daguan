import {mkdir,readdir,copyFile,readFile,writeFile,stat,rename} from 'node:fs/promises';
import {resolve,join,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {preparePortable} from './prepare-portable.mjs';
import {checkLibrary} from './check-library.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(root.toLowerCase().startsWith('d:\\desktop\\文档\\secret'))throw Error('Protected path');
if(process.platform!=='win32')throw Error('The ZIP packager currently requires Windows PowerShell.');
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const name=`宇的数学大观离线版-v${pkg.version}-windows-x64-portable`,assetName=`yu-math-daguan-offline-v${pkg.version}-windows-x64-portable.zip`,output=resolve(root,'release'),folder=resolve(output,'.stage-'+Date.now(),name),zip=resolve(output,assetName);
if(!folder.startsWith(root+sep)||!zip.startsWith(root+sep))throw Error('Output outside project');
try{await stat(folder);throw Error('This version is already packaged. Choose a new version or a new release output directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(folder,{recursive:true});
const {seed,lock,files:assets}=await checkLibrary(root);
const files=['server.mjs','package.json','README.md','RELEASE_NOTES.md','LICENSE','THIRD_PARTY_NOTICES.md','使用说明.txt','启动考研数学.cmd','examples/demo-library.json','library/bundled-library.json','library/snapshot.json',...assets];
for(const name of ['public','tests','tools','launcher'])await walk(name);
async function walk(dir){for(const entry of await readdir(join(root,dir),{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('Symlinks are not packaged');const rel=join(dir,entry.name);if(rel.replaceAll('\\','/').startsWith('public/assets/media'))continue;if(entry.isDirectory())await walk(rel);else if(/\.(?:mjs|js|css|html|json|svg|png|txt|woff2?|ttf|cs|manifest)$/.test(entry.name))files.push(rel);}}
for(const file of files){const target=resolve(folder,file);if(!target.startsWith(folder+sep))throw Error('Invalid relative path');await mkdir(dirname(target),{recursive:true});await copyFile(join(root,file),target);}
await mkdir(join(folder,'data'),{recursive:true});for(const[name,value]of [['questions',seed.questions],['categories',seed.categories],['manifest',seed.manifest],['subject-membership',seed.subjectMembership]])await writeFile(join(folder,`data/${name}.json`),JSON.stringify(value));
// Release from the verified snapshot, never from this computer's mutable data or progress.
await writeFile(join(folder,'public/assets/subject-membership.json'),JSON.stringify(seed.subjectMembership));await writeFile(join(folder,'public/assets/map.json'),JSON.stringify(seed.assetMap));
console.log(`Bundling ${lock.questions} questions and ${lock.assets} verified local images.`);
await preparePortable(folder);
const ps="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:YU_PACKAGE_FOLDER,$env:YU_PACKAGE_ZIP,[System.IO.Compression.CompressionLevel]::Optimal,$true)";
const temporaryZip=resolve(dirname(folder),'archive.zip');
const packed=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{cwd:root,env:{...process.env,YU_PACKAGE_FOLDER:folder,YU_PACKAGE_ZIP:temporaryZip},encoding:'utf8',windowsHide:true});if(packed.status!==0)throw Error(packed.stderr||'ZIP creation failed');
await rename(temporaryZip,zip);
const bytes=await readFile(zip),hash=createHash('sha256').update(bytes).digest('hex');await writeFile(join(output,'SHA256SUMS.txt'),`${hash}  ${assetName}\n`);console.log(JSON.stringify({archive:relative(root,zip),bytes:bytes.length,sha256:hash}));
