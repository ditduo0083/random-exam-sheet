import type { StandardQuestion } from '../question/standard';
import type { DisplayOrder } from './shuffle';
const norm = (v: unknown) => String(v).trim().replace(/\s+/g, '');
// Selection: choice display slot (0-based), OX slot (O=0/X=1), matching stored
// right slots (0-based object keyed by left slot), or short/calc text.
// Matching UI uses mapping[displaySlot] before saving, as the old renderer does.
export function matchingPartialScore(q: StandardQuestion, selected: any): number {
  if (q.type !== 'matching' || !selected || !q.answer.length) return 0;
  return q.answer.filter((n, i) => selected[i] === n - 1).length / q.answer.length;
}
export function grade(q: StandardQuestion, selected: any, display: DisplayOrder = {}) {
  let correct = false;
  if (selected !== undefined && selected !== null && (selected !== '' || q.type === 'short')) {
    if (q.type === 'choice') {
      const i = Number(selected);
      correct = Number.isInteger(i) && i >= 0 && i < 4 && (display.choiceOrder?.[i] ?? i) + 1 === q.answer;
    } else if (q.type === 'ox') correct = ['O', 'X'][Number(selected)] === q.answer;
    else if (q.type === 'matching') {
      const expected = Object.fromEntries(q.answer.map((n, i) => [i, n - 1]));
      correct = JSON.stringify(selected) === JSON.stringify(expected);
    } else correct = q.answer.some(a => norm(a) === norm(selected));
  }
  const fraction = q.type === 'matching' ? matchingPartialScore(q, selected) : Number(correct);
  return { correct, fraction, earnedPoints: q.points * fraction };
}
export function formatChosenAnswer(q: StandardQuestion, selected: any, display: DisplayOrder = {}): string {
  if (selected === undefined || selected === null || selected === '') return '(공란)';
  if (q.type === 'choice' || q.type === 'ox') {
    const i = Number(selected);
    const text = q.type === 'ox' ? ['O', 'X'][i] : q.choices[display.choiceOrder?.[i] ?? i];
    return text === undefined ? '(공란)' : q.type === 'ox' ? text : `${i + 1}번 · ${text}`;
  }
  return String(selected);
}
export function formatCorrectAnswer(q: StandardQuestion, display: DisplayOrder = {}): string {
  if (q.type === 'choice') {
    const i = display.choiceOrder ? display.choiceOrder.indexOf(q.answer - 1) : q.answer - 1;
    return `${i + 1}번 · ${q.choices[q.answer - 1]}`;
  }
  if (q.type === 'matching') return String(Object.fromEntries(q.answer.map((n, i) => [i, n - 1])));
  return q.type === 'ox' ? q.answer : String(q.answer).trim();
}
