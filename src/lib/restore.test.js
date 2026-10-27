import { describe, test, expect } from 'vitest';
import { restorePlans, keptList, keepTx, unkeep, keepIdOf, editTarget } from './restore.js';
import { fixedRecId, isTxDocId } from './ids.js';
import { recTxId } from './recurring.js';
import { isRuleId } from './ids.js';

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
  test('N1 보관 항목마다 고정 id: 보관 때 정해 두고, 다시 보관·다시 읽어도 그대로', () => {
    const ls = mem();
    keepTx('u1', { date: '2026-10-01', amount: 1000, kind: 'expense', categoryId: 'food' }, ls, 5000, () => 0.5);
    const it = keptList('u1', ls)[0];
    expect(it.keepId).toMatch(/^kp[A-Za-z]{18}$/);
    expect(isRuleId(it.keepId)).toBe(true);
    expect(it.createdAtMs).toBe(5000); // 다시 저장할 때마다 같은 createdAt
    keepTx('u1', { ...it }, ls, 9999);
    expect(keptList('u1', ls)).toEqual([it]);
    expect(keepIdOf('u1', it)).toBe(it.keepId);
    // keepId 없이 담긴 예전 항목도 보관 번호에서 늘 같은 값
    const old = { keepKey: 'abc0' };
    expect(keepIdOf('u1', old)).toBe(keepIdOf('u1', { ...old }));
    expect(keepIdOf('u1', old)).not.toBe(keepIdOf('u2', old));
  });
  test('N1 같은 밀리초에 두 탭이 보관해도 보관 번호·고정 id가 다름', () => {
    const ls1 = mem(), ls2 = mem();
    const a = keepTx('u1', { date: '2026-10-01', amount: 1, kind: 'expense', categoryId: 'food' }, ls1, 7000, () => 0.11);
    const b = keepTx('u1', { date: '2026-10-01', amount: 2, kind: 'expense', categoryId: 'food' }, ls2, 7000, () => 0.77);
    expect(a).not.toBe(b);
    expect(keptList('u1', ls1)[0].keepId).not.toBe(keptList('u1', ls2)[0].keepId);
  });
  test('깨진 값이면 빈 목록', () => {
    const ls = mem(); ls.setItem('keptTx:u1', '{oops'); expect(keptList('u1', ls)).toEqual([]);
  });
});

describe('N6 예전 형식 id 고치기: 늘 같은 새 id로 옮김', () => {
  test('형식 밖 rec- 문서 → 옮긴 반복의 자동 기록 id와 같은 id', () => {
    const r = editTarget({ id: `rec-${BAD_REC}-2026-10`, recurringId: BAD_REC });
    expect(r.moved).toBe(true);
    expect(r.id).toBe(recTxId(fixedRecId(BAD_REC), '2026-10'));
    expect(r.recurringId).toBe(fixedRecId(BAD_REC));
    expect(isTxDocId(r.id)).toBe(true);
    expect(editTarget({ id: `rec-${BAD_REC}-2026-10`, recurringId: BAD_REC })).toEqual(r); // 몇 번·몇 기기에서 해도 같음
  });
  test('형식 밖 일반 id → tx + 영문 18자, 정상 id는 그대로', () => {
    const r = editTarget({ id: 'legacyTx1234567890123' });
    expect(r).toMatchObject({ moved: true });
    expect(r.id).toMatch(/^tx[A-Za-z]{18}$/);
    expect(editTarget({ id: 'abcDEF123' })).toEqual({ id: 'abcDEF123', recurringId: undefined, moved: false });
    expect(editTarget({ id: 'rec-GoodRecurAutoIdAbcd1-2026-10', recurringId: 'GoodRecurAutoIdAbcd1' }).moved).toBe(false);
  });
  test('되돌리기 2단계도 반복 연결을 옮긴 id로 지킴', () => {
    const p = restorePlans({ id: `rec-${BAD_REC}-2026-10`, date: '2026-10-01', amount: 5, kind: 'expense', categoryId: 'housing', recurringId: BAD_REC });
    expect(p[1].data.recurringId).toBe(fixedRecId(BAD_REC));
    expect(p[2].data.recurringId).toBeUndefined();
  });
});
