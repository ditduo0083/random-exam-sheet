import * as XLSX from 'xlsx';
import { QUESTION_FORMAT_VERSION, type StandardQuestion, type QuestionBase } from '../vendor/question/standard';
import { validateStandardQuestion, normalizeQuestionText } from '../vendor/question/validate';

// A local extension, not a change to kse-question/0.1. Only array-generic engine
// helpers receive it; choice grading (which is limited to four) is never called.
export type PrintQuestion = QuestionBase & (
  { type: 'choice'; choices: string[]; answer: number } | { type: 'short'; answer: string[] }
);
export type ExamInfo = Record<string, string>;
export interface Issue { row: number; severity: 'error' | 'warning'; message: string }
export interface Bank { info: ExamInfo; questions: PrintQuestion[]; issues: Issue[] }
export const HEADERS = ['번호','유형','문제','보기1','보기2','보기3','보기4','보기5','정답','난이도','단원','해설'];
export const INFO_KEYS = ['학교명','시험제목','과목','학년반','시험시간','안내문구','문항수','난이도비율'];
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;
const cell = (v: unknown) => String(v ?? '').trim();

// CSV allows metadata rows before the question header. TSV paste uses the same
// grammar, including quoted tabs/newlines. No spreadsheet formulas are executed.
export function delimitedRows(text: string, delimiter = ','): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i+1] === '"') { value += '"'; i++; }
      else if (quoted || value === '') quoted = !quoted;
      else value += c;
    } else if (!quoted && (c === delimiter || c === '\n' || c === '\r')) {
      row.push(value); value = '';
      if (c !== delimiter) { rows.push(row); row = []; if (c === '\r' && text[i+1] === '\n') i++; }
    } else value += c;
    if (rows.length > MAX_ROWS + 30) throw Error('문항은 5,000개까지 읽습니다. 파일을 나눠 주세요.');
  }
  if (quoted) throw Error('따옴표가 닫히지 않았습니다. CSV 양식을 확인해 주세요.');
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}
export function ratioWeights(text: string): number[] | null {
  if (!text.trim()) return null;
  const match = /^상\s*(\d+(?:\.\d+)?)\s*:\s*중\s*(\d+(?:\.\d+)?)\s*:\s*하\s*(\d+(?:\.\d+)?)$/.exec(text.trim());
  if (!match) throw Error('난이도비율은 상2:중5:하3처럼 적어 주세요.');
  const weights = match.slice(1).map(Number);
  if (!weights.every(Number.isFinite) || weights.reduce((a,b) => a+b,0) <= 0) throw Error('난이도비율의 합은 0보다 커야 합니다.');
  return weights;
}
export function convertRows(rows: unknown[][], infoRows: unknown[][] = []): Bank {
  const info: ExamInfo = Object.create(null), issues: Issue[] = [], questions: PrintQuestion[] = [];
  const add = (row: number, severity: Issue['severity'], message: string) => issues.push({row,severity,message});
  const headerIndex = rows.findIndex(r => r.map(cell).includes('문제') && r.map(cell).includes('정답'));
  if (headerIndex < 0) throw Error('문제·정답 열을 찾지 못했습니다. 제공 양식을 사용해 주세요.');
  for (const row of [...infoRows, ...rows.slice(0,headerIndex)]) {
    const key = cell(row[0]); if (INFO_KEYS.includes(key)) info[key] = cell(row[1]);
  }
  const headers = rows[headerIndex].map(cell);
  for (const h of HEADERS.slice(1,9)) if (!headers.includes(h)) add(headerIndex+1,'error',`필수 열 '${h}'이 없습니다.`);
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) add(headerIndex+1,'error','열 이름이 중복되었습니다.');
  const get = (row: unknown[], key: string) => cell(row[headers.indexOf(key)]);
  const seen = new Map<string,number>();
  for (let i = headerIndex+1; i < rows.length; i++) {
    const row = rows[i], rowNumber = i+1;
    if (row.every(v => !cell(v))) continue;
    if (questions.length >= MAX_ROWS) throw Error('문항은 5,000개까지 읽습니다. 파일을 나눠 주세요.');
    const choices = [1,2,3,4,5].map(n => get(row,`보기${n}`));
    const rawType = get(row,'유형');
    const type = ['선택','4지','5지','choice'].includes(rawType) ? 'choice' : ['단답','short'].includes(rawType) ? 'short' : rawType === '' ? (choices.some(Boolean) ? 'choice' : 'short') : null;
    if (!type) add(rowNumber,'error',`유형 '${rawType}'은 지원하지 않습니다. 선택 또는 단답으로 적어 주세요.`);
    const level = get(row,'난이도');
    if (level && !['상','중','하'].includes(level)) add(rowNumber,'error','난이도는 상·중·하 중 하나로 적어 주세요.');
    const base: QuestionBase = {
      formatVersion: QUESTION_FORMAT_VERSION, id: `q-${questions.length+1}`, course: info['과목'] || '일반',
      classification: get(row,'단원') ? {unit:{name:get(row,'단원')}} : {},
      difficulty: level && ['상','중','하'].includes(level) ? {level:level as '상'|'중'|'하',origin:'교사'} : null,
      stem: get(row,'문제'), points:1, source:{kind:'자체제작'}, review:{status:'draft'},
      // Legacy is a required standard field. No DB connection or stored records.
      legacy:{system:'cbt_json',id: get(row,'번호') || String(questions.length+1)},
      explanation:get(row,'해설') ? {text:get(row,'해설'),origin:'교사'} : null
    };
    const q: PrintQuestion = type === 'choice'
      ? {...base,type:'choice',choices:choices[4] ? choices : choices.slice(0,4),answer:Number(get(row,'정답'))}
      : {...base,type:'short',answer:get(row,'정답').split('|').map(cell)};
    if (q.type === 'short' && choices.some(Boolean)) add(rowNumber,'error','단답형의 보기 칸은 모두 비워 주세요.');
    // Five-choice shape/range are checked here. Ignore only the two known
    // four-choice rules, retain all other standard errors and warnings.
    for (const issue of validateStandardQuestion(q)) {
      if (issue.code === 'C002' || (q.type === 'choice' && q.choices.length === 5 && ['F010','F011'].includes(issue.code))) continue;
      const names: Record<string,string> = {stem:'문제',answer:'정답',choices:'보기'};
      add(rowNumber,issue.severity,`${names[issue.field ?? ''] ?? issue.field ?? '문항'}: ${issue.message}`);
    }
    if (q.type === 'choice') {
      if (q.choices.some(v => !v)) add(rowNumber,'error','보기1~4는 모두 채우고, 5지선다는 보기5도 채워 주세요.');
      if (new Set(q.choices.map(normalizeQuestionText)).size !== q.choices.length) add(rowNumber,'error','같은 보기가 중복되었습니다.');
      if (!Number.isInteger(q.answer) || q.answer < 1 || q.answer > q.choices.length) add(rowNumber,'error',`정답은 1~${q.choices.length} 번호여야 합니다.`);
      const lengths = q.choices.filter(Boolean).map(v => v.length);
      if (Math.max(...lengths) > Math.max(24, Math.min(...lengths)*4)) add(rowNumber,'warning','보기 길이 차이가 큽니다. 인쇄 미리보기를 확인해 주세요.');
    }
    const stemKey = normalizeQuestionText(q.stem);
    if (seen.has(stemKey)) add(rowNumber,'warning',`문제가 ${seen.get(stemKey)}행과 같습니다. 중복 출제를 확인해 주세요.`);
    else seen.set(stemKey,rowNumber);
    questions.push(q);
  }
  if (!questions.length) add(headerIndex+1,'error','문항이 없습니다. 문항 시트에 문제를 적어 주세요.');
  if (info['문항수'] && (!/^\d+$/.test(info['문항수']) || Number(info['문항수']) < 1 || Number(info['문항수']) > questions.length)) add(0,'error',`시험정보 문항수는 1~${questions.length}이어야 합니다.`);
  try { ratioWeights(info['난이도비율'] || ''); } catch (e) { add(0,'error',(e as Error).message); }
  return {info,questions,issues};
}
export function readText(text: string, delimiter = ','): Bank {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw Error('파일·붙여넣기는 5MB 이하로 준비해 주세요.');
  return convertRows(delimitedRows(text,delimiter));
}
export function readXlsx(data: ArrayBuffer | Uint8Array): Bank {
  if (data.byteLength > MAX_BYTES) throw Error('파일은 5MB 이하로 준비해 주세요.');
  const workbook = XLSX.read(data,{type:'array',cellFormula:false,cellHTML:false,cellStyles:false,sheetRows:MAX_ROWS+32});
  if (!workbook.Sheets['문항']) throw Error('문항 시트가 없습니다. 제공 xlsx 양식을 사용해 주세요.');
  const rows = (name: string) => workbook.Sheets[name] ? XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name],{header:1,defval:'',blankrows:true,raw:false}) : [];
  const bank = convertRows(rows('문항'),rows('시험정보'));
  const fullRange = workbook.Sheets['문항']['!fullref'];
  if (fullRange && XLSX.utils.decode_range(fullRange).e.r > MAX_ROWS) throw Error('문항은 5,000개까지 읽습니다. 파일을 나눠 주세요.');
  return bank;
}
export function asEngine(q: PrintQuestion): StandardQuestion { return q as StandardQuestion; }
