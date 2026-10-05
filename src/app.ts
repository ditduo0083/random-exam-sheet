import { MAX_BYTES, ratioWeights, type Bank } from './input';
import { paginatePrint, type PrintBlock } from './paginate-print';
import { defaults, readOverrides, saveOverrides, type HeaderSettings } from './header-settings';
import { selectWithDetails, quotas, type DisplayQuestion, type Settings } from './select';
import config from '../site.config.json';
import { exampleInfo, exampleRows } from './examples';
declare const PARSER_WORKER: string;
declare const LOGO_FILE: string;
const $ = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id)! as T;
let bank: Bank | null = null, busy = false, validPreview = false, current: DisplayQuestion[] = [];
let parseVersion = 0;
let selectionWarnings:string[]=[];
let overrides:Partial<HeaderSettings>={};
try{overrides=readOverrides(localStorage);}catch{}
let headerValues:HeaderSettings={...defaults(),...overrides};
let previewTimer:ReturnType<typeof setTimeout>;
const e = (tag:string,text='',className='') => { const el = document.createElement(tag); el.textContent = text; el.className=className; return el; };
const symbols = ['①','②','③','④','⑤'];
if (LOGO_FILE) { const logo=e('img') as HTMLImageElement; logo.src=LOGO_FILE; logo.alt='학교 로고'; document.querySelector('.logo')!.replaceChildren(logo); }
for (const [value,label] of [[config.downloadUrl,'프로그램 내려받기(zip)'],[config.repositoryUrl,'GitHub에서 보기·포크']]) {
  if (value && value !== 'TODO-URL' && /^(https:\/\/|\.\/)/.test(value)) { const a=e('a',label) as HTMLAnchorElement; a.href=value; a.rel='noopener noreferrer'; $('site-links').append(a); }
}
function invalidate() {
  validPreview=false; current=[];
  $('print-student').setAttribute('disabled',''); $('print-teacher').setAttribute('disabled','');
  $('student').replaceChildren(); $('teacher').replaceChildren(); $('empty-preview').hidden=false;
}
function bankReady(ready:boolean){
  ($('decoration-settings') as HTMLFieldSetElement).disabled=!ready;
  for(const el of Array.from(document.querySelectorAll<HTMLElement>('.bank-warning')))el.hidden=ready;
}
function displayValidation(next: Bank) {
  bank=next; invalidate();
  headerValues={...defaults(next.info),...overrides};syncHeaderControls();
  const errors=next.issues.filter(i=>i.severity==='error').length, warnings=next.issues.length-errors;
  const container=$('validation'); container.replaceChildren(e('strong',`${next.questions.length}문항 · 오류 ${errors}개 · 경고 ${warnings}개`,errors?'error':'success'));
  if (next.issues.length) { const ul=e('ul'); for (const issue of next.issues) ul.append(e('li',`${issue.row ? issue.row+'행' : '시험정보'} · ${issue.message}`,issue.severity)); container.append(ul); }
  container.append(e('p',errors?'표시된 행을 고친 뒤 파일을 다시 열어 주세요. 오류가 있으면 문제지와 인쇄를 만들지 않습니다.':'검사 통과. 뽑기 설정을 확인하고 문제지를 만드세요.'));
  ($('settings') as HTMLFieldSetElement).disabled=errors>0;
  bankReady(errors===0);
  ($('count') as HTMLInputElement).value=next.info['문항수'] || String(next.questions.length);
  ($('count') as HTMLInputElement).max=String(next.questions.length);
  ($('ratio') as HTMLInputElement).value=next.info['난이도비율'] || '';
  const hasUnits=next.questions.some(q=>q.classification.unit?.name);
  ($('balanced') as HTMLInputElement).disabled=!hasUnits;
  ($('balanced') as HTMLInputElement).checked=hasUnits;
  if(!errors)initCounts(); $('generation').textContent='';
}
function parseInWorker(data: object): Promise<Bank> {
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(new Blob([PARSER_WORKER],{type:'text/javascript'}));
    let worker:Worker;
    try { worker=new Worker(url); } catch { URL.revokeObjectURL(url); reject(Error('파일 검사 작업을 시작하지 못했습니다. 최신 Chrome 또는 Edge에서 열어 주세요.')); return; }
    const clean=()=>{clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);};
    const timer=setTimeout(()=>{clean();reject(Error('파일 읽기가 8초를 넘었습니다. 파일을 나누거나 CSV로 저장해 다시 열어 주세요.'));},8000);
    worker.onmessage=({data})=>{clean();data.error?reject(Error(data.error)):resolve(data.bank);};
    worker.onerror=()=>{clean();reject(Error('파일 형식을 읽지 못했습니다. 제공 양식으로 다시 저장해 주세요.'));};
    worker.postMessage(data);
  });
}
async function load(data:object) {
  const version=++parseVersion;
  invalidate(); bank=null; busy=true; bankReady(false); ($('settings') as HTMLFieldSetElement).disabled=true;
  $('validation').textContent='이 컴퓨터에서 파일을 검사하고 있습니다…';
  try { const result=await parseInWorker(data); if(version===parseVersion) displayValidation(result); }
  catch(error) { if(version===parseVersion) $('validation').replaceChildren(e('p',(error as Error).message,'error')); }
  finally { if(version===parseVersion) busy=false; }
}
$('file').addEventListener('change',async()=>{
  const file=($('file') as HTMLInputElement).files?.[0]; if (!file) return;
  if(file.size>MAX_BYTES || !/\.(xlsx|csv)$/i.test(file.name)) { ++parseVersion; busy=false;bank=null;invalidate();bankReady(false);($('settings') as HTMLFieldSetElement).disabled=true;$('validation').replaceChildren(e('p','5MB 이하의 xlsx 또는 UTF-8 CSV 파일을 선택해 주세요.','error'));return; }
  // Invalidate immediately, even while the browser reads the selected file.
  const readVersion=++parseVersion;invalidate();bank=null;busy=true;bankReady(false);($('settings') as HTMLFieldSetElement).disabled=true;
  try {
    const data=/\.xlsx$/i.test(file.name) ? {kind:'xlsx',buffer:await file.arrayBuffer()} : {kind:'text',text:await file.text(),delimiter:','};
    if(readVersion===parseVersion) await load(data);
  } catch(error) { if(readVersion===parseVersion) {busy=false;$('validation').replaceChildren(e('p','파일을 읽지 못했습니다. 파일을 다시 선택해 주세요.','error'));} }
});
$('read-paste').addEventListener('click',()=>load({kind:'text',text:($('paste') as HTMLTextAreaElement).value,delimiter:'\t'}));
$('example').addEventListener('click',()=>{
  const quote=(v:string)=>'"'+v.replaceAll('"','""')+'"';
  const rows=[...exampleInfo,...exampleRows];
  load({kind:'text',text:rows.map(r=>r.map(quote).join(',')).join('\r\n'),delimiter:','});
});
const value=(id:string)=>Number(($<HTMLInputElement>(id)).value);
function setNumber(id:string,n:number){$<HTMLInputElement>(id).value=String(n);}
function levelValues(){return [0,1,2].map(i=>value(`level-${i}`));}
function putLevels(weights:number[]){const values=quotas($<HTMLSelectElement>('difficulty-mode').value==='percent'?100:value('count'),weights);values.forEach((n,i)=>setNumber(`level-${i}`,n));}
function updateTotals(){
  const total=value('count'),sum=value('choice-count')+value('short-count');
  $('type-total').textContent=`합계 ${sum} / 전체 ${total}개 · 은행: 선택 ${bank?.questions.filter(q=>q.type==='choice').length ?? 0}개 · 단답 ${bank?.questions.filter(q=>q.type==='short').length ?? 0}개`;
  const percent=$<HTMLSelectElement>('difficulty-mode').value==='percent',target=percent?100:total,levels=levelValues(),levelSum=levels.reduce((a,b)=>a+b,0);
  $('difficulty-total').textContent=`난이도 합계 ${levelSum}${percent?'%':'개'} / ${target}${percent?'%':'개'}${levelSum!==target?' · 합계를 맞춰 주세요.':''}`;
  for(const el of Array.from(document.querySelectorAll('.level-unit')))el.textContent=percent?'%':'개';
}
function initCounts(){
  const choice=bank!.questions.filter(q=>q.type==='choice').length,short=bank!.questions.length-choice;
  const counts=quotas(value('count'),[choice,short]);setNumber('choice-count',counts[0]);setNumber('short-count',counts[1]);
  putLevels(ratioWeights($<HTMLInputElement>('ratio').value)||[1,1,1]);updateTotals();
}
$('settings').addEventListener('input',event=>{
  const id=(event.target as HTMLElement).id;
  if(id==='count'){const weights=levelValues();const counts=quotas(Math.max(1,value('count')),[value('choice-count'),value('short-count')].some(n=>n>0)?[value('choice-count'),value('short-count')]:[1,1]);setNumber('choice-count',counts[0]);setNumber('short-count',counts[1]);if($<HTMLSelectElement>('difficulty-mode').value==='count')putLevels(weights.some(n=>n>0)?weights:[1,1,1]);}
  if(id==='choice-count'||id==='short-count'){const chosen=Math.max(0,value(id));if(chosen>value('count')){const weights=levelValues();setNumber('count',chosen);if($<HTMLSelectElement>('difficulty-mode').value==='count')putLevels(weights.some(n=>n>0)?weights:[1,1,1]);}setNumber(id==='choice-count'?'short-count':'choice-count',Math.max(0,value('count')-chosen));}
  if(id==='difficulty-mode'){const weights=levelValues();putLevels(weights.some(n=>n>0)?weights:[1,1,1]);}
  updateTotals();invalidate();$('selection-summary').textContent=$('generation').textContent='설정이 바뀌었습니다. 문제지를 다시 만들어 주세요.';
});
$('apply-ratio').addEventListener('click',()=>{try{putLevels(ratioWeights($<HTMLInputElement>('ratio').value)||[1,1,1]);updateTotals();invalidate();}catch(error){$('selection-summary').textContent=(error as Error).message;}});
$('new-seed').addEventListener('click',()=>{$<HTMLInputElement>('seed').value=Array.from(crypto.getRandomValues(new Uint32Array(2)),v=>v.toString(16)).join('-');invalidate();});
function settings():Settings {
  const percent=$<HTMLSelectElement>('difficulty-mode').value==='percent',levels=levelValues();
  if(levels.some(n=>!Number.isFinite(n)||n<0)||(percent && levels.reduce((a,b)=>a+b,0)!==100))throw Error('상·중·하 비율의 합계를 100%로 맞춰 주세요.');
  return {count:value('count'),ratio:percent?`상${levels[0]}:중${levels[1]}:하${levels[2]}`:'',difficultyCounts:percent?undefined:levels,typeCounts:{choice:value('choice-count'),short:value('short-count')},balanced:$<HTMLInputElement>('balanced').checked,mix:$<HTMLInputElement>('mix').checked,seed:$<HTMLInputElement>('seed').value};
}
function activateTab(index:number,focus=false){for(let i=0;i<4;i++){const tab=$(`tab-${i}`);tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;$(`panel-${i}`).hidden=i!==index;}if(focus)$(`tab-${index}`).focus();}
for(let i=0;i<4;i++){$(`tab-${i}`).addEventListener('click',()=>activateTab(i));$(`tab-${i}`).addEventListener('keydown',event=>{const key=(event as KeyboardEvent).key;if(key==='ArrowLeft'||key==='ArrowRight'){event.preventDefault();activateTab((i+(key==='ArrowRight'?1:3))%4,true);}});}
$('size').addEventListener('input',updateHeaderPreview);
// Only explicitly edited settings persist; new uploads still supply their own defaults.
for(const [key,label] of [['school','학교명'],['title','시험 제목'],['subject','과목'],['time','시험시간'],['grade','학년'],['className','반'],['notice','안내문구']] as const){
  const onKey=key==='className'?'classOn':`${key}On`,row=e('div','','header-field');
  const toggle=e('input') as HTMLInputElement;toggle.type='checkbox';toggle.id=onKey;toggle.dataset.header=onKey;
  const toggleLabel=e('label','','check');toggleLabel.append(toggle,document.createTextNode(`${label} 표시`));
  const input=e(key==='notice'?'textarea':'input') as HTMLInputElement;input.id=key;input.dataset.header=key;input.setAttribute('aria-label',label);input.setAttribute('maxlength',key==='notice'?'1200':'180');
  row.append(toggleLabel,input);$('header-fields').append(row);
}
for(const [key,label] of [['numberOn','번호 칸'],['nameOn','이름 칸']] as const){const input=e('input') as HTMLInputElement;input.type='checkbox';input.id=key;input.dataset.header=key;const labelEl=e('label','','check');labelEl.append(input,document.createTextNode(`${label} 표시`));$('header-fields').append(labelEl);}
function syncHeaderControls(){for(const el of Array.from(document.querySelectorAll<HTMLInputElement>('[data-header]'))){const value=headerValues[el.dataset.header as keyof HeaderSettings];if(el.type==='checkbox')el.checked=Boolean(value);else el.value=String(value);}}
function remember(){let saved=false;try{saved=saveOverrides(localStorage,overrides);}catch{}$('header-message').textContent=saved?'이 브라우저에 설정을 기억했습니다.':'이 브라우저에서는 설정 저장이 막혀 있습니다. 현재 화면에서는 계속 쓸 수 있습니다.';}
function updateHeaderPreview(){clearTimeout(previewTimer);if(current.length){$('print-student').setAttribute('disabled','');$('print-teacher').setAttribute('disabled','');previewTimer=setTimeout(()=>renderPreview(),100);}}
$('header-settings').addEventListener('input',event=>{
  const input=event.target as HTMLInputElement,key=input.dataset.header as keyof HeaderSettings;if(!key)return;
  const value=input.type==='checkbox'?input.checked:input.value;
  Object.assign(headerValues,{[key]:value});Object.assign(overrides,{[key]:value});remember();updateHeaderPreview();
});
$('reset-header').addEventListener('click',()=>{overrides={};headerValues=defaults(bank?.info);($('exam-logo') as HTMLInputElement).value='';syncHeaderControls();remember();updateHeaderPreview();});
$('exam-logo').addEventListener('change',async()=>{
  const file=($('exam-logo') as HTMLInputElement).files?.[0];if(!file)return;
  if(file.size>MAX_BYTES || !/\.(png|jpe?g|svg)$/i.test(file.name)){$('header-message').textContent='시험지 로고는 5MB 이하 PNG·JPG·SVG로 선택해 주세요.';return;}
  try{
    const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('이미지를 읽지 못했습니다.'));reader.readAsDataURL(file);});
    const img=new Image();img.src=data;await img.decode();
    headerValues.logoData=data;if(headerValues.logoPosition==='none')headerValues.logoPosition='left';
    overrides.logoData=data;overrides.logoPosition=headerValues.logoPosition;syncHeaderControls();remember();updateHeaderPreview();
  }catch{$('header-message').textContent='이미지를 읽지 못했습니다. PNG·JPG·SVG 파일을 확인해 주세요.';}
});
syncHeaderControls();
function identity(){
  const p=headerValues,box=e('div','',`identification ${p.identityPosition}`);
  const fields=[p.gradeOn?(p.grade?`${p.grade}학년`:'학년 ____'):'',p.classOn?(p.className?`${p.className}반`:'반 ____'):'',p.numberOn?'번호 ______':'',p.nameOn?'이름 ______________':''].filter(Boolean);
  for(const text of fields)box.append(e('span',text));return box;
}
function header(teacher:boolean){
  const p=headerValues,h=e('header','',`sheet-header identity-${p.identityPosition}`),top=e('div','','header-top'),heading=e('div','','header-heading');
  if(p.schoolOn && p.school)heading.append(e('p',p.school,'school-name'));
  const title=(p.titleOn?p.title:'')+(teacher?' · 교사용 정답지':'');if(title)heading.append(e('h3',title));
  const row=e('div','','title-row');
  if(p.logoData && p.logoPosition!=='none'){const logo=e('img','',`exam-logo ${p.logoSize}`) as HTMLImageElement;logo.src=p.logoData;logo.alt='시험지 로고';if(p.logoPosition==='left')row.append(logo,heading);else row.append(heading,logo);}else row.append(heading);
  top.append(row);const identification=identity();if(p.identityPosition==='box' && identification.children.length)top.append(identification);h.append(top);
  const meta=[p.subjectOn?p.subject:'',p.timeOn && p.time?`시험시간 ${p.time}`:''].filter(Boolean).join(' · ');if(meta)h.append(e('p',meta,'exam-meta'));
  if(p.identityPosition==='line' && identification.children.length)h.append(identification);
  if(p.noticeOn && p.notice)h.append(e('p',p.notice,'exam-notice'));return h;
}
function questionElement(d:DisplayQuestion){
  const el=e('article','','question');el.dataset.number=String(d.number);el.dataset.id=d.question.id;el.dataset.type=d.question.type;el.append(e('div',`${d.number}. ${d.question.stem}`,'stem'));
  if(d.choices){const ul=e('ul','','choices');d.choices.forEach((c,i)=>ul.append(e('li',`${symbols[i]} ${c}`)));el.append(ul);}else el.append(e('div','','short-line'));return el;
}
function chooseColumns(el:HTMLElement){
  const ul=el.querySelector<HTMLElement>('.choices');if(!ul)return;
  const style=getComputedStyle(ul),items=Array.from(ul.children) as HTMLElement[],width=ul.getBoundingClientRect().width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),gap=parseFloat(style.columnGap)||16;
  // Intrinsic no-wrap widths include the printed choice number. All columns
  // have the same width, determined by the longest item.
  ul.classList.add('width-probe');const widest=Math.max(...items.map(item=>item.getBoundingClientRect().width));ul.classList.remove('width-probe');
  const candidates=items.length===5?[5,3,2,1]:[4,2,1];
  const columns=candidates.find(n=>widest*n+gap*(n-1)<=width) || 1;
  ul.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;ul.dataset.columns=String(columns);
  // An individually over-wide choice wraps in one column instead of clipping.
}
function sheet(teacher:boolean,pageNumber:string,size:string){
  const p=headerValues,page=e('section','',`sheet ${size}`);page.append(header(teacher),e('div','','sheet-body'));
  const footer=e('footer','',`sheet-footer page-${p.pagePosition}`);
  footer.append(e('span',p.footerText || (p.seedOn?`시드: ${settings().seed}`:''),'footer-left'),e('span',p.pageOn?pageNumber:'','page-number'));
  page.append(footer);return page;
}
interface ElementBlock {element:HTMLElement;type:string;id:string;heading?:boolean}
function contentBlocks(teacher:boolean):ElementBlock[]{
  const blocks:ElementBlock[]=[];
  if(!teacher){
    for(const [type,label] of [['choice','Ⅰ. 선택형'],['short','Ⅱ. 단답형']] as const){const group=current.filter(d=>d.question.type===type);if(!group.length)continue;
      blocks.push({element:e('h4',`${label} (${group.length}문항)`,'type-heading'),type,id:`heading-${type}`,heading:true});
      for(const d of group)blocks.push({element:questionElement(d),type,id:d.question.id});
    }
  }else{
    blocks.push({element:e('h4','정답표','type-heading'),type:'answers',id:'answers-heading',heading:true});
    for(let i=0;i<current.length;i+=5){const row=e('div','','answer-table');for(const d of current.slice(i,i+5)){
      const cell=e('div','','answer-cell');cell.dataset.number=String(d.number);
      const correct=d.question.type==='choice'?`${symbols[d.choiceOrder!.indexOf(d.question.answer-1)]} ${d.question.choices[d.question.answer-1]}`:d.correct;
      cell.append(e('strong',String(d.number)),e('span',correct));row.append(cell);
    }blocks.push({element:row,type:'answers',id:`answers-${i}`});}
    const explanations=current.filter(d=>d.question.explanation?.text);
    if(explanations.length){blocks.push({element:e('h4','해설','type-heading'),type:'explanation',id:'explanation-heading',heading:true});
      for(const d of explanations){const el=e('article',`${d.number}. ${d.question.explanation!.text}`,'explanation');el.dataset.number=String(d.number);blocks.push({element:el,type:'explanation',id:`explanation-${d.question.id}`});}}
  }return blocks;
}
function renderRegion(target:HTMLElement,teacher:boolean,size:string){
  const probe=e('div','','measure'),page=sheet(teacher,'999/999',size);probe.append(page);document.body.append(probe);
  try{
    const body=page.querySelector<HTMLElement>('.sheet-body')!,available=body.getBoundingClientRect().height-2;
    if(available<100)throw Error('머리글이 너무 깁니다. 안내문구 또는 바닥글을 줄여 주세요.');
    const blocks=contentBlocks(teacher),measured:PrintBlock[]=blocks.map(b=>{body.append(b.element);chooseColumns(b.element);const height=b.element.getBoundingClientRect().height;b.element.remove();return {id:b.id,type:b.type,height,heading:b.heading};});
    const pages=paginatePrint(measured,available),warnings:string[]=[];
    target.replaceChildren(...pages.map((p,i)=>{const page=sheet(teacher,`${i+1}/${pages.length}`,size);page.querySelector('.sheet-body')!.append(...p.indices.map(n=>blocks[n].element));
      if(p.oversized.length){page.classList.add('oversized-sheet');for(const n of p.oversized)warnings.push(`${teacher?'정답지':'학생용'} ${blocks[n].element.dataset.number || '정답표'}번이 한 쪽보다 깁니다. 단독 쪽으로 인쇄하며 긴 문항은 다음 용지에 이어질 수 있습니다.`);}return page;}));
    return {count:pages.length,warnings};
  }finally{probe.remove();}
}
function renderPreview(){
  if(!current.length)return;
  try{
    let size=($('size') as HTMLSelectElement).value,student=renderRegion($('student'),false,size),note='';
    const target=Number($<HTMLSelectElement>('fit-pages').value)||0;
    if(target && student.count>target && size!=='small'){size='small';student=renderRegion($('student'),false,size);note='글자를 작게(9.5pt)로 줄였습니다. ';}
    const teacher=renderRegion($('teacher'),true,size),countChoice=current.filter(d=>d.question.type==='choice').length;
    validPreview=true;$('empty-preview').hidden=true;$('print-student').removeAttribute('disabled');$('print-teacher').removeAttribute('disabled');
    $('generation').replaceChildren(e('p',`${note}${current.length}문항 (선택 ${countChoice} · 단답 ${current.length-countChoice}) · 학생용 ${student.count}쪽 · 정답지 ${teacher.count}쪽`));
    $('student').dataset.effectiveSize=size;$('student').dataset.pages=String(student.count);
    for(const text of selectionWarnings)$('generation').append(e('p',text,'warning'));
    if(target && student.count>target)$('generation').append(e('p','문항 수를 줄이거나 글자를 작게 해 보세요. 현재 쪽 수로도 인쇄합니다.','warning'));
    if(size!=='small' && student.count>1 && student.count%2===1){const small=renderRegion(e('div'),false,'small');if(small.count<student.count && small.count%2===0){const p=e('p',`${student.count}쪽입니다. 글자를 작게 하면 ${small.count}쪽(양면 ${small.count/2}장)에 들어갑니다.`),button=e('button','작게 해서 다시 만들기');button.id='shrink-even';button.addEventListener('click',()=>{$<HTMLSelectElement>('size').value='small';renderPreview();});$('generation').append(p,button);}}
    for(const text of [...student.warnings,...teacher.warnings])$('generation').append(e('p',text,'warning'));
  }catch(error){invalidate();$('generation').replaceChildren(e('p',(error as Error).message,'error'));}
}
$('generate').addEventListener('click',()=>{clearTimeout(previewTimer);invalidate();if(!bank || busy || bank.issues.some(i=>i.severity==='error'))return;try{const result=selectWithDetails(bank.questions,settings());current=result.questions;selectionWarnings=result.warnings;$('selection-summary').textContent=`상 ${result.difficulty[0]} · 중 ${result.difficulty[1]} · 하 ${result.difficulty[2]}개. ${result.warnings.join(' ')}`;activateTab(3);renderPreview();}catch(error){invalidate();$('selection-summary').replaceChildren(e('p',(error as Error).message,'error'));$('generation').replaceChildren(e('p',(error as Error).message,'error'));}});
function show(teacher:boolean) { $('student').hidden=teacher;$('teacher').hidden=!teacher;$('show-student').setAttribute('aria-pressed',String(!teacher));$('show-teacher').setAttribute('aria-pressed',String(teacher)); }
$('show-student').addEventListener('click',()=>show(false));$('show-teacher').addEventListener('click',()=>show(true));
function print(teacher:boolean) { if(!validPreview)return;document.body.classList.remove('print-student','print-teacher');document.body.classList.add(teacher?'print-teacher':'print-student');window.print(); }
$('print-student').addEventListener('click',()=>print(false));$('print-teacher').addEventListener('click',()=>print(true));
window.addEventListener('afterprint',()=>document.body.classList.remove('print-student','print-teacher'));
window.addEventListener('beforeprint',()=>{if(validPreview && !document.body.classList.contains('print-student') && !document.body.classList.contains('print-teacher')) document.body.classList.add($('teacher').hidden?'print-student':'print-teacher');});
