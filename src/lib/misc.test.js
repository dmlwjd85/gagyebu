import { test, expect } from 'vitest';
import { validateTx, validateCategory } from './validate.js';
import { nextTip, dismissTip, emptyTipState, TIPS } from './tips.js';
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
  for (let i = 0; i < TIPS.length; i++) { const r = nextTip(s, '2026-10-19', () => 0.3); seen.add(r.index); s = r.state; }
  expect(seen.size).toBe(TIPS.length);
});
test('팁: 닫으면 오늘 숨김, 2번 닫으면 영구 제외', () => {
  let s = dismissTip(emptyTipState(), 3, '2026-10-19');
  expect(nextTip(s, '2026-10-19').tip).toBeNull();
  s = dismissTip(s, 3, '2026-10-20');
  expect(s.excluded).toContain(3);
  for (let i = 0; i < 40; i++) { const r = nextTip(s, '2026-10-21'); expect(r.index).not.toBe(3); s = r.state; }
});
test('시간대 추천: 아침 카페, 점심 식비, 최근 사용 우선', () => {
  const exp = DEFAULT_CATEGORIES.filter((c) => c.kind === 'expense');
  expect(suggestOrder(exp, [], 8)[0].id).toBe('cafe');
  expect(suggestOrder(exp, [], 12)[0].id).toBe('food');
  expect(suggestOrder(exp, ['transit'], 15)[0].id).toBe('transit');
});
