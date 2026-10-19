import { addDays, daysLeftInclusive } from './dates.js';

const inRange = (t, p) => t.date >= p.start && t.date < p.end;
export const filterPeriod = (txs, p) => txs.filter((t) => inRange(t, p));

export function totals(txs) {
  let expense = 0, income = 0;
  for (const t of txs) (t.kind === 'income' ? (income += t.amount) : (expense += t.amount));
  return { expense, income, saved: income - expense };
}

export function byCategory(txs, kind = 'expense') {
  const map = new Map();
  let total = 0;
  for (const t of txs) if (t.kind === kind) { map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount); total += t.amount; }
  return [...map].map(([categoryId, amount]) => ({ categoryId, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount || String(a.categoryId).localeCompare(String(b.categoryId)));
}

export function byDay(txs) {
  const map = {};
  for (const t of txs) {
    const d = (map[t.date] ||= { expense: 0, income: 0, count: 0 });
    d[t.kind === 'income' ? 'income' : 'expense'] += t.amount;
    d.count++;
  }
  return map;
}

// 0(없음) ~ 4(가장 많음). 그 달 최댓값 대비 비율로 4단계.
export function heatLevel(amount, max) {
  if (!amount || !max) return 0;
  const r = amount / max;
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
}

export function trend(txs, periods) {
  return periods.map((p) => ({ ym: p.ym, ...totals(filterPeriod(txs, p)) }));
}

/**
 * 돈 날씨 (스펙 3절). base = 오늘 아침 기준 하루 권장액 = (예산 − 어제까지 지출) / 남은 일수(오늘 포함).
 * 홈 큰 숫자 = 오늘 남은 쓸 돈 = max(0, base − 오늘 지출). 날씨는 오늘 지출 / base 비율.
 */
export function moneyWeather({ budget, periodTxs, p, today }) {
  if (!budget || budget <= 0) return { hasBudget: false };
  let spentBefore = 0, spentToday = 0;
  for (const t of periodTxs) if (t.kind === 'expense') (t.date === today ? (spentToday += t.amount) : t.date < today && (spentBefore += t.amount));
  const daysLeft = Math.max(1, daysLeftInclusive(p, today));
  const remaining = budget - spentBefore - spentToday;
  const base = Math.max(0, Math.floor((budget - spentBefore) / daysLeft));
  const available = Math.max(0, base - spentToday);
  const ratio = base === 0 ? (spentToday > 0 ? Infinity : 1.01) : spentToday / base;
  let weather;
  if (remaining < 0 || ratio > 1) weather = { key: 'rainy', icon: '🌧️', label: '비', text: '오늘은 쉬어가요' };
  else if (ratio > 0.7) weather = { key: 'cloudy', icon: '⛅', label: '흐림', text: '딱 맞게 쓰는 중' };
  else weather = { key: 'sunny', icon: '☀️', label: '맑음', text: '여유 있어요' };
  const spent = spentBefore + spentToday;
  // 내일 예보: 오늘 남긴 돈이 내일 하루 권장액에 더해지는 몫
  const tomorrowDays = daysLeft - 1;
  const tomorrow = tomorrowDays > 0 ? Math.max(0, Math.floor(remaining / tomorrowDays)) : null;
  return { hasBudget: true, budget, spent, remaining, daysLeft, base, available, spentToday, ratio, weather,
    usedPct: Math.min(999, Math.round((spent / budget) * 100)), tomorrow };
}

// 오늘(또는 어제)까지 거래를 하루도 빠짐없이 기록한 연속 일수
export function recordStreak(dates, today) {
  const set = new Set(dates);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

// 기간 안에서 오늘 이전의 지출 0원 날 수
export function noSpendDays(periodTxs, p, today) {
  const spent = new Set(periodTxs.filter((t) => t.kind === 'expense').map((t) => t.date));
  let n = 0;
  for (let d = p.start; d < p.end && d < today; d = addDays(d, 1)) if (!spent.has(d)) n++;
  return n;
}

// 지난 기간보다 가장 많이 늘어난 지출 카테고리 (지난 기간 1만원 이상만)
export function topIncrease(cur, prev, minPrev = 10000) {
  const p = new Map(byCategory(prev).map((x) => [x.categoryId, x.amount]));
  let best = null;
  for (const c of byCategory(cur)) {
    const before = p.get(c.categoryId);
    if (!before || before < minPrev) continue;
    const pct = Math.round(((c.amount - before) / before) * 100);
    if (pct > 0 && (!best || pct > best.pct)) best = { categoryId: c.categoryId, pct, diff: c.amount - before };
  }
  return best;
}
