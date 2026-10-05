import test from 'node:test';
import assert from 'node:assert/strict';
import { paginatePrint, type PrintBlock } from '../src/paginate-print';
import { paginate } from '../vendor/engine/index';
import { defaults, readOverrides, saveOverrides, STORAGE_KEY } from '../src/header-settings';
const blocks=(types:string[],heights:number[]):PrintBlock[]=>types.map((type,i)=>({id:String(i),type,height:heights[i]}));
test('paper pages mix types and exact height boundary stays on the page',()=>{
 const b=blocks(['choice','short','short'],[50,50,1]);assert.deepEqual(paginatePrint(b,100).map(p=>p.indices),[[0,1],[2]]);
 assert.deepEqual(paginatePrint(b,100,{splitByType:true}).map(p=>p.indices),[[0],[1,2]]);
});
test('headings travel with first question, including oversized first question',()=>{
 for(const height of [30,120]){const b=blocks(['choice','short','short','short'],[80,10,height,20]);b[1].heading=true;
  const p=paginatePrint(b,100);assert.deepEqual(p[0].indices,[0]);assert.deepEqual(p[1].indices.slice(0,2),[1,2]);
  assert.ok(!p.some(page=>page.indices.length===1 && b[page.indices[0]].heading));}
});
test('oversized questions have a dedicated logical page and allow subsequent pages',()=>{
 const p=paginatePrint(blocks(['choice','choice','short'],[40,160,20]),100);assert.deepEqual(p.map(p=>p.indices),[[0],[1],[2]]);assert.deepEqual(p[1].oversized,[1]);
});
test('zero heights, empty input and invalid height inputs are explicit',()=>{
 assert.deepEqual(paginatePrint([],100),[]);assert.deepEqual(paginatePrint(blocks(['choice','short'],[0,0]),100).map(p=>p.indices),[[0,1]]);
 assert.throws(()=>paginatePrint([],0));assert.throws(()=>paginatePrint(blocks(['choice'],[NaN]),100));assert.throws(()=>paginatePrint(blocks(['choice'],[-1]),100));
});
test('type split compatibility matches engine capacities, weighting and height in 200 scenarios',()=>{
 for(let seed=0;seed<200;seed++){
  const types=Array.from({length:20},(_,i)=>i<12?'choice' as const:'short' as const),heights=types.map((_,i)=>((i*37+seed*19)%130)+1);
  const questions=types.map((type,i)=>({id:String(i),type,media:i%5===0?{stemImage:'fixture'}:undefined}));
  const b=blocks(types,heights).map((v,i)=>({...v,weight:questions[i].media?2:1}));
  assert.deepEqual(paginatePrint(b,300,{splitByType:true}).map(p=>p.indices),paginate(questions,{heights,availableHeight:300}).map(p=>p.indices));
 }
});
test('header defaults parse file values and blank grade/class have empty values',()=>{
 const p=defaults({학교명:'가상 학교',학년반:'2학년 3반',시험시간:'30분'});assert.equal(p.grade,'2');assert.equal(p.className,'3');assert.equal(p.time,'30분');assert.equal(defaults().grade,'');
});
test('only edited overrides persist and storage failures never stop work',()=>{
 let stored='';const storage={getItem:()=>stored,setItem:(_k:string,v:string)=>stored=v};
 assert.ok(saveOverrides(storage,{school:'새 학교',timeOn:false}));assert.deepEqual(readOverrides(storage),{school:'새 학교',timeOn:false});
 assert.equal({...defaults({과목:'새 파일 과목'}),...readOverrides(storage)}.subject,'새 파일 과목');
 assert.equal(saveOverrides({setItem:()=>{throw Error('blocked');}},{}),false);assert.deepEqual(readOverrides({getItem:()=>{throw Error('blocked');}}),{});
 storage.setItem(STORAGE_KEY,'{"__proto__":{"bad":true},"logoPosition":"wrong","schoolOn":"false"}');assert.deepEqual(readOverrides(storage),{});
});
