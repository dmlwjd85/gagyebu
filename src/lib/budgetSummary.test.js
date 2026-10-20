import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { budgetView } from '../ui/views.js';
import { moneyWeather, totals, filterPeriod } from './stats.js';
import { period } from './dates.js';
import { formatWon, spendParts } from './money.js';
import { DEFAULT_CATEGORIES } from './defaults.js';

const tx = (date, amount, categoryId, kind = 'expense') => ({ id: `${date}${categoryId}${amount}`, date, amount, kind, categoryId });

function model({ budget, txs, viewYm = '2026-10', today = '2026-10-20' }) {
  const sd = 1;
  const p = period(viewYm, sd);
  const periodTxs = filterPeriod(txs, p);
  const tot = totals(periodTxs);
  return {
    sd, today, curYm: '2026-10', viewYm, p, periodTxs, tot, budget, txLoaded: true,
    categories: DEFAULT_CATEGORIES, accounts: [], rules: [], recurring: [], goals: [], imports: [], txs,
    catMap: new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c])), accMap: new Map(),
    weather: moneyWeather({ budget: budget?.total ?? 0, periodTxs, p, today }),
    wide: false, dark: false, offline: false,
  };
}

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('예산 탭 가독성', () => {
  const txs = [tx('2026-10-03', 280000, 'food'), tx('2026-10-08', 90000, 'transit')];

  test('하루 쓸 돈은 큰 숫자, 남은 돈은 초록 계열로 구분', () => {
    const m = model({ budget: { total: 800000, byCategory: { food: 200000 } }, txs });
    const html = budgetView(m, { envelopes: true });
    const daily = Math.floor(m.weather.remaining / m.weather.daysLeft);
    expect(html).toContain(`class="bud-hero-num">${formatWon(daily)}`);
    expect(html).toContain('씩 쓰면 딱 맞아요');
    expect(html).toContain('bud-chip is-ok');
    expect(html).toContain('text-income');
    expect(text(html)).toContain(`${formatWon(800000 - spendParts(m.tot.expense).spent)} 남았어요`);
    expect(html).toContain('data-action="budget">예산 바꾸기');
  });

  test('예산을 넘기면 빨간 계열이고 하루 권장 문장은 없다', () => {
    const m = model({ budget: { total: 100000 }, txs: [tx('2026-10-04', 250000, 'food')] });
    const html = budgetView(m, {});
    expect(html).toContain('bud-hero is-over');
    expect(html).toContain('bud-hero-num');
    expect(html).toContain('text-expense');
    expect(html).not.toContain('씩 쓰면 딱 맞아요');
    expect(text(html)).toContain(`${formatWon(250000 - 100000)} 넘쳤어요`);
    expect(text(html)).toMatch(/150% 사용|250% 사용/);
  });

  test('계산식은 그대로: 하루 금액 = 남은 예산 ÷ 남은 일수', () => {
    const m = model({ budget: { total: 800000 }, txs });
    const html = budgetView(m, {});
    expect(m.weather.remaining).toBe(800000 - 370000);
    expect(html).toContain(formatWon(Math.floor(m.weather.remaining / m.weather.daysLeft)));
  });

  test('좁은 화면에서 금액·이름이 겹치지 않게 줄바꿈 구조를 둔다', () => {
    const css = readFileSync('src/style.css', 'utf8');
    expect(css).toMatch(/\.bud-hero-num[^{]*\{[^}]*white-space:\s*nowrap/);
    expect(css).toMatch(/\.bud-use \{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.bud-env-row \{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.bud-hero\.is-ok \.bud-hero-num[^}]*var\(--income\)/);
    expect(css).toMatch(/\.bud-hero\.is-over \.bud-hero-num[^}]*var\(--expense\)/);
    const html = budgetView(model({ budget: { total: 800000, byCategory: { food: 10000 } }, txs }), { envelopes: true });
    expect(html).toContain('bud-env-row');
    expect(html).toContain('bud-env-amt');
  });
});
