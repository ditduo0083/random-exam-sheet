import type { StandardQuestion } from '../question/standard';
import { shuffle, type Rng } from './shuffle';
export class EngineError extends Error {
  constructor(public readonly code: 'duplicate-id' | 'invalid-legacy' | 'invalid-count', message: string = code) { super(message); this.name = 'EngineError'; }
}
export function assertUniqueIds(pool: readonly { id: string }[]): void {
  const ids = new Set<string>();
  for (const q of pool) { if (ids.has(q.id)) throw new EngineError('duplicate-id'); ids.add(q.id); }
}
function candidates(pool: readonly StandardQuestion[], count: number): StandardQuestion[] {
  assertUniqueIds(pool);
  if (!Number.isInteger(count) || count < 0) throw new EngineError('invalid-count');
  return pool.filter(isUsable);
}
export function isUsable(q: StandardQuestion): boolean {
  if (q.type === 'matching') return Array.isArray(q.matching?.left) && q.matching.left.length > 0 && Array.isArray(q.matching?.right) && q.matching.right.length > 0 && Array.isArray(q.answer) && q.answer.length === q.matching.left.length && q.answer.every(n => Number.isInteger(n) && n >= 1 && n <= q.matching.right.length);
  return true;
}
export type GroupKey = (q: StandardQuestion) => string;
const criteria: GroupKey = q => q.classification.criteria?.id?.trim() || 'etc';
const unit: GroupKey = q => q.classification.unit?.name || 'etc';
export function pickBalanced(input: readonly StandardQuestion[], needed: number, key: GroupKey = criteria, rng: Rng = Math.random): StandardQuestion[] {
  const pool = candidates(input, needed);
  if (pool.length <= needed) return shuffle(pool, rng);
  const groups = new Map<string, StandardQuestion[]>();
  for (const q of pool) { const k = key(q); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(q); }
  for (const [k, group] of groups) groups.set(k, shuffle(group, rng));
  const selected: StandardQuestion[] = [];
  for (let index = 0; selected.length < needed; index++) {
    const active = [...groups.keys()].filter(k => groups.get(k)!.length > index);
    if (!active.length) break;
    for (const k of shuffle(active, rng)) { if (selected.length >= needed) break; selected.push(groups.get(k)![index]); }
  }
  return shuffle(selected, rng);
}
export function pickByDifficulty(input: readonly StandardQuestion[], count: number, preferred: string | null = null, key: GroupKey = criteria, rng: Rng = Math.random): StandardQuestion[] {
  const pool = candidates(input, count);
  if (!count || pool.length <= count) return shuffle(pool.slice(0, count), rng);
  const levels = ['상', '중', '하'] as const;
  const groups = Object.fromEntries(levels.map(l => [l, pool.filter(q => (q.difficulty?.level ?? '중') === l)]));
  let selected: StandardQuestion[];
  if (preferred) {
    selected = pickBalanced(groups[preferred] || [], count, key, rng);
  } else {
    const quotas = [Math.max(1, Math.round(count * .2)), Math.max(1, Math.round(count * .5)), Math.max(1, Math.round(count * .3))];
    let sum = quotas.reduce((a, b) => a + b, 0);
    while (sum > count) {
      const i = [0, 2, 1].find(i => quotas[i] > 1);
      if (i === undefined) break;
      quotas[i]--; sum--;
    }
    while (sum < count) { quotas[1]++; sum++; }
    selected = levels.flatMap((l, i) => pickBalanced(groups[l], quotas[i], key, rng));
  }
  if (selected.length < count) {
    const ids = new Set(selected.map(q => q.id));
    selected.push(...pickBalanced(pool.filter(q => !ids.has(q.id)), count - selected.length, key, rng));
  }
  return pickBalanced(selected, count, key, rng);
}
export function pickByGroupQuota(input: readonly StandardQuestion[], needed: number, key: GroupKey = unit, preferred: string | null = null, innerKey: GroupKey = criteria, rng: Rng = Math.random): StandardQuestion[] {
  const pool = candidates(input, needed), groups = new Map<string, StandardQuestion[]>();
  for (const q of pool) { const k = key(q); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(q); }
  const quotas = new Map([...groups.keys()].map(k => [k, 0]));
  let remaining = Math.min(needed, pool.length);
  while (remaining > 0) {
    for (const k of shuffle([...groups.keys()].filter(k => quotas.get(k)! < groups.get(k)!.length), rng)) {
      if (!remaining) break;
      quotas.set(k, quotas.get(k)! + 1); remaining--;
    }
  }
  return shuffle([...groups].flatMap(([k, group]) => {
    const count = quotas.get(k)!;
    if (!preferred) return pickBalanced(group, count, innerKey, rng);
    const first = pickBalanced(group.filter(q => q.difficulty?.level === preferred), count, innerKey, rng);
    const ids = new Set(first.map(q => q.id));
    return [...first, ...pickBalanced(group.filter(q => !ids.has(q.id)), count - first.length, innerKey, rng)];
  }), rng);
}
