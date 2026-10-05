import test from 'node:test';
import assert from 'node:assert/strict';
import {convertRows} from '../src/input';
import {exampleRows,exampleInfo} from '../src/examples';
import {selectWithDetails,quotas} from '../src/select';
import {allocate} from '../src/allocate';
const bank=convertRows(exampleRows,exampleInfo),base={count:20,ratio:'',balanced:true,mix:true,seed:'exam-001',typeCounts:{choice:14,short:6},difficultyCounts:[4,10,6]};
test('60 original examples: exact composition, explanations, five units, all levels in both types',()=>{
 assert.equal(bank.questions.length,60);assert.deepEqual(bank.issues,[]);
 assert.equal(bank.questions.filter(q=>q.type==='choice'&&q.choices.length===4).length,30);
 assert.equal(bank.questions.filter(q=>q.type==='choice'&&q.choices.length===5).length,12);
 assert.equal(bank.questions.filter(q=>q.type==='short').length,18);
 assert.equal(new Set(bank.questions.map(q=>q.classification.unit?.name)).size,5);
 assert.ok(bank.questions.every(q=>q.explanation?.text&&!/엔진|StandardQuestion/.test(q.explanation.text)));
 for(const type of ['choice','short'])for(const level of ['상','중','하'])assert.ok(bank.questions.filter(q=>q.type===type&&q.difficulty?.level===level).length>=4);
});
test('exact type and overall difficulty quotas, 100 seeds, no duplicates, reproducible',()=>{
 for(let n=0;n<100;n++){const s={...base,seed:String(n)},r=selectWithDetails(bank.questions,s);assert.deepEqual(r.difficulty,[4,10,6]);assert.equal(r.questions.filter(q=>q.question.type==='short').length,6);assert.equal(r.questions.filter(q=>q.question.type==='choice').length,14);assert.equal(new Set(r.questions.map(q=>q.question.id)).size,20);assert.deepEqual(r,selectWithDetails(bank.questions,s));assert.deepEqual(r.warnings,[]);}
});
test('40 and 60 boundary counts and fallback explicitly explain changed levels',()=>{
 for(const count of [40,60]){const types=quotas(count,[42,18]),r=selectWithDetails(bank.questions,{...base,count,typeCounts:{choice:types[0],short:types[1]},difficultyCounts:quotas(count,[2,5,3])});assert.equal(r.questions.length,count);assert.equal(new Set(r.questions.map(q=>q.question.id)).size,count);assert.equal(r.questions.filter(q=>q.question.type==='short').length,types[1]);if(count===60)assert.ok(r.warnings.some(w=>/모자라.*으로.*채웠/.test(w)));}
});
test('shortage and invalid sum report actionable maxima',()=>{
 assert.throws(()=>selectWithDetails(bank.questions,{...base,typeCounts:{choice:1,short:19}}),/단답은 18개뿐/);
 assert.throws(()=>selectWithDetails(bank.questions,{...base,typeCounts:{choice:14,short:5}}),/합계/);
 assert.throws(()=>selectWithDetails(bank.questions,{...base,difficultyCounts:[0,0,0]}),/합계/);
});
test('allocation reroutes type buckets to achieve feasible whole-exam targets',()=>{
 assert.deepEqual(allocate([[2,2,0],[2,0,0]],[2,2],[2,2,0]),[[0,2,0],[2,0,0]]);
});
test('allocation minimizes deviation: exhaustive feasible allocations for 100 small banks',()=>{
 for(let n=0;n<100;n++){
  const caps=[[n%3,(n*7+1)%3,(n*11+1)%3],[(n+2)%3,(n*3+1)%3,(n*5+2)%3]],types=caps.map(row=>Math.min(3,row.reduce((a,b)=>a+b,0))),targets=quotas(types[0]+types[1],[1+n%4,2,1]);
  const actual=allocate(caps,types,targets),score=(a:number[][])=>targets.reduce((sum,target,l)=>sum+Math.abs(a[0][l]+a[1][l]-target),0);
  let best=Infinity;
  const rows=caps.map((row,t)=>{const r:number[][]=[];for(let a=0;a<=row[0];a++)for(let b=0;b<=row[1];b++){const c=types[t]-a-b;if(c>=0&&c<=row[2])r.push([a,b,c]);}return r;});
  for(const a of rows[0])for(const b of rows[1])best=Math.min(best,score([a,b]));assert.equal(score(actual),best);
 }
});
test('unit balance operates inside each type when difficulty is unrestricted',()=>{
 const pool=bank.questions.flatMap((q,i)=>i<2?Array.from({length:12},(_,j)=>({...q,id:`${i}-${j}`,type:'short' as const,answer:['답'],classification:{unit:{name:['A','B','C'][j%3]}}})):[]);
 const r=selectWithDetails(pool,{...base,count:12,typeCounts:{choice:0,short:12},difficultyCounts:undefined});
 assert.deepEqual(['A','B','C'].map(unit=>r.questions.filter(q=>q.question.classification.unit?.name===unit).length),[4,4,4]);
});
