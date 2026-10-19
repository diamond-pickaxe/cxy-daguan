import {readFile,writeFile,mkdir,copyFile,chmod,mkdtemp,rename} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const blocked='d:\\desktop\\文档\\secret';
const guard=p=>{p=resolve(p);if(p.toLowerCase()===blocked||p.toLowerCase().startsWith(blocked+'\\'))throw Error('Protected path');if(!p.startsWith(root+sep))throw Error('Output outside project');return p;};
const digest=b=>createHash('sha256').update(b).digest('hex');
function run(command,args,options={}){const result=spawnSync(command,args,{encoding:'utf8',timeout:180000,...options});if(result.status!==0)throw Error(`${command}: ${result.error||result.stderr||result.stdout||result.status}`);return result.stdout;}

export async function prepareMac(site){
 if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw Error('Build on a native Apple Silicon or Intel Mac');
 guard(site);const resources=dirname(site),contents=dirname(resources),app=dirname(contents);
 if(!app.endsWith('.app')||!app.startsWith(root+sep))throw Error('Invalid app bundle');
 const lock=JSON.parse(await readFile(join(root,'tools/macos-runtime-lock.json'),'utf8')),target=lock.targets[process.arch];
 const prefix=`node-v${lock.version}-darwin-${process.arch}`;
 if(!/^\d+\.\d+\.\d+$/.test(lock.version)||target.url!==`https://nodejs.org/dist/v${lock.version}/${prefix}.tar.gz`||!/^[a-f0-9]{64}$/.test(target.sha256))throw Error('Invalid macOS runtime lock');
 const cache=guard(join(root,'release/.cache'));await mkdir(cache,{recursive:true});const archive=join(cache,prefix+'.tar.gz');
 let bytes;try{bytes=await readFile(archive);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!bytes){const response=await fetch(target.url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error('Runtime download failed: '+response.status);bytes=Buffer.from(await response.arrayBuffer());if(digest(bytes)!==target.sha256)throw Error('Runtime checksum mismatch');await writeFile(archive,bytes);}
 if(digest(bytes)!==target.sha256)throw Error('Cached runtime checksum mismatch');
 const extracted=await mkdtemp(join(cache,'mac-runtime-'));run('/usr/bin/tar',['-xzf',archive,'-C',extracted,`${prefix}/bin/node`,`${prefix}/LICENSE`]);
 const runtime=join(site,'runtime');await mkdir(runtime,{recursive:true});await copyFile(join(extracted,prefix,'bin/node'),join(runtime,'node'));await chmod(join(runtime,'node'),0o755);await copyFile(join(extracted,prefix,'LICENSE'),join(runtime,'LICENSE'));
 await writeFile(join(runtime,'VERSION.txt'),`Node.js ${lock.version} (darwin-${process.arch})\nSource: ${target.url}\nArchive SHA-256: ${target.sha256}\n`);
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 await mkdir(join(contents,'MacOS'),{recursive:true});
 const executable=join(contents,'MacOS/YuDaguan'),arch=process.arch==='x64'?'x86_64':'arm64';
 run('/usr/bin/xcrun',['swiftc','-swift-version','5','-O','-target',`${arch}-apple-macosx13.0`,'-framework','AppKit',join(root,'launcher/MacLauncher.swift'),'-o',executable]);await chmod(executable,0o755);
 const icon=await readFile(join(root,'launcher/icon-192.png'));const provenance=JSON.parse(await readFile(join(root,'launcher/icon-source.json'),'utf8'));
 const original=provenance.icons.find(i=>i.file==='launcher/icon-192.png');if(!original||digest(icon)!==original.sha256)throw Error('Original icon checksum mismatch');
 const iconset=join(extracted,'AppIcon.iconset');await mkdir(iconset);
 for(const size of [16,32,128,256,512])for(const scale of [1,2])run('/usr/bin/sips',['-z',String(size*scale),String(size*scale),join(root,'launcher/icon-192.png'),'--out',join(iconset,`icon_${size}x${size}${scale===2?'@2x':''}.png`)]);
 run('/usr/bin/iconutil',['-c','icns',iconset,'-o',join(resources,'AppIcon.icns')]);
 await writeFile(join(contents,'Info.plist'),`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>io.github.diamond-pickaxe.cxy-daguan</string>
<key>CFBundleName</key><string>宇的大观本地版</string>
<key>CFBundleDisplayName</key><string>宇的大观本地版</string>
<key>CFBundleExecutable</key><string>YuDaguan</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${pkg.version}</string>
<key>CFBundleVersion</key><string>${pkg.version}</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSMultipleInstancesProhibited</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>\n`);
 run('/usr/bin/plutil',['-lint',join(contents,'Info.plist')]);
 // Ad-hoc signing preserves bundle integrity; it is not Apple notarization.
 run('/usr/bin/codesign',['--force','--sign','-',join(runtime,'node')]);
 run('/usr/bin/codesign',['--force','--sign','-',app]);
 run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
 const smokeData=await mkdtemp(guard(join(root,'release/.mac-smoke-')));
 run(executable,['--smoke-test','--data-dir',smokeData],{cwd:'/tmp',env:{...process.env,PATH:'/usr/bin:/bin',NODE_OPTIONS:'--require=nonexistent-user-module'},timeout:120000});
 // Check again after boot: startup, saving and restarting must not mutate the app.
 run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
 console.log(`macOS ${process.arch}: native launcher, offline pages, both stores, restart and bundle integrity passed.`);
}

export async function zipMac(folder,destination){
 guard(folder);guard(destination);const temporary=join(dirname(folder),'archive.zip');
 run('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',folder,temporary]);
 await rename(temporary,destination);
}
