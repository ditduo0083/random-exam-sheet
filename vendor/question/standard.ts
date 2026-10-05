export const QUESTION_FORMAT_VERSION = 'kse-question/0.1' as const;
export type QuestionType = 'ox' | 'choice' | 'matching' | 'short' | 'calc';
export interface QuestionBase {
  formatVersion: typeof QUESTION_FORMAT_VERSION;
  id: string;
  course: string;
  classification: {
    unit?: { name: string; code?: string };
    criteria?: { id: string; text?: string };
    syllabus?: { subject?: string; major?: string; minor?: string; detail?: string };
    assessments?: string[];
    publicTask?: string | null;
  };
  difficulty: { level: '상' | '중' | '하'; origin: 'AI추정' | '교사' | '근거산정' | '미상' } | null;
  stem: string;
  context?: string | null;
  hint?: null;
  answerUnit?: string | null;
  process?: string | null;
  explanation?: { text: string; origin: '원문' | 'AI' | '교사' | '미상' } | null;
  points: number;
  media?: { stemImage?: string; explanationImage?: string; needsFigure?: boolean };
  source: { kind: 'NCS학습모듈' | '공단기출' | '시판수험서' | '자체제작' | '미상'; title?: string; page?: string; quote?: string; year?: number; round?: number };
  review: { status: 'draft' | 'checked' | 'approved'; by?: string; at?: string };
  legacy: { system: 'aie_db' | 'cbt_db' | 'cbt_json'; id: string; raw?: Record<string, unknown> };
}
// 저장 번호는 1부터. 표시 번호·보기 글자와 섞기 순서는 엔진이 담당한다.
export type StandardQuestion = QuestionBase & (
  | { type: 'choice'; choices: [string, string, string, string]; answer: 1 | 2 | 3 | 4 }
  | { type: 'ox'; answer: 'O' | 'X' }
  | { type: 'matching'; matching: { left: string[]; right: string[] }; answer: number[] }
  | { type: 'short' | 'calc'; answer: string[] }
);
// 변환 실패도 행을 버리지 않고 남긴다. 검사를 통과하기 전에는 StandardQuestion으로 취급하지 않는다.
export type QuestionCandidate = Omit<QuestionBase, 'points'> & {
  type: string;
  points: unknown;
  answer: unknown;
  choices?: unknown;
  matching?: unknown;
};
