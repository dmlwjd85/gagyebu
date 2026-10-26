// 브랜드 검사: 앱 이름은 '쨈 가계부'. '쓱'·'잼'·'JAM'·'쨈, 적'과 예전 이름 '콕 가계부'는 소스와 빌드 결과물에 남기지 않는다.
// 빌드 결과물(dist)은 npm run build 뒤에만 있으므로, 없으면 그 부분만 건너뛴다(CI는 테스트 뒤 빌드).
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NAME = '쨈 가계부';
const BANNED = [/쓱/, /잼/, /JAM/, /쨈,\s*적/, /콕 ?가계부/];
const TEXT = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json', '.md', '.txt', '.webmanifest', '.py', '.csv']);
const SELF = 'src/lib/brand.test.js';

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TEXT.has(extname(n))) out.push(p);
  }
  return out;
}
const rel = (p) => p.slice(ROOT.length).replace(/\\/g, '/');
function offenders(files) {
  const bad = [];
  for (const f of files) {
    if (rel(f) === SELF) continue;
    const s = readFileSync(f, 'utf8');
    for (const re of BANNED) if (re.test(s)) bad.push(`${rel(f)}: ${re}`);
  }
  return bad;
}

describe('브랜드 이름', () => {
  test('소스·public·문서·QA 도구에 금지 표기가 없다', () => {
    const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'public')), ...walk(join(ROOT, 'docs')), ...walk(join(ROOT, 'tools')), ...walk(join(ROOT, 'tests')),
      ...['index.html', 'README.md', 'vite.config.js'].map((f) => join(ROOT, f))];
    expect(offenders(files)).toEqual([]);
  });

  test('제목과 PWA manifest 이름이 쨈 가계부다', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(/<title>쨈 가계부[ <·]/);
    const vite = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');
    expect(vite).toContain(`name: '${NAME}'`);
    expect(vite).toContain(`short_name: '${NAME}'`);
  });

  test.runIf(existsSync(join(ROOT, 'dist/index.html')))('빌드 결과물에도 금지 표기가 없고, manifest 이름이 맞다', () => {
    const dist = join(ROOT, 'dist');
    expect(offenders(walk(dist))).toEqual([]);
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toMatch(/<title>쨈 가계부/);
    const mf = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'));
    expect(mf.name).toBe(NAME);
    expect(mf.short_name).toBe(NAME);
  });
});
