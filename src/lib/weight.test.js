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

// 누를 곳은 굵기 대신 모양(테두리·면·받침 그림자)으로 보인다. 고를 때 굵기·자간이 바뀌면 글자 폭이 바뀌어 줄이 흔들리므로 금지.
describe('누를 곳 모양 보완', () => {
  const css = readFileSync(join(root, 'src/style.css'), 'utf8');
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h) => { const [r, g, b] = hex(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v * t + hex(b)[i] * (1 - t)).toString(16).padStart(2, '0')).join('');

  test('고른 상태·누름 규칙은 굵기·자간·글자 크기를 바꾸지 않는다', () => {
    const rules = css.match(/[^{}]*(?:\[aria-checked="true"\]|\[aria-pressed="true"\]|:active|\.on\b)[^{}]*\{[^}]*\}/g);
    expect(rules.length).toBeGreaterThan(5);
    expect(rules.filter((r) => /font-weight|letter-spacing|font-size|font-bold|font-semibold/.test(r.split('{')[1]))).toEqual([]);
  });

  test('누를 곳 테두리 --ctl-line 은 라이트·다크 면과 바탕 모두 3:1 이상, 고른 칩 글자는 4.5:1 이상', () => {
    const light = css.match(/:root \{ --ctl-line: (#[0-9A-F]{6});/)[1];
    const dark = css.match(/html\.dark \{ --ctl-line: (#[0-9A-F]{6});/)[1];
    for (const bg of ['#FFFFFF', '#F6F4FF']) expect(ratio(light, bg)).toBeGreaterThanOrEqual(3);
    for (const bg of ['#1C1A2E', '#0F0E1A']) expect(ratio(dark, bg)).toBeGreaterThanOrEqual(3);
    expect(css).toMatch(/\.chip\[aria-checked="true"\] \{[^}]*background: color-mix\(in srgb, var\(--primary\) 8%, var\(--surface-solid\)\)/);
    expect(ratio('#6D4AFF', mix('#6D4AFF', '#FFFFFF', 0.08))).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#A994FF', mix('#A994FF', '#1C1A2E', 0.08))).toBeGreaterThanOrEqual(4.5);
    // 고른 칸(seg)의 보라 테두리는 회색 틀(#E5E3EF)·흰 면 모두 3:1 이상
    expect(ratio('#6D4AFF', mix('#1E1B3A', '#F6F4FF', 0.08))).toBeGreaterThanOrEqual(3);
  });

  test('칩·버튼·숫자판 등은 --ctl-line 테두리와 44px 이상 높이를 쓴다', () => {
    const rule = (sel) => css.match(new RegExp(`\\n\\s*${sel.replace(/[.[\]>]/g, '\\$&')} \\{([^}]*)\\}`))[1];
    for (const sel of ['.chip', '.btn-ghost', '.btn-google', '.cat-chip', '.set-link', '.report-btn', '.map-sel', '.day-tile', '.mode-pick']) {
      expect(rule(sel)).toContain('var(--ctl-line)');
      expect(rule(sel)).toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]|min-height: (4[4-9]|[5-9]\d)px/);
    }
    expect(rule('.key')).toMatch(/h-14[^}]*0 2px 0 var\(--ctl-line\)/);
    expect(rule('.seg > button')).toContain('min-h-[44px]');
    expect(rule('.link-btn')).toMatch(/min-h-\[44px\][^}]*text-decoration: underline/);
  });
});

