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
