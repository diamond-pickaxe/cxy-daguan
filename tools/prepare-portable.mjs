import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const protectedRoot='d:\\desktop\\文档\\secret';
function guard(path){const p=resolve(path).toLowerCase();if(p===protectedRoot||p.startsWith(protectedRoot+'\\'))throw Error('Protected path');return path;}
guard(root);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function powershell(script,env){const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{cwd:root,env:{...process.env,...env},encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(result.stderr||result.stdout||'PowerShell failed');}
export async function preparePortable(folder){
 guard(folder);if(!resolve(folder).startsWith(root+sep))throw Error('Portable output must stay inside this project');
 const lock=JSON.parse(await readFile(join(root,'tools/runtime-lock.json'),'utf8'));
 if(!/^\d+\.\d+\.\d+$/.test(lock.version)||lock.platform!=='win-x64'||lock.url!==`https://nodejs.org/dist/v${lock.version}/node-v${lock.version}-win-x64.zip`||!/^[a-f0-9]{64}$/.test(lock.sha256))throw Error('Invalid runtime lock');
 const cache=join(root,'release/.cache');await mkdir(cache,{recursive:true});
 const archive=join(cache,`node-v${lock.version}-win-x64.zip`);
 let bytes;try{bytes=await readFile(archive);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!bytes){console.log(`Downloading official Node.js ${lock.version} runtime…`);const response=await fetch(lock.url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error(`Runtime download failed: ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());if(digest(bytes)!==lock.sha256)throw Error('Runtime checksum mismatch');await writeFile(archive,bytes);}
 if(digest(bytes)!==lock.sha256)throw Error('Cached runtime checksum mismatch');
 const runtime=join(folder,'runtime');await mkdir(runtime,{recursive:true});
 powershell("$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip=[IO.Compression.ZipFile]::OpenRead($env:YU_RUNTIME_ZIP); try { foreach($name in @('node.exe','LICENSE')) { $entry=$zip.GetEntry($env:YU_RUNTIME_PREFIX+'/'+$name); if($null -eq $entry){throw 'Runtime file missing'}; [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,[IO.Path]::Combine($env:YU_RUNTIME_TARGET,$name),$false) } } finally { $zip.Dispose() }",{YU_RUNTIME_ZIP:archive,YU_RUNTIME_PREFIX:`node-v${lock.version}-win-x64`,YU_RUNTIME_TARGET:runtime});
 await writeFile(join(runtime,'VERSION.txt'),`Node.js ${lock.version} (${lock.platform})\nSource: ${lock.url}\nArchive SHA-256: ${lock.sha256}\n`);
 // ICO stores the two original PNG images unchanged; no redrawing or resampling.
 const provenance=JSON.parse(await readFile(join(root,'launcher/icon-source.json'),'utf8'));
 const pngs=[];for(const icon of provenance.icons){const png=await readFile(join(root,icon.file));if(digest(png)!==icon.sha256)throw Error('Original icon checksum mismatch');pngs.push(png);}
 const header=Buffer.alloc(6+16*pngs.length);header.writeUInt16LE(1,2);header.writeUInt16LE(pngs.length,4);let offset=header.length;
 pngs.forEach((png,i)=>{const width=png.readUInt32BE(16),height=png.readUInt32BE(20);if(width>256||height>256)throw Error('Invalid icon size');const entry=6+16*i;header[entry]=width%256;header[entry+1]=height%256;header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(png.length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=png.length;});
 const ico=join(folder,'app.ico');await writeFile(ico,Buffer.concat([header,...pngs]));
 const compiler=join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');await stat(compiler);
 const executable=join(folder,'宇的数学大观离线版.exe');
 const built=spawnSync(compiler,['/nologo','/target:winexe','/platform:x64','/optimize+','/codepage:65001','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll',`/win32icon:${ico}`,`/win32manifest:${join(root,'launcher/app.manifest')}`,`/out:${executable}`,join(root,'launcher/Launcher.cs')],{cwd:root,encoding:'utf8',windowsHide:true});
 if(built.status!==0)throw Error(built.stdout||built.stderr||'Launcher compilation failed');
 // Use the bundled runtime with no Node.js or npm on PATH, from an unrelated cwd.
 const smoke=spawnSync(executable,['--smoke-test'],{cwd:process.env.WINDIR||'C:\\Windows',env:{...process.env,PATH:process.env.WINDIR||'C:\\Windows',NODE_OPTIONS:'--require=nonexistent-user-module'},timeout:45000,windowsHide:true});
 if(smoke.status!==0){let details='';try{details=await readFile(join(folder,'launcher-smoke-error.log'),'utf8');}catch{}throw Error(`Portable launcher smoke test failed: ${smoke.error||smoke.status}\n${details}`);}
 console.log('Portable EXE passed: bundled runtime, local pages/library/progress, graceful shutdown.');
}
