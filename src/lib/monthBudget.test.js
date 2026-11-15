import { describe, it, expect } from 'vitest';
import { monthBudgetLeft } from './stats.js';

const tx = (categoryId, amount, kind = 'expense') => ({ categoryId, amount, kind, date: '2026-10-10' });

describe('이번 달 남은 예산', () => {
  it('예산이 없으면 hasBudget false', () => {
    expect(monthBudgetLeft({ budget: null, periodTxs: [] })).toEqual({ hasBudget: false, items: [] });
    expect(monthBudgetLeft({ budget: { total: 0 }, periodTxs: [tx('a', 100)] }).hasBudget).toBe(false);
  });
  it('예산 합계 − 지출, 수입은 빼지 않음', () => {
    const r = monthBudgetLeft({ budget: { total: 500000 }, periodTxs: [tx('a', 120000), tx('b', 30000), tx('x', 900000, 'income')] });
    expect(r).toMatchObject({ hasBudget: true, total: 500000, spent: 150000, left: 350000, over: false, usedPct: 30, items: [] });
  });
  it('넘치면 음수', () => {
    const r = monthBudgetLeft({ budget: { total: 100000 }, periodTxs: [tx('a', 130000)] });
    expect(r.left).toBe(-30000);
    expect(r.over).toBe(true);
  });
  it('환불이 더 많으면 사용 0원', () => {
    expect(monthBudgetLeft({ budget: { total: 100000 }, periodTxs: [tx('a', -5000)] }).left).toBe(100000);
  });
  it('항목별 남은 예산(카테고리 순서, 한도 0 제외, 초과 음수)', () => {
    const cats = [{ id: 'food' }, { id: 'cafe' }, { id: 'bus' }];
    const r = monthBudgetLeft({ budget: { total: 300000, byCategory: { cafe: 50000, food: 200000, bus: 0 } }, periodTxs: [tx('food', 80000), tx('cafe', 70000), tx('cafe', -5000)], categories: cats });
    expect(r.items).toEqual([
      { categoryId: 'food', limit: 200000, spent: 80000, left: 120000, over: false },
      { categoryId: 'cafe', limit: 50000, spent: 65000, left: -15000, over: true },
    ]);
  });
});

import { budgetItemsHtml } from '../ui/views.js';
describe('항목별 남은 예산 펼치기', () => {
  const m = { categories: [{ id: 'food', name: '식비', emoji: '🍚' }, { id: 'cafe', name: '카페', emoji: '☕' }], catMap: new Map([['food', { id: 'food', name: '식비', emoji: '🍚' }], ['cafe', { id: 'cafe', name: '카페', emoji: '☕' }]]) };
  const ml = monthBudgetLeft({ budget: { total: 300000, byCategory: { food: 200000, cafe: 50000 } }, periodTxs: [tx('cafe', 70000)], categories: m.categories });
  it('기본 접힘: 목록 없이 버튼과 넘침 개수만', () => {
    const h = budgetItemsHtml(m, ml);
    expect(h).toContain('aria-expanded="false"');
    expect(h).toContain('1개 넘침');
    expect(h).not.toContain('hero-cats');
  });
  it('펼치면 항목별 남은 금액, 초과는 음수와 경고', () => {
    const h = budgetItemsHtml({ ...m, budgetOpen: true }, ml);
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain('200,000원');
    expect(h).toMatch(/is-over[\s\S]*−20,000원/);
  });
});
