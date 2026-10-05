import * as XLSX from 'xlsx';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HEADERS, INFO_KEYS } from '../src/input';
import { exampleInfo, exampleRows } from '../src/examples';
const dir=resolve(import.meta.dirname,'../templates');mkdirSync(dir,{recursive:true});
const quote=(v:string)=>'"'+v.replaceAll('"','""')+'"';
for(const [name,info,rows] of [
  ['blank',INFO_KEYS.map(key=>[key,'']),[HEADERS]],
  ['example',exampleInfo,exampleRows]
] as [string,string[][],string[][]][]) {
  const workbook=XLSX.utils.book_new();
  const infoSheet=XLSX.utils.aoa_to_sheet([['항목','값'],...info]);infoSheet['!cols']=[{wch:16},{wch:80}];
  const questionSheet=XLSX.utils.aoa_to_sheet(rows);questionSheet['!cols']=HEADERS.map(h=>({wch:h==='문제'?65:h==='해설'?50:h.startsWith('보기')?25:12}));
  XLSX.utils.book_append_sheet(workbook,infoSheet,'시험정보');XLSX.utils.book_append_sheet(workbook,questionSheet,'문항');
  XLSX.writeFile(workbook,resolve(dir,`${name}.xlsx`));
  writeFileSync(resolve(dir,`${name}.csv`),'\uFEFF'+[...info,[],...rows].map(r=>r.map(quote).join(',')).join('\r\n'));
}
console.log('양식 4개 생성: blank/example × xlsx/csv');
