import { test, expect } from 'vitest';
import { validateTx, validateCategory } from './validate.js';
import { nextTip, dismissTip, emptyTipState, migrateTipState, TIPS, TIP_LIST, M2_ORDER } from './tips.js';
import { suggestOrder, DEFAULT_CATEGORIES } from './defaults.js';
const ok = { amount: 12000, kind: 'expense', categoryId: 'food', date: '2026-10-19', memo: '' };
test('거래 검증', () => {
  expect(validateTx(ok)).toBeNull();
  expect(validateTx({ ...ok, amount: 0 })).toMatch('금액');
  expect(validateTx({ ...ok, amount: 1.5 })).toMatch('금액');
  expect(validateTx({ ...ok, amount: 1_000_000_001 })).toMatch('10억');
  expect(validateTx({ ...ok, categoryId: '' })).toMatch('카테고리');
  expect(validateTx({ ...ok, date: '2026-13-01' })).toMatch('날짜');
  expect(validateTx({ ...ok, memo: 'x'.repeat(201) })).toMatch('메모');
});
test('카테고리 검증', () => { expect(validateCategory({ name: '식비', emoji: '🍚' })).toBeNull(); expect(validateCategory({ name: ' ', emoji: '🍚' })).toMatch('이름'); });
test('팁: 겹치지 않고 한 바퀴 돈다', () => {
  let s = emptyTipState(); const seen = new Set();
  for (let i = 0; i < TIPS.length; i++) { const r = nextTip(s, '2026-10-19', () => 0.3); seen.add(r.key); s = r.state; }
  expect(seen.size).toBe(TIPS.length);
  expect(TIPS).toHaveLength(17);
});
test('팁: 닫으면 오늘 숨김, 2번 닫으면 영구 제외(고정 키)', () => {
  let s = dismissTip(emptyTipState(), 'sprout', '2026-10-19');
  expect(nextTip(s, '2026-10-19').tip).toBeNull();
  s = dismissTip(s, 'sprout', '2026-10-20');
  expect(s.excluded).toContain('sprout');
  for (let i = 0; i < 40; i++) { const r = nextTip(s, '2026-10-21'); expect(r.key).not.toBe('sprout'); s = r.state; }
});
test('팁 키는 겹치지 않고, M2 순서표는 M2 팁 15개를 모두 가리킴', () => {
  expect(new Set(TIP_LIST.map((t) => t.key)).size).toBe(17);
  expect(M2_ORDER).toHaveLength(15);
  for (const k of M2_ORDER) expect(TIP_LIST.some((t) => t.key === k)).toBe(true);
});
test('N2 M2 번호 저장값 옮기기: 영구 제외한 🔥 팁(M2 4번)은 계속 제외, 🌱 팁(M2 3번)은 보임', () => {
  // M2에서 🔥 팁을 ✕ 두 번 → { dismiss: {4: 2}, excluded: [4] }, 큐는 번호
  const m2 = { queue: [3, 0, 1], hiddenOn: '2026-10-18', dismiss: { 4: 2, 7: 1 }, excluded: [4] };
  const s = migrateTipState(m2);
  expect(s.v).toBe(2);
  expect(s.excluded).toEqual(['streak']);
  expect(s.dismiss).toEqual({ streak: 2, catedit: 1 }); // M2 7번 = 카테고리 팁
  expect(s.queue).toEqual(['sprout', 'k000', 'timecat']);
  let st = m2; const seen = new Set();
  for (let i = 0; i < 40; i++) { const r = nextTip(st, `2026-10-${20 + (i % 5)}`); if (r.key) seen.add(r.key); st = r.state; }
  expect(seen.has('streak')).toBe(false);
  expect(seen.has('sprout')).toBe(true);
  expect(seen.has('longpress')).toBe(true); // 새로 들어온 팁도 나옴
  // 같은 날 다시 읽어도(이미 옮긴 값) 그대로
  expect(migrateTipState(s)).toEqual(s);
});
test('팁 저장값이 깨졌거나 모르는 키면 버림', () => {
  expect(migrateTipState(null)).toEqual(emptyTipState());
  expect(migrateTipState({ v: 2, excluded: ['nope', 'dark'], queue: [99] }).excluded).toEqual(['dark']);
  expect(migrateTipState({ excluded: [99] }).excluded).toEqual([]);
});
test('시간대 추천: 아침 카페, 점심 식비, 최근 사용 우선', () => {
  const exp = DEFAULT_CATEGORIES.filter((c) => c.kind === 'expense');
  expect(suggestOrder(exp, [], 8)[0].id).toBe('cafe');
  expect(suggestOrder(exp, [], 12)[0].id).toBe('food');
  expect(suggestOrder(exp, ['transit'], 15)[0].id).toBe('transit');
});
