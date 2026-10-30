import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// 글꼴은 보통(400)·굵게(700) 두 벌뿐. 600(semibold)을 쓰면 700과 똑같이 보여 위계가 사라지므로 화면 코드에서 쓰지 않는다.
const root = fileURLToPath(new URL('../..', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = [...walk(join(root, 'src')), join(root, 'index.html')]
  .filter((p) => /\.(js|css|html)$/.test(p) && !p.endsWith('.test.js') && !p.endsWith('fonts.css') && !p.includes('/assets/fonts/')); // @font-face 굵기 범위(600 900)는 제외

describe('글자 굵기 두 단계', () => {
  test('font-semibold·font-weight 600·캔버스 600 을 쓰지 않는다', () => {
    const bad = files.filter((p) => /font-semibold|font-weight:\s*600|[`'"]600 \d+px|,\s*600,\s*\d+,/.test(readFileSync(p, 'utf8')));
    expect(bad).toEqual([]);
  });
  test('공용 위계 클래스와 micro 토큰', () => {
    const css = readFileSync(join(root, 'src/style.css'), 'utf8');
    expect(css).toMatch(/\.t-label \{ font-weight: 700; letter-spacing: 0\.02em; \}/);
    expect(css).toMatch(/\.t-quiet \{ font-weight: 400; letter-spacing: 0\.01em; \}/);
    const tw = readFileSync(join(root, 'tailwind.config.js'), 'utf8');
    expect(tw).toContain("micro: [11, 14, { fontWeight: '700', letterSpacing: '0.02em' }]");
  });
});
