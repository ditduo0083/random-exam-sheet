import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, cpSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, checkVendor } from './check-vendor.mjs';
checkVendor();
const templates=spawnSync(process.execPath,['--import','tsx',resolve(root,'scripts/templates.ts')],{cwd:root,stdio:'inherit',windowsHide:true});
if(templates.status!==0)process.exit(templates.status || 1);
const dist=resolve(root,'dist');mkdirSync(dist,{recursive:true});mkdirSync(resolve(dist,'assets'),{recursive:true});
const common={bundle:true,minify:true,format:'iife',target:'es2020',platform:'browser',legalComments:'eof',absWorkingDir:root};
const worker=await build({...common,entryPoints:['src/worker.ts'],write:false});
const logoIndex=process.argv.indexOf('--logo'),logo=logoIndex>=0?process.argv[logoIndex+1]:process.env.PRINT_SHEET_LOGO;
let logoFile='';
if(logo){if(!existsSync(logo))throw Error('지정한 로고 파일이 없습니다.');const extension=extname(logo).toLowerCase();if(!['.png','.jpg','.jpeg','.webp'].includes(extension))throw Error('로고는 png/jpg/webp 파일이어야 합니다.');logoFile=`assets/logo${extension}`;cpSync(logo,resolve(dist,logoFile));}
await build({...common,entryPoints:['src/app.ts'],outfile:'dist/app.js',define:{PARSER_WORKER:JSON.stringify(worker.outputFiles[0].text),LOGO_FILE:JSON.stringify(logoFile)}});
cpSync(resolve(root,'src/index.template.html'),resolve(dist,'index.html'));cpSync(resolve(root,'src/style.css'),resolve(dist,'app.css'));
cpSync(resolve(root,'templates'),resolve(dist,'templates'),{recursive:true});
if(existsSync(resolve(root,'docs')))cpSync(resolve(root,'docs'),resolve(dist,'docs'),{recursive:true});
// Third-party license notices travel with the offline release.
// package resolution supports standalone as well as an existing npm workspace.
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
import { dirname } from 'node:path';
writeFileSync(resolve(dist,'THIRD-PARTY-NOTICES.txt'),readFileSync(resolve(dirname(require.resolve('xlsx/package.json')),'LICENSE'),'utf8'));
console.log(`빌드 완료: dist/index.html (로고 ${logo?'포함':'자리표시자'})`);
