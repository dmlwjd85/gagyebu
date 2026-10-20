// QA D1: 반복 자동 기록이 사용자가 고친·지운 같은 달 기록을 덮어쓰거나 되살리지 않게 하는 도우미
import { describe, test, expect } from 'vitest';
import { recParts, addSkipped, dropSkipped, bumpLastPosted, SKIP_MAX, recTxId } from './recurring.js';

describe('D1 반복 자동 기록 도우미', () => {
  test('recParts: rec-{반복id}-{YYYY-MM}만 나눔(형식 밖 반복 id도)', () => {
    expect(recParts(recTxId('goodRec25', '2026-10'))).toEqual({ rid: 'goodRec25', ym: '2026-10' });
    expect(recParts('rec-q1w2e3r4t5y6u7i8o9p0a1s2d3-2026-10')).toEqual({ rid: 'q1w2e3r4t5y6u7i8o9p0a1s2d3', ym: '2026-10' });
    expect(recParts('rec-a-b-2026-12')).toEqual({ rid: 'a-b', ym: '2026-12' });
    for (const x of ['abc', 'rec-x-2026-13', 'rec--2026-10', null, undefined, 'rec-x-2026-1']) expect(recParts(x)).toBeNull();
  });
  test('지운 달: 정렬·중복 없음, 최근 24개만, 빼기', () => {
    expect(addSkipped(undefined, '2026-10')).toEqual(['2026-10']);
    expect(addSkipped(['2026-11', '2026-10'], '2026-10')).toEqual(['2026-10', '2026-11']);
    let l = [];
    for (let i = 0; i < 30; i++) l = addSkipped(l, `20${String(24 + Math.floor(i / 12)).padStart(2, '0')}-${String((i % 12) + 1).padStart(2, '0')}`);
    expect(l).toHaveLength(SKIP_MAX);
    expect(l[l.length - 1]).toBe('2026-06');
    expect(dropSkipped(['2026-09', '2026-10'], '2026-10')).toEqual(['2026-09']);
    expect(dropSkipped(undefined, '2026-10')).toEqual([]);
  });
  test('직접 고친 달로 lastPosted 올리기: 빈 달이 생기지 않을 때만', () => {
    expect(bumpLastPosted({ lastPosted: '2026-09' }, '2026-10')).toBe('2026-10');
    expect(bumpLastPosted({ lastPosted: '2026-10' }, '2026-10')).toBeNull(); // 이미 됨
    expect(bumpLastPosted({ lastPosted: '2026-11' }, '2026-10')).toBeNull(); // 뒤로 안 감
    expect(bumpLastPosted({ lastPosted: '2026-08' }, '2026-10')).toBeNull(); // 9월이 빠지므로 안 올림(규칙이 덮어쓰기를 막음)
    expect(bumpLastPosted({ startYm: '2026-10' }, '2026-10')).toBe('2026-10');
    expect(bumpLastPosted({}, '2026-10')).toBeNull();
  });
});
