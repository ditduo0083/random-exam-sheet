import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { cpSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { root } from './check-vendor.mjs';
const result=spawnSync(process.execPath,[resolve(root,'scripts/build.mjs')],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,PRINT_SHEET_LOGO:''}});
if(result.status!==0)process.exit(result.status || 1);
for(const name of ['README.md','LICENSE','CONTRIBUTING.md'])cpSync(resolve(root,name),resolve(root,'dist',name));
// Small portable ZIP writer: UTF-8 names, DEFLATE, CRC32, no platform tools.
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xEDB88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=data=>{let crc=0xFFFFFFFF;for(const b of data)crc=table[(crc^b)&255]^(crc>>>8);return (crc^0xFFFFFFFF)>>>0;};
const local=[],central=[];let offset=0;
function addDirectory(folder,prefix){
 for(const entry of readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  const path=resolve(folder,entry.name),name=`${prefix}/${entry.name}`;
  if(entry.isDirectory()){addDirectory(path,name);continue;}
  // A previous deployment build may have left a school logo in dist. Never
  // include that optional deployment asset in the public offline release.
  if(name.startsWith('dist/assets/logo.'))continue;
  const filename=Buffer.from(name),data=readFileSync(path),compressed=deflateRawSync(data),crc=crc32(data);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034B50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
  const index=Buffer.alloc(46);index.writeUInt32LE(0x02014B50,0);index.writeUInt16LE(20,4);header.copy(index,6,4,30);index.writeUInt32LE(offset,42);
  local.push(header,filename,compressed);central.push(index,filename);offset+=header.length+filename.length+compressed.length;
 }
}
addDirectory(resolve(root,'dist'),'dist');
const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054B50,0);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
writeFileSync(resolve(root,'print-sheet.zip'),Buffer.concat([...local,index,end]));
console.log('print-sheet.zip 생성 완료');
