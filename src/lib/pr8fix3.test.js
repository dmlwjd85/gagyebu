// PR #8 QA 3차(8.3점) 지적 재발 방지. ID는 /workspace/qa-gagyebu-pr8-3차/보고서.md 기준
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { settledLastPosted, deniedOutcome, dueOccurrences } from './recurring.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('N1 자동 기록이 거부되면 정말 있는지 확인하고, 처리한 달까지만 lastPosted를 올림', () => {
  const r = { id: 'aRec1', active: true, startYm: '2026-01', dayOfMonth: 25, lastPosted: '2026-09' };
  it('예전 규칙에 막혀 10·11월이 모두 실패하면 lastPosted는 그대로(다음에 다시)', () => {
    const due = dueOccurrences(r, '2026-11-26');
    expect(due.map((o) => o.ym)).toEqual(['2026-10', '2026-11']);
    expect(settledLastPosted(r.lastPosted, due, ['failed', 'failed'])).toBe('2026-09');
  });
  it('앞 달이 실패하면 뒤 달이 됐어도 그 앞에서 멈춤(뒤 달은 다음에 있으면 건너뜀)', () => {
    const due = dueOccurrences(r, '2026-11-26');
    expect(settledLastPosted(r.lastPosted, due, ['failed', 'done'])).toBe('2026-09');
    expect(settledLastPosted(r.lastPosted, due, ['done', 'failed'])).toBe('2026-10');
    expect(settledLastPosted(r.lastPosted, due, ['done', 'done'])).toBe('2026-11');
  });
  it('lastPosted가 없던 반복도 첫 달이 실패하면 없는 그대로', () => {
    const due = dueOccurrences({ ...r, lastPosted: undefined, startYm: '2026-11' }, '2026-11-26');
    expect(settledLastPosted(undefined, due, ['failed'])).toBeUndefined();
  });
  it('거부 뒤 서버 확인: 정말 있음·지운 달만 처리한 것으로, 반복이 지워졌으면 gone, 나머지는 failed', () => {
    expect(deniedOutcome({ txExists: true, recExists: true, ym: '2026-10' })).toBe('done');
    expect(deniedOutcome({ txExists: false, recExists: true, skipped: ['2026-10'], ym: '2026-10' })).toBe('done');
    expect(deniedOutcome({ txExists: false, recExists: false, ym: '2026-10' })).toBe('gone');
    expect(deniedOutcome({ txExists: false, recExists: true, skipped: ['2026-09'], ym: '2026-10' })).toBe('failed');
    expect(deniedOutcome({ txExists: false, recExists: true, ym: '2026-10' })).toBe('failed');
  });
  it('store.js: 거부를 곧바로 이미 있음으로 보지 않고, lastPosted는 결과를 본 뒤에만 올림', () => {
    const src = read('src/store.js');
    expect(src).toMatch(/getDocFromServer\(ref\)/);
    expect(src).toMatch(/settledLastPosted\(r\.lastPosted, due, results\)/);
    expect(src).not.toMatch(/permission-denied'\) \{ console\.info\([^)]*\); return false; \}/);
  });
});

describe('N2 지운 달은 arrayUnion/arrayRemove로(통째로 다시 쓰지 않음)', () => {
  it('skipTrim: 24개를 넘길 때만 가장 오래된 달을 뺌', async () => {
    const { skipTrim } = await import('./recurring.js');
    const m = (n) => Array.from({ length: n }, (_, i) => `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
    expect(skipTrim(m(23), '2026-10')).toEqual([]);
    expect(skipTrim(m(24), '2026-10')).toEqual(['2024-01']);
    expect(skipTrim(m(24), m(24)[5])).toEqual([]); // 이미 있는 달
    expect(skipTrim([], '2026-10')).toEqual([]);
  });
  it('store.js: skipped를 목록으로 쓰는 곳이 없음(새 반복·옮기기·되살리기만 목록 전체)', () => {
    const src = read('src/store.js');
    expect(src).not.toMatch(/skipped: (addSkipped|dropSkipped)\(/);
    expect(src).toMatch(/skipped: arrayUnion\(x\.ym\)/);
    expect(src).toMatch(/skipped: arrayRemove\(rx\.ym\)/);
    expect(src).toMatch(/\{ merge: true \}/);
  });
});

describe('N4 다른 기기에서 반복을 지운 사이 오프라인에서 지운 자동 기록', () => {
  it('지우기 묶음이 거부되면 반복이 정말 없는지 서버에서 보고, 없으면 기록만 지움', () => {
    const src = read('src/store.js');
    const body = src.slice(src.indexOf('export function deleteTx'), src.indexOf('export function saveCategory'));
    expect(body).toMatch(/getDocFromServer\(u\('recurring', x\.r\.id\)\)/);
    expect(body).toMatch(/if \(!r\.exists\(\)\) return deleteDoc\(u\('transactions', id\)\)/);
  });
});
