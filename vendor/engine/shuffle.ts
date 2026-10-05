import type { StandardQuestion } from '../question/standard';
export type Rng = () => number;
export function shuffle<T>(values: readonly T[], rng: Rng = Math.random): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
// Both maps are 0-based: display slot -> stored slot. Stored answers stay 1-based.
export interface DisplayOrder { choiceOrder?: readonly number[]; mapping?: readonly number[] }
export function shuffleChoices(q: Extract<StandardQuestion, { type: 'choice' }>, rng: Rng = Math.random) {
  const choiceOrder = shuffle(q.choices.map((_, i) => i), rng);
  return { choices: choiceOrder.map(i => q.choices[i]), choiceOrder };
}
export function shuffleMatchingRight(q: Extract<StandardQuestion, { type: 'matching' }>, rng: Rng = Math.random) {
  const mapping = shuffle(q.matching.right.map((_, i) => i), rng);
  return { right: mapping.map(i => q.matching.right[i]), mapping };
}
