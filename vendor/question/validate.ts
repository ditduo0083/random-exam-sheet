import { QUESTION_FORMAT_VERSION } from './standard';

export type RuleCode = 'F001' | 'F010' | 'F011' | 'F012' | 'F020' | 'F021' | 'F030' | 'F040' | 'C001' | 'C002' | 'D001' | 'T001' | 'S001';
export interface QuestionIssue { id: string; code: RuleCode | 'P001' | 'P002' | 'P003'; severity: 'error' | 'warning'; message: string; field?: string }
export interface ValidationContext {
  criteria?: ReadonlySet<string>;
  brokenClassificationKeys?: readonly string[];
  duplicateOf?: string;
  idCollision?: boolean;
}
export const criteriaKey = (unit: string, id: string): string => `${unit}\0${id}`;
const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const filled = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.trim() !== 'NULL';
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(filled);
export const normalizeQuestionText = (v: string): string => v.normalize('NFKC').replace(/\s+/g, ' ').trim();

export function validateStandardQuestion(value: unknown, context: ValidationContext = {}): QuestionIssue[] {
  const q = record(value), issues: QuestionIssue[] = [];
  const add = (code: RuleCode, severity: 'error' | 'warning', message: string, field?: string) => issues.push({ id: typeof q.id === 'string' ? q.id : '(missing)', code, severity, message, field });
  for (const key of ['id', 'course', 'stem']) if (!filled(q[key])) add('F001', 'error', '필수 문자열이 비어 있거나 문자열이 아님', key);
  if (context.idCollision) add('F001', 'error', '같은 묶음의 안정 ID 충돌; 임의 재번호하지 않음', 'id');
  if (!['ox', 'choice', 'matching', 'short', 'calc'].includes(q.type)) add('F001', 'error', '지원하지 않는 문항 유형', 'type');
  if (q.answer === null || q.answer === undefined) add('F001', 'error', '필수 정답 없음', 'answer');
  if (typeof q.points !== 'number' || !Number.isFinite(q.points) || q.points <= 0) add('F001', 'error', '배점은 유한한 양수여야 함', 'points');
  if (q.formatVersion !== QUESTION_FORMAT_VERSION) add('F001', 'error', '형식 버전 누락 또는 불일치', 'formatVersion');
  if (q.type === 'choice') {
    if (!strings(q.choices) || q.choices.length !== 4 || new Set(q.choices.map(normalizeQuestionText)).size !== 4) add('F010', 'error', '보기는 빈칸·중복 없는 문자열 4개여야 함', 'choices');
    if (!Number.isInteger(q.answer) || q.answer < 1 || q.answer > 4) add('F011', 'error', '정답은 저장 보기 순서의 1~4 정수여야 함', 'answer');
    if (Array.isArray(q.choices) && q.choices.some((v: unknown) => typeof v === 'string' && /^\s*(?:[①-⑳]|\(?\d+\s*[).、]|보기\s*\d+\s*[:.)])/u.test(v))) add('F012', 'warning', '보기 앞에 번호 표지가 남아 있음', 'choices');
  }
  if (q.type === 'matching') {
    const m = record(q.matching);
    if (!strings(m.left) || m.left.length === 0 || !strings(m.right) || m.right.length === 0 || !Array.isArray(q.answer) || q.answer.length !== m.left.length || q.answer.some((n: unknown) => !Number.isInteger(n) || Number(n) < 1 || Number(n) > m.right.length)) add('F020', 'error', '연결 보기·정답 길이·오른쪽 번호 범위 불일치', 'matching');
    else if (new Set(q.answer).size < q.answer.length) add('F021', 'warning', '오른쪽 항목 하나를 둘 이상의 왼쪽이 고름; 재사용 허용', 'answer');
  }
  if (q.type === 'ox' && !['O', 'X'].includes(q.answer)) add('F030', 'error', '진위 정답은 O 또는 X여야 함', 'answer');
  if (['short', 'calc'].includes(q.type) && (!strings(q.answer) || q.answer.length === 0)) add('F040', 'error', '빈칸 없는 허용 답 문자열 목록이 필요함', 'answer');
  const classification = record(q.classification), legacy = record(q.legacy);
  if (legacy.system === 'aie_db' || (typeof q.course === 'string' && q.course.startsWith('AIE:'))) {
    const unit = record(classification.unit), criteria = record(classification.criteria);
    if (!filled(unit.name) || !filled(criteria.id) || !context.criteria || !context.criteria.has(criteriaKey(unit.name, criteria.id))) add('C001', 'warning', context.criteria ? '능력단위·수행준거가 기준표에 없음' : '기준표가 제공되지 않아 능력단위·수행준거 확인 불가', 'classification');
  }
  if (legacy.system === 'cbt_db' || legacy.system === 'cbt_json' || (typeof q.course === 'string' && q.course.startsWith('CBT:'))) {
    const syllabus = record(classification.syllabus);
    const raw = record(legacy.raw);
    const badKeys = context.brokenClassificationKeys ?? Object.keys(raw).filter(k => ['주주요항목', '주변항목', '주yo 항목', '주యు항목', '주급항목', '주하여항목', '주 주요항목', '주1', '세세 항목'].includes(k));
    if (!filled(syllabus.major) || !filled(syllabus.minor) || badKeys.length) add('C002', 'warning', `주요·세부항목 누락 또는 깨진 분류 키${badKeys.length ? ': ' + badKeys.join(', ') : ''}`, 'classification.syllabus');
  }
  if (context.duplicateOf) add('D001', 'warning', `같은 과정의 정리한 문제·보기 중복: ${context.duplicateOf}`);
  const texts = [q.stem, q.context, q.process, record(q.explanation).text, ...(Array.isArray(q.choices) ? q.choices : []), ...Object.values(record(q.matching)).flat()];
  if (texts.some(v => typeof v === 'string' && /\[\d+\]|\[cite:[^\]]+\]|요청하신\s*대로|```/i.test(v))) add('T001', 'warning', '인용번호·응답 문구·코드 울타리가 남아 있음');
  return issues;
}

// S001은 원문 입력을 받는 다음 작업까지 판단하지 않는다. '검사 안 함'을 통과와 구별한다.
export function validateSourceQuote(_quote?: string, _originalText?: string): { code: 'S001'; status: 'not_checked' } {
  return { code: 'S001', status: 'not_checked' };
}
export function duplicateQuestionKey(value: unknown): string {
  const q = record(value), m = record(q.matching);
  return JSON.stringify([q.course, normalizeQuestionText(typeof q.stem === 'string' ? q.stem : ''), Array.isArray(q.choices) ? q.choices.map((v: unknown) => normalizeQuestionText(String(v))) : null, Array.isArray(m.left) ? m.left.map((v: unknown) => normalizeQuestionText(String(v))) : null, Array.isArray(m.right) ? m.right.map((v: unknown) => normalizeQuestionText(String(v))) : null]);
}
export function validateStandardQuestions(values: readonly unknown[], context: ValidationContext = {}): QuestionIssue[][] {
  const first = new Map<string, string>();
  const idCounts = new Map<string, number>();
  for (const value of values) { const id=record(value).id; if (typeof id==='string') idCounts.set(id,(idCounts.get(id)??0)+1); }
  return values.map(value => {
    const q = record(value), key = duplicateQuestionKey(value), duplicateOf = first.get(key);
    if (!first.has(key)) first.set(key, String(q.id));
    return validateStandardQuestion(value, { ...context, duplicateOf, idCollision: (idCounts.get(q.id)??0)>1 });
  });
}
