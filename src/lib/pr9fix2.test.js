// PR #9 2차 재검수(9.0점) 지적 재발 방지 — 실제 크기·비율은 tools/qa/zoom_check.py(브라우저)에서 잼
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('N1 큰 숫자: 배율을 올리면 작아지지 않음', () => {
  const util = src('ui/util.js');
  it('넘침 판정은 글자 실제 폭(Range)으로, 5%씩 깎는 반복 대신 들어가는 가장 큰 크기를 찾음', () => {
    expect(util).toMatch(/createRange\(\)/);
    expect(util).not.toMatch(/1 - k \* 0\.05/);
    expect(util).toMatch(/fits\(size \+ 0\.1\)/);
  });
  it('재는 동안 전환 효과를 꺼서 이전 크기가 읽히지 않음', () => expect(util).toMatch(/style\.transition = 'none'/));
  it('도넛과 가운데 칸이 글자 배율(--fs)만큼 커지고, 금액이 라벨보다 작으면 라벨도 같이 줄임', () => {
    const charts = src('ui/charts.js');
    expect(charts).toMatch(/max-w-\[calc\(220px\*var\(--fs,1\)\)\]/);
    expect(charts).toMatch(/w-\[min\(62%,calc\(136px\*var\(--fs,1\)\)\)\]/);
    expect(charts).toMatch(/data-fit data-fit-label="prev"/);
    expect(util).toMatch(/lab\.style\.fontSize = `\$\{size\}px`/);
  });
  it('자동 검사(zoom_check.py)에 배율↑인데 작아짐·도넛 금액<라벨 검사가 있고 실패 시 종료 코드 1', () => {
    const qa = readFileSync(new URL('../../tools/qa/zoom_check.py', import.meta.url), 'utf8');
    expect(qa).toMatch(/배율↑인데 작아짐/);
    expect(qa).toMatch(/sys\.exit\(1 if fail or shrink or labelbad else 0\)/);
  });
});

describe('M5 낮은 화면: 내리면 아래 메뉴 숨김, 올리면 보임', () => {
  const css = src('style.css'), main = src('main.js');
  it('낮은 화면에서만 nav-autohide 로 아래 메뉴를 화면 밖으로(키보드로 메뉴에 들어가면 보임)', () => {
    expect(css).toMatch(/html\.nav-autohide \.tabbar:not\(:focus-within\) \{ transform: translateY\(100%\); \}/);
    expect(main).toMatch(/matchMedia\('\(max-height: 500px\) and \(max-width: 1023px\)'\)/);
  });
  it('내릴 때(24px 이후)만 숨기고, 올리거나 맨 끝에 닿으면 다시 보임', () => {
    expect(main).toMatch(/toggle\('nav-autohide', dy > 0 && y > 24 && !atEnd\)/);
  });
  it('움직임 줄이기 설정이면 전환 없이', () => expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.tabbar \{ transition: none; \}/));
});

describe('낮은 항목', () => {
  const css = src('style.css'), views = src('ui/views.js'), main = src('main.js');
  it('L6 차트 문장 퍼센트·설정 안내 숫자도 tabular-nums', () => {
    expect(views).toMatch(/<b class="text-expense tabular-nums">\$\{ins\.pct\}%<\/b>/);
    expect(views).toMatch(/Ctrl \+ <span class="tabular-nums">0<\/span>/);
  });
  it('L8 낮은 창(700px 이하)에서 대화상자 여백을 줄임', () => expect(css).toMatch(/@media \(max-height: 700px\) \{\s*\.dlg-wrap\.dlg-wrap \{ padding-top: 8px; padding-bottom: 8px; \}/));
  it('오프라인: 자리 차지 없는 글자 배지 + 스크린리더 문구 유지', () => {
    expect(views).toMatch(/class="offline-badge" role="status"[^>]*><span aria-hidden="true">오프라인<\/span><span class="sr-only">오프라인\. 기록은/);
    expect(css).toMatch(/\.offline-badge \{ position: absolute;[^}]*background: #B45309; color: #fff;/);
  });
  it('키보드 감지는 고정 150px 대신 창 높이 비율(85% 미만)', () => {
    expect(main).not.toMatch(/vv\.height > 150/);
    expect(main).toMatch(/vv\.height < window\.innerHeight \* 0\.85/);
  });
  it('240px 미만에서 달 이동 버튼 폭 32px(높이 44px 유지)로 위 메뉴 세 줄 방지', () => expect(css).toMatch(/@media \(max-width: 239px\) \{\s*\.app-top header \[data-month="-1"\], \.app-top header \[data-month="1"\] \{ width: 32px; \}/));
});
