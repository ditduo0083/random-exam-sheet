import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { convertRows, readText, readXlsx, HEADERS, asEngine, ratioWeights, type PrintQuestion } from '../src/input';
import { exampleInfo, legacyExampleRows as exampleRows, exampleRows as fullExampleRows } from '../src/examples';
import { selectQuestions, seededRng, quotas, type Settings } from '../src/select';
import * as vendor from '../vendor/engine/index';
import { originalRoot, checkVendor } from '../scripts/check-vendor.mjs';
const dir=resolve(import.meta.dirname,'../templates');
const bank=convertRows(exampleRows,exampleInfo);
const settings:Settings={count:20,ratio:'상2:중5:하3',balanced:true,mix:true,seed:'test-001'};
const row=(change:Record<string,string>)=>HEADERS.map(h=>change[h] ?? ({유형:'선택',문제:'가상 문제',보기1:'가',보기2:'나',보기3:'다',보기4:'라',정답:'1'} as Record<string,string>)[h] ?? '');

test('xlsx / CSV / TSV input yields the same questions and metadata',()=>{
  const fromXlsx=readXlsx(readFileSync(resolve(dir,'example.xlsx')));
  const fromCsv=readText(readFileSync(resolve(dir,'example.csv'),'utf8'));
  const tsv=readText([...exampleInfo,[],...fullExampleRows].map(r=>r.join('\t')).join('\n'),'\t');
  assert.deepEqual(fromXlsx,fromCsv);assert.deepEqual(fromXlsx,tsv);
  for(const b of [fromXlsx,fromCsv,tsv]){assert.equal(b.questions.length,60);assert.deepEqual(b.issues,[]);}
});
test('quoted commas, tabs, newlines and escaped quotes survive input',()=>{
  const values=row({問題:'',문제:'가상 "표"\n다음 줄, 확인\t끝'});
  const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
  for(const separator of [',','\t'])assert.equal(readText([HEADERS,values].map(r=>r.map(quote).join(separator)).join('\r\n'),separator).questions[0].stem,values[2]);
  assert.throws(()=>readText('"문제'),/따옴표/);
});
const errors=[
 ['문제 없음',{문제:''}],['보기 빈칸',{보기2:''}],['중복 보기',{보기4:'가'}],['4지 정답 범위',{정답:'5'}],
 ['5지 정답 범위',{보기5:'마',정답:'6'}],['단답 정답 없음',{유형:'단답',보기1:'',보기2:'',보기3:'',보기4:'',정답:''}],
 ['단답에 보기',{유형:'단답',정답:'가'}],['알 수 없는 유형',{유형:'ox'}],['난이도 오류',{난이도:'최상'}],['허용 답 빈칸',{유형:'단답',보기1:'',보기2:'',보기3:'',보기4:'',정답:'가|'}]
] as [string,Record<string,string>][];
for(const [name,change] of errors)test(`error: ${name} includes row number`,()=>{const b=convertRows([HEADERS,row(change)]);assert.ok(b.issues.some(i=>i.severity==='error' && i.row===2));});
const warningCases=[
 ['긴 보기',{보기4:'매우 긴 보기를 작성하여 다른 세 보기보다 길이 편차가 크게 생기는 가상의 사례입니다.'}],
 ['보기 번호',{보기1:'① 가'}],['인용 흔적',{문제:'가상 문제 [12]'}],['코드 울타리',{해설:'``` 가상 설명'}],['응답 문구',{문제:'요청하신 대로 가상 문제를 적습니다.'}]
] as [string,Record<string,string>][];
for(const [name,change] of warningCases)test(`warning: ${name} retains printable input`,()=>{const b=convertRows([HEADERS,row(change)]);assert.ok(b.issues.some(i=>i.severity==='warning' && i.row===2));assert.ok(!b.issues.some(i=>i.severity==='error'));});
test('duplicate stems warn with the original physical row',()=>{const b=convertRows([HEADERS,row({}),row({보기1:'마'})]);assert.ok(b.issues.some(i=>i.row===3 && i.message.includes('2행')));});
test('types infer from choices and accept 4지 / 5지 aliases',()=>{
 const b=convertRows([HEADERS,row({유형:''}),row({유형:'5지',보기5:'마',정답:'5'}),row({유형:'',보기1:'',보기2:'',보기3:'',보기4:'',정답:'안 전|안전'})]);
 assert.ok(!b.issues.some(i=>i.severity==='error'));assert.deepEqual(b.questions.map(q=>q.type),['choice','choice','short']);
 const q=b.questions[2];assert.equal(vendor.grade(asEngine(q),' 안 전 ').correct,true);assert.equal(vendor.grade(asEngine(q),'다른 답').correct,false);
});
test('metadata errors reject impossible count and ratio',()=>{for(const info of [[['문항수','21']],[['난이도비율','상0:중0:하0']]])assert.ok(convertRows(exampleRows,info).issues.some(i=>i.row===0 && i.severity==='error'));});
test('count, type order, quotas, uniqueness and repeatability for 100 seeds',()=>{
 for(let i=0;i<100;i++){
  const s={...settings,seed:String(i)},selected=selectQuestions(bank.questions,s);
  assert.equal(selected.length,20);assert.equal(new Set(selected.map(d=>d.question.id)).size,20);
  assert.deepEqual(selected,selectQuestions(bank.questions,s));assert.deepEqual(selected.map(d=>d.number),Array.from({length:20},(_,n)=>n+1));
  assert.deepEqual(['상','중','하'].map(l=>selected.filter(d=>d.question.difficulty?.level===l).length),[4,10,6]);
  assert.deepEqual(selected.map(d=>d.question.type),[...Array(14).fill('choice'),...Array(6).fill('short')]);
 }
 assert.notDeepEqual(selectQuestions(bank.questions,settings),selectQuestions(bank.questions,{...settings,seed:'other'}));
});
test('subset counts and largest remainder quotas include very small counts',()=>{
 for(const count of [1,2,3,7,10,15,20]){const selected=selectQuestions(bank.questions,{...settings,count});assert.equal(selected.length,count);assert.deepEqual(['상','중','하'].map(l=>selected.filter(d=>d.question.difficulty?.level===l).length),quotas(count,[2,5,3]));}
 assert.deepEqual(quotas(1,[2,5,3]),[0,1,0]);
 assert.throws(()=>selectQuestions(bank.questions,{...settings,count:21}),/문항수/);
 assert.throws(()=>selectQuestions(bank.questions.filter(q=>q.difficulty?.level!=='상'),{...settings,count:10}),/상 문항/);
 assert.throws(()=>ratioWeights('상-1:중5:하3'));
});
test('units balance when sufficiently stocked; no duplicate filling of scarce units',()=>{
 const pool=Array.from({length:30},(_,i)=>({...bank.questions[0],id:String(i),classification:{unit:{name:['A','B','C'][i%3]}}}));
 const selected=selectQuestions(pool,{...settings,count:12,ratio:''});assert.deepEqual(['A','B','C'].map(n=>selected.filter(d=>d.question.classification.unit?.name===n).length),[4,4,4]);
 const scarce=pool.filter(q=>q.classification.unit.name!=='C').concat(pool.find(q=>q.classification.unit.name==='C')!);
 const s=selectQuestions(scarce,{...settings,count:12,ratio:''});assert.equal(s.length,12);assert.equal(s.filter(d=>d.question.classification.unit?.name==='C').length,1);
});
test('correct display number and text agree for every question × 200 seeds, including fifth slot',()=>{
 let fifthCorrect=0;
 for(let i=0;i<200;i++)for(const d of selectQuestions(bank.questions,{...settings,seed:String(i)})){
   if(d.question.type==='choice'){
     const expected=d.question.choices[d.question.answer-1],number=d.choiceOrder!.indexOf(d.question.answer-1)+1;
     assert.equal(d.choices![number-1],expected);assert.equal(d.correct,`${number}번 · ${expected}`);if(number===5)fifthCorrect++;
   }else assert.equal(d.correct,d.question.answer.join(' | '));
 }
 assert.ok(fifthCorrect>0);
 const off=selectQuestions(bank.questions,{...settings,mix:false});for(const d of off)if(d.question.type==='choice')assert.deepEqual(d.choices,d.question.choices);
});
test('vendor file hashes and original engine outputs are equivalent',async t=>{
 checkVendor();const original=originalRoot();if(!original){t.skip('건너뜀: 공개 저장소에는 원본 없음');return;}
 const engine=await import(pathToFileURL(resolve(original,'engine/index.ts')).href);
 const pool=bank.questions.map(asEngine);
 for(let i=0;i<100;i++){
  const make=()=>seededRng(String(i));
  assert.deepEqual(vendor.pickBalanced(pool,12,undefined,make()),engine.pickBalanced(pool,12,undefined,make()));
  assert.deepEqual(vendor.pickByDifficulty(pool,10,null,undefined,make()),engine.pickByDifficulty(pool,10,null,undefined,make()));
  assert.deepEqual(vendor.pickByGroupQuota(pool,10,undefined,null,undefined,make()),engine.pickByGroupQuota(pool,10,undefined,null,undefined,make()));
  for(const q of pool)if(q.type==='choice')assert.deepEqual(vendor.shuffleChoices(q,make()),engine.shuffleChoices(q,make()));
 }
 assert.deepEqual(vendor.paginate(pool,{heights:pool.map(()=>100),availableHeight:450}),engine.paginate(pool,{heights:pool.map(()=>100),availableHeight:450}));
});
