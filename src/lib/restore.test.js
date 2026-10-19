import { describe, test, expect } from 'vitest';
import { restorePlans, keptList, keepTx, unkeep } from './restore.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const BAD_REC = 'q1w2e3r4t5y6u7i8o9p0a1s2d3';

describe('R5 되돌리기 시도 순서', () => {
  test('보통 거래: 같은 id → 새 id 두 단계만', () => {
    const p = restorePlans({ id: 'a', date: '2026-10-01', amount: 1000, kind: 'expense', categoryId: 'food', memo: '점심' });
    expect(p.map((x) => x.newId)).toEqual([false, true]);
    expect(p[1].data).toEqual({ date: '2026-10-01', amount: 1000, kind: 'expense', categoryId: 'food', memo: '점심' });
  });
  test('형식 밖 반복 id가 붙은 rec- 거래: 마지막에 반복 id를 빼고 살림', () => {
    const p = restorePlans({ id: `rec-${BAD_REC}-2026-10`, date: '2026-10-01', amount: 550000, kind: 'expense', categoryId: 'housing', memo: '월세', recurringId: BAD_REC });
    expect(p).toHaveLength(3);
    expect(p[2].newId).toBe(true);
    expect(p[2].data.recurringId).toBeUndefined();
    expect(p[2].data).toMatchObject({ amount: 550000, memo: '월세', categoryId: 'housing' });
  });
  test('형식 밖 카테고리·결제수단은 기타·없음으로', () => {
    const p = restorePlans({ id: 'x', date: '2026-10-01', amount: 5, kind: 'income', categoryId: '1234567890123', accountId: 'a.b' });
    expect(p[2].data.categoryId).toBe('etc-in');
    expect(p[2].data.accountId).toBeUndefined();
  });
  test('id·createdAt 같은 칸은 내용에 넣지 않음', () => {
    const p = restorePlans({ id: 'a', date: '2026-10-01', amount: 1, kind: 'expense', categoryId: 'food', createdAt: { seconds: 1 }, updatedAt: 1 });
    expect(Object.keys(p[0].data)).not.toContain('createdAt');
    expect(Object.keys(p[0].data)).not.toContain('id');
  });
});

describe('R5 이 기기 보관함', () => {
  test('보관·목록·지우기(계정별), 같은 번호는 한 번만', () => {
    const ls = mem();
    const k = keepTx('u1', { id: 'a', date: '2026-10-01', amount: 1000, kind: 'expense', categoryId: 'food', createdAt: { toMillis: () => 123 } }, ls, 1000);
    keepTx('u1', { ...keptList('u1', ls)[0] }, ls);
    expect(keptList('u1', ls)).toHaveLength(1);
    expect(keptList('u1', ls)[0]).toMatchObject({ id: 'a', amount: 1000, createdAtMs: 123, keepKey: k });
    expect(keptList('u2', ls)).toEqual([]);
    expect(unkeep('u1', k, ls)).toEqual([]);
    expect(keptList('u1', ls)).toEqual([]);
  });
  test('깨진 값이면 빈 목록', () => {
    const ls = mem(); ls.setItem('keptTx:u1', '{oops'); expect(keptList('u1', ls)).toEqual([]);
  });
});
