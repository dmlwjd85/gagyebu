import { addDays, daysLeftInclusive } from './dates.js';

const inRange = (t, p) => t.date >= p.start && t.date < p.end;
export const filterPeriod = (txs, p) => txs.filter((t) => inRange(t, p));

export function totals(txs) {
  let expense = 0, income = 0;
  for (const t of txs) (t.kind === 'income' ? (income += t.amount) : (expense += t.amount));
  return { expense, income, saved: income - expense };
}

/**
 * 카테고리별 순지출(환불 차감 후). 비율(share)은 순지출이 남은(양수) 카테고리 합 기준 0~1, 합 = 1.
 * 순지출이 0 이하인 카테고리(환불이 더 큼·상쇄)는 share 0, over: true → 도넛에서 빼고 목록에 따로 표시
 * @returns {{categoryId, amount, share, over?: boolean}[]} 양수 큰 순 → 0 이하
 */
export function byCategory(txs, kind = 'expense') {
  const map = new Map();
  for (const t of txs) if (t.kind === kind) map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount);
  const pos = [...map.values()].filter((v) => v > 0).reduce((a, v) => a + v, 0);
  return [...map].map(([categoryId, amount]) => (amount > 0 ? { categoryId, amount, share: pos ? amount / pos : 0 } : { categoryId, amount, share: 0, over: true }))
    .sort((a, b) => b.amount - a.amount || String(a.categoryId).localeCompare(String(b.categoryId)));
}

/** 봉투(카테고리 한도) 막대: 환불로 사용액이 음수여도 0%, 100% 넘으면 막대는 100%에서 멈춤 */
export function envelope(spent, limit) {
  const used = Math.max(0, spent);
  const r = limit > 0 ? used / limit : 0;
  return { width: Math.min(100, Math.round(r * 1000) / 10), pct: Math.round(r * 100), over: limit > 0 && used > limit, near: limit > 0 && r >= 0.9 && used <= limit, refund: spent < 0 ? -spent : 0, used };
}

export function byDay(txs) {
  const map = {};
  for (const t of txs) {
    const d = (map[t.date] ||= { expense: 0, income: 0, count: 0, spent: false });
    d[t.kind === 'income' ? 'income' : 'expense'] += t.amount;
    if (t.kind === 'expense' && t.amount > 0) d.spent = true; // 무지출 판정은 noSpendDays와 같게(환불만 있는 날 = 무지출)
    d.count++;
  }
  return map;
}

// 0(없음) ~ 4(가장 많음). 그 달 최댓값 대비 비율로 4단계.
export function heatLevel(amount, max) {
  if (!(amount > 0) || !(max > 0)) return 0; // 환불이 더 많은 날(음수)은 색 없음
  const r = amount / max;
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
}

export function trend(txs, periods) {
  return periods.map((p) => ({ ym: p.ym, ...totals(filterPeriod(txs, p)) }));
}

/**
 * 돈 날씨 (스펙 3절). base = 오늘 아침 기준 하루 권장액 = (예산 − 어제까지 지출) / 남은 일수(오늘 포함).
 * available = 오늘 남은 쓸 돈 = max(0, base − 오늘 지출). 날씨는 오늘 지출 / base 비율. (홈 큰 숫자는 monthBudgetLeft 의 이번 달 남은 예산)
 */
export function moneyWeather({ budget, periodTxs, p, today }) {
  if (!budget || budget <= 0) return { hasBudget: false };
  let spentBefore = 0, spentToday = 0;
  for (const t of periodTxs) if (t.kind === 'expense') (t.date === today ? (spentToday += t.amount) : t.date < today && (spentBefore += t.amount));
  // 환불이 더 많아도 '쓴 돈'은 0원 밑으로 내려가지 않음(QA N10). 오늘 들어온 환불은 이전 지출에서 뺌
  if (spentToday < 0) { spentBefore += spentToday; spentToday = 0; }
  spentBefore = Math.max(0, spentBefore);
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
  const spent = new Set(periodTxs.filter((t) => t.kind === 'expense' && t.amount > 0).map((t) => t.date)); // 환불만 있는 날은 무지출
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

/**
 * 이번 달 남은 예산 = 예산 합계 − 이번 달 지출(환불이 더 많으면 0원으로 봄).
 * byCategory(나눠서 관리)에 한도가 있으면 항목별 남은 예산도 돌려줌(한도 큰 순 아님, 카테고리 순서 유지).
 */
export function monthBudgetLeft({ budget, periodTxs, categories = [] }) {
  const total = budget?.total ?? 0;
  if (!total || total <= 0) return { hasBudget: false, items: [] };
  let net = 0;
  const by = new Map();
  for (const t of periodTxs) if (t.kind === 'expense') { net += t.amount; by.set(t.categoryId, (by.get(t.categoryId) ?? 0) + t.amount); }
  const spent = Math.max(0, net);
  const lims = budget?.byCategory ?? {};
  const order = new Map(categories.map((c, i) => [c.id, i]));
  const items = Object.entries(lims).filter(([, lim]) => Number(lim) > 0).map(([id, lim]) => {
    const used = Math.max(0, by.get(id) ?? 0);
    return { categoryId: id, limit: Number(lim), spent: used, left: Number(lim) - used, over: used > Number(lim) };
  }).sort((a, b) => (order.get(a.categoryId) ?? 1e9) - (order.get(b.categoryId) ?? 1e9));
  return { hasBudget: true, total, spent, left: total - spent, over: spent > total, usedPct: Math.min(999, Math.round((spent / total) * 100)), items };
}
