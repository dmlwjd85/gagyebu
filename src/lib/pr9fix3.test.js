// PR #9 3차 재검수(9.5점 합격) 낮음 결함 재발 방지 — 실제 스크롤 위치·글자 크기는 브라우저 측정(검증 기록)에서 잰다
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('N7 낮은 화면: 아래 메뉴 숨김·보임이 문서 길이를 바꾸지 않아 맨 끝에서 위치가 튀지 않음', () => {
  const css = src('style.css'), main = src('main.js');
  const low = css.slice(css.indexOf('@media (max-height: 500px) {'));
  it('낮은 화면의 틀(.app-frame)은 overflow: clip(스크롤 상자 아님) → 숨긴 메뉴(translateY)가 스크롤 길이에 더해지지 않음', () => {
    expect(low).toMatch(/\.app-frame \{ display: block; height: auto; min-height: 100dvh; overflow: visible; overflow: clip; \}/);
  });
  it('숨김은 transform 만(높이·display·position 은 바꾸지 않음)', () => {
    expect(css).toMatch(/html\.nav-autohide \.tabbar:not\(:focus-within\) \{ transform: translateY\(100%\); \}/);
    expect(css).not.toMatch(/nav-autohide[^{]*\{[^}]*(display|height|position|margin|padding)\s*:/);
  });
  it('맨 끝 판정을 6px 문턱보다 먼저 해서, 짧은 마지막 움직임으로 끝에 닿아도 보임', () => {
    const i = main.indexOf("const room = document.scrollingElement.scrollHeight - window.innerHeight - y;");
    const j = main.indexOf('if (Math.abs(dy) < 6) return;', i);
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(main.slice(i, j)).toMatch(/if \(room <= 2\) \{ root\.classList\.remove\('nav-autohide'\); lastY = y; return; \}/);
  });
});

describe('N8 오프라인 배지 글자: 디자인 스펙 최소 크기(13px, 11px는 달력 칸만) 이상', () => {
  const css = src('style.css');
  const rule = css.match(/\.offline-badge \{[^}]*\}/)[0];
  it('글자 13px 이상, 한 줄(줄바꿈 없음)·자리 차지 없음(absolute) 유지', () => {
    const fs = Number(rule.match(/font-size: (\d+(?:\.\d+)?)px/)[1]);
    expect(fs).toBeGreaterThanOrEqual(13);
    expect(rule).toMatch(/position: absolute;/);
    expect(rule).toMatch(/white-space: nowrap;/);
  });
  it('색(흰 글자/짙은 주황, 대비 약 5:1)은 그대로', () => expect(rule).toMatch(/background: #B45309; color: #fff;/));
});
