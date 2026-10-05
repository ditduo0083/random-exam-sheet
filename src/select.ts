import { pickBalanced, orderByType, shuffle, shuffleChoices, formatCorrectAnswer } from '../vendor/engine/index';
import { asEngine, ratioWeights, type PrintQuestion } from './input';
import { allocate } from './allocate';
export function seededRng(seed: string) {
  let state = 2166136261;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0),16777619);
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15,t|1); t ^= t+Math.imul(t ^ t >>> 7,t|61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export interface Settings { count:number; ratio:string; balanced:boolean; mix:boolean; seed:string; typeCounts?:{choice:number;short:number}; difficultyCounts?:number[] }
export interface DisplayQuestion { question:PrintQuestion; number:number; choices?:string[]; choiceOrder?:readonly number[]; correct:string }
export function quotas(count: number, weights: number[]) {
  const sum = weights.reduce((a,b) => a+b,0), exact = weights.map(w => w/sum*count), result = exact.map(Math.floor);
  const order = exact.map((v,i) => ({i,remainder:v-result[i]})).sort((a,b)=>b.remainder-a.remainder || a.i-b.i);
  for (let n = count-result.reduce((a,b)=>a+b,0), i=0;i<n;i++) result[order[i].i]++;
  return result;
}
export function selectWithDetails(pool:PrintQuestion[],settings:Settings):{questions:DisplayQuestion[];warnings:string[];difficulty:number[]} {
  if (!Number.isInteger(settings.count) || settings.count < 1 || (!settings.typeCounts && settings.count > pool.length)) throw Error(`문항수는 1~${pool.length}로 정해 주세요.`);
  if (!settings.seed.trim() || settings.seed.length > 80) throw Error('재현할 섞기 시드를 1~80자로 적어 주세요.');
  const rng = seededRng(settings.seed), weights = ratioWeights(settings.ratio);
  const key = settings.balanced ? (q: any) => q.classification.unit?.name || '미분류' : () => '전체';
  let selected: PrintQuestion[];
  const warnings:string[]=[];
  if(settings.typeCounts){
    const types=['choice','short'] as const,names=['선택','단답'],counts=types.map(t=>settings.typeCounts![t]),levels=['상','중','하'];
    if(counts.some(n=>!Number.isInteger(n)||n<0)||counts[0]+counts[1]!==settings.count)throw Error('선택형·단답형 개수 합계를 문항수와 맞춰 주세요.');
    for(let t=0;t<2;t++){const available=pool.filter(q=>q.type===types[t]).length;if(counts[t]>available)throw Error(`${names[t]}은 ${available}개뿐입니다. 요청 ${counts[t]}개를 줄여 주세요.`);}
    const targets=settings.difficultyCounts ?? (weights?quotas(settings.count,weights):null);
    if(targets && (targets.length!==3 || targets.some(n=>!Number.isInteger(n)||n<0) || targets.reduce((a,b)=>a+b,0)!==settings.count))throw Error('상·중·하 개수의 합계를 문항수와 맞춰 주세요.');
    if(targets){
      const capacities=types.map(type=>levels.map(level=>pool.filter(q=>q.type===type && (q.difficulty?.level||'중')===level).length));
      const allocation=allocate(capacities,counts,targets);
      selected=types.flatMap((type,t)=>levels.flatMap((level,l)=>pickBalanced(pool.filter(q=>q.type===type && (q.difficulty?.level||'중')===level).map(asEngine),allocation[t][l],key,rng) as PrintQuestion[]));
      const actual=levels.map((_,l)=>allocation[0][l]+allocation[1][l]);
      const surplus=actual.map((n,l)=>Math.max(0,n-targets[l]));
      for(let l=0;l<3;l++){let missing=targets[l]-actual[l];if(missing<=0)continue;for(let next=0;next<3 && missing>0;next++){const amount=Math.min(missing,surplus[next]);if(!amount)continue;const contributors=types.map((_,t)=>allocation[t][next]>0?names[t]:'').filter(Boolean).join('·');warnings.push(`${levels[l]} 난이도가 ${amount}개 모자라 ${contributors} ${levels[next]}으로 ${amount}개 채웠습니다. 유형별 개수는 유지했습니다.`);missing-=amount;surplus[next]-=amount;}}
    }else selected=types.flatMap((type,t)=>pickBalanced(pool.filter(q=>q.type===type).map(asEngine),counts[t],key,rng) as PrintQuestion[]);
    selected=shuffle(selected,rng);
  } else if (weights) {
    const targets = quotas(settings.count,weights);
    const levels = ['상','중','하'];
    selected = levels.flatMap((level,i) => {
      const group = pool.filter(q => (q.difficulty?.level || '중') === level);
      if (group.length < targets[i]) throw Error(`${level} 문항이 ${targets[i]-group.length}개 부족합니다. 비율 또는 문항수를 조정해 주세요. (빈 난이도는 중)`);
      return pickBalanced(group.map(asEngine),targets[i],key,rng) as PrintQuestion[];
    });
    selected = shuffle(selected,rng);
  } else selected = pickBalanced(pool.map(asEngine),settings.count,key,rng) as PrintQuestion[];
  // With a ratio, balance units inside each difficulty bucket. Strict global
  // unit equality cannot always coexist with strict difficulty quotas.
  const questions=orderByType(selected,['choice','short']).map((question,index) => {
    if (question.type === 'choice') {
      const mixed = settings.mix ? shuffleChoices(asEngine(question) as Extract<ReturnType<typeof asEngine>,{type:'choice'}>,rng) : {choices:question.choices,choiceOrder:question.choices.map((_,i)=>i)};
      return {question,number:index+1,...mixed,correct:formatCorrectAnswer(asEngine(question),mixed)};
    }
    return {question,number:index+1,correct:question.answer.join(' | ')};
  });
  return {questions,warnings,difficulty:['상','중','하'].map(level=>selected.filter(q=>(q.difficulty?.level||'중')===level).length)};
}
export function selectQuestions(pool:PrintQuestion[],settings:Settings):DisplayQuestion[]{return selectWithDetails(pool,settings).questions;}
