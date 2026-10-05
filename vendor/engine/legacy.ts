import { QUESTION_FORMAT_VERSION, type StandardQuestion } from '../question/standard';
import { EngineError } from './pick';
import type { DisplayOrder } from './shuffle';
export type LegacyAieRow = Record<string, any>;
const names = { ox: '진위형', choice: '4지 택일형', matching: '연결형', short: '단답형', calc: '계산형' } as const;
function parse(value: any): any {
  if (typeof value !== 'string' || !/^[\[{]/.test(value.trim())) return value;
  try { return JSON.parse(value); } catch { throw new EngineError('invalid-legacy', 'Malformed legacy JSON'); }
}
export function fromLegacyAie(row: LegacyAieRow, course = 'AIE:미지정'): StandardQuestion {
  const type = (Object.keys(names) as (keyof typeof names)[]).find(k => names[k] === row.type);
  if (!type) throw new EngineError('invalid-legacy', 'Unknown legacy type');
  const options = parse(row.options || '[]'), answer = parse(row.answer);
  const metadata = row.metadata || {};
  const base = {
    formatVersion: QUESTION_FORMAT_VERSION, id: `AIE-${row.id}`, course,
    classification: { unit: { name: row.module_name ?? row.moduleName ?? metadata.unit ?? '' }, criteria: { id: row.criteria ?? metadata.criteria ?? '' } },
    difficulty: ['상', '중', '하'].includes(row.difficulty ?? metadata.difficulty) ? { level: row.difficulty ?? metadata.difficulty, origin: '미상' as const } : null,
    stem: row.question ?? '', context: row.context ?? null, points: Number(row.points ?? 1),
    answerUnit: row.unit ?? null, process: row.process ?? null,
    explanation: row.explanation ? { text: row.explanation, origin: '미상' as const } : null,
    media: { stemImage: row.main_image ?? row.mainImage ?? undefined, explanationImage: row.explanation_image ?? undefined },
    source: { kind: '미상' as const }, review: { status: 'draft' as const },
    legacy: { system: 'aie_db' as const, id: String(row.id), raw: structuredClone(row) },
  };
  if (type === 'choice') {
    if (!Array.isArray(options) || options.length !== 4 || options.some(v => typeof v !== 'string')) throw new EngineError('invalid-legacy', 'Expected four choices');
    const choices = row.choiceOrder ? options.map((_: any, i: number) => options[row.choiceOrder.indexOf(i)]) : [...options];
    // Text wins even for numeric choices. Only fall back to a number when no text matches.
    const text = String(answer ?? '').trim(), matches = choices.map((v: string, i: number) => v.trim() === text ? i : -1).filter((i: number) => i >= 0);
    if (matches.length > 1) throw new EngineError('invalid-legacy', 'Ambiguous legacy answer');
    const index = matches.length ? matches[0] : /^[1-4]$/.test(text) ? Number(text) - 1 : -1;
    if (index < 0) throw new EngineError('invalid-legacy', 'Answer not in choices');
    return { ...base, type, choices: choices as [string, string, string, string], answer: index + 1 as 1 | 2 | 3 | 4 };
  }
  if (type === 'matching') {
    if (!Array.isArray(options?.left) || !options.left.length || !Array.isArray(options?.right) || !options.right.length || !answer || typeof answer !== 'object') throw new EngineError('invalid-legacy', 'Broken matching question');
    const keys = Object.keys(answer);
    if (keys.length !== options.left.length || !keys.every((k, i) => k === String(i)) || keys.some(k => !Number.isInteger(answer[k]) || answer[k] < 0 || answer[k] >= options.right.length)) throw new EngineError('invalid-legacy', 'Invalid matching answer');
    const right = row.mapping ? options.right.map((_: any, i: number) => options.right[row.mapping.indexOf(i)]) : [...options.right];
    return { ...base, type, matching: { left: [...options.left], right }, answer: keys.map(k => answer[k] + 1) };
  }
  if (type === 'ox') {
    if (!['O', 'X'].includes(answer)) throw new EngineError('invalid-legacy', 'Invalid OX answer');
    return { ...base, type, answer };
  }
  // Old short/calc compares answer.toString(), including comma-joined JSON arrays.
  if (answer === null || answer === undefined) throw new EngineError('invalid-legacy', 'Missing answer');
  return { ...base, type, answer: [String(answer)] };
}
export function toLegacyAie(q: StandardQuestion, display: DisplayOrder = {}): LegacyAieRow {
  const raw = structuredClone(q.legacy.raw ?? {});
  delete raw.choiceOrder; delete raw.mapping;
  let options: any = [], answer: any = q.answer;
  if (q.type === 'choice') {
    options = (display.choiceOrder ?? [0, 1, 2, 3]).map(i => q.choices[i]);
    answer = q.choices[q.answer - 1];
  } else if (q.type === 'matching') {
    options = { left: [...q.matching.left], right: (display.mapping ?? q.matching.right.map((_, i) => i)).map(i => q.matching.right[i]) };
    answer = Object.fromEntries(q.answer.map((n, i) => [i, n - 1]));
  } else if (q.type === 'ox') options = ['O', 'X'];
  else answer = q.answer.length === 1 ? q.answer[0] : [...q.answer];
  return { ...raw, id: q.legacy.id, type: names[q.type], question: q.stem, context: q.context ?? null,
    options, answer, points: q.points, explanation: q.explanation?.text ?? '',
    criteria: q.classification.criteria?.id ?? null, difficulty: q.difficulty?.level ?? null,
    moduleName: q.classification.unit?.name, module_name: q.classification.unit?.name,
    metadata: { unit: q.answerUnit, criteria: q.classification.criteria?.id, difficulty: q.difficulty?.level },
    mainImage: q.media?.stemImage ?? null, main_image: q.media?.stemImage ?? null,
    unit: q.answerUnit ?? null, process: q.process ?? null, explanation_image: q.media?.explanationImage ?? null,
    ...(display.choiceOrder ? { choiceOrder: [...display.choiceOrder] } : {}), ...(display.mapping ? { mapping: [...display.mapping] } : {}) };
}
