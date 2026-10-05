import type { QuestionType, StandardQuestion } from '../question/standard';
import { assertUniqueIds } from './pick';
export const DEFAULT_TYPE_ORDER: readonly QuestionType[] = ['ox', 'choice', 'matching', 'short', 'calc'];
export const DEFAULT_PAGE_CAPACITY: Readonly<Record<QuestionType, number>> = { ox: 7, choice: 5, matching: 2, short: 4, calc: 3 };
export function orderByType<T extends { id: string; type: QuestionType }>(questions: readonly T[], order = DEFAULT_TYPE_ORDER): T[] {
  assertUniqueIds(questions);
  const rank = (type: QuestionType) => { const i = order.indexOf(type); return i < 0 ? order.length : i; };
  return [...questions].sort((a, b) => rank(a.type) - rank(b.type));
}
export function paginate(questions: readonly Pick<StandardQuestion, 'id' | 'type' | 'media'>[], options: {
  capacities?: Partial<Record<QuestionType, number>>; heights?: readonly number[]; availableHeight?: number; imageWeight?: number;
} = {}) {
  assertUniqueIds(questions);
  const { heights, availableHeight = Infinity, imageWeight = 2 } = options;
  const capacities = { ...DEFAULT_PAGE_CAPACITY, ...options.capacities };
  const pages: { type: QuestionType; indices: number[] }[] = [];
  let used = 0, height = 0;
  for (const [index, q] of questions.entries()) {
    const weight = q.media?.stemImage ? imageWeight : 1;
    const questionHeight = heights?.[index] || 0;
    let page = pages[pages.length - 1];
    if (!page || page.type !== q.type || used + weight > capacities[q.type] || (page.indices.length > 0 && height + questionHeight > availableHeight)) {
      page = { type: q.type, indices: [] }; pages.push(page); used = 0; height = 0;
    }
    page.indices.push(index); used += weight; height += questionHeight;
  }
  return pages;
}
export function isAnswered(q: StandardQuestion, answer: any): boolean {
  if (answer === undefined || answer === null || (typeof answer === 'string' && !answer.trim())) return false;
  return q.type !== 'matching' || (q.matching.left.length > 0 && q.matching.left.every((_, i) => Number.isInteger(answer[i])));
}
