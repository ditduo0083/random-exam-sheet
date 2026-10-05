import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Search by directory name only; standalone sources never import monorepo code.
export function originalRoot() {
  let parent = dirname(root);
  for (let i = 0; i < 4; i++, parent = dirname(parent)) {
    const candidate = resolve(parent, 'kse-core-harness/lib');
    if (existsSync(resolve(candidate, 'engine/pick.ts'))) return candidate;
  }
  return null;
}
export function checkVendor() {
  const original = originalRoot();
  if (!original) { console.log('건너뜀: 공개 저장소에는 원본이 없습니다.'); return; }
  const hash = p => createHash('sha256').update(Buffer.from(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'))).digest('hex');
  let count = 0;
  for (const folder of ['engine', 'question']) {
    const expected = readdirSync(resolve(original, folder)).filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts')).sort();
    const actual = readdirSync(resolve(root, 'vendor', folder)).filter(n => n.endsWith('.ts')).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw Error(`${folder}: 파일 목록 불일치`);
    for (const name of expected) {
      if (hash(resolve(original, folder, name)) !== hash(resolve(root, 'vendor', folder, name))) throw Error(`${folder}/${name}: 원본 해시 불일치`);
      count++;
    }
  }
  console.log(`원본 해시 일치: ${count}개 파일`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) checkVendor();
