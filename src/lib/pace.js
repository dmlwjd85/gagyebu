// 1인 가구: 월급날 기간의 하루 몫을 정수 원으로 나누고, 이번 주·오늘 남은 돈을 계산.
// 하루 몫의 합은 예산과 같다. 나머지는 기간의 앞날부터 1원씩.
import { addDays, parseYmd } from './dates.js';

function assertInt(n, name) {
  if (!Number.isInteger(n)) throw new TypeError(`${name}는 정수여야 해요`);
}

export function dailyShares(budget, days) {
  assertInt(budget, '예산');
  if (!Number.isInteger(days) || days <= 0) throw new TypeError('일수는 1 이상의 정수여야 해요');
  if (budget < 0) throw new TypeError('예산은 0원 이상이어야 해요');
  const base = Math.floor(budget / days);
  let rem = budget - base * days;
  const out = new Array(days);
  for (let i = 0; i < days; i++) {
    const extra = rem > 0 ? 1 : 0;
    if (extra) rem -= 1;
    out[i] = base + extra;
  }
  return out;
}

/** 월요일 시작 ~ 다음 월요일(미포함). 일요일은 그 주의 마지막 날. */
export function weekRange(today) {
  const dow = parseYmd(today).getDay();
  const back = dow === 0 ? 6 : dow - 1;
  const start = addDays(today, -back);
  return { start, end: addDays(start, 7) };
}

export function datesOf(p) {
  const out = [];
  for (let d = p.start; d < p.end; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * @param {{ budget: number, p: {start: string, end: string}, today: string, spentByDate?: Record<string, number> }} args
 * spentByDate: 날짜 → 순지출(환불은 음수 정수). 기간 밖 날은 세지 않는다.
 * 남은 돈 = 그 구간의 하루 몫 합 − 오늘까지 순지출. 넘치면 음수.
 */
export function weekDailyLeft({ budget, p, today, spentByDate = {} }) {
  assertInt(budget, '예산');
  const dates = datesOf(p);
  const shares = dailyShares(budget, dates.length);
  const idx = dates.indexOf(today);
  if (idx < 0) return { inPeriod: false, weekLeft: 0, todayLeft: 0, weekShare: 0, todayShare: 0 };
  const week = weekRange(today);
  let weekShare = 0;
  let weekSpent = 0;
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    if (d >= week.start && d < week.end) {
      weekShare += shares[i];
      if (d <= today) {
        const s = spentByDate[d] ?? 0;
        assertInt(s, '지출');
        weekSpent += s;
      }
    }
  }
  const todaySpent = spentByDate[today] ?? 0;
  assertInt(todaySpent, '지출');
  return {
    inPeriod: true,
    weekLeft: weekShare - weekSpent,
    todayLeft: shares[idx] - todaySpent,
    weekShare,
    todayShare: shares[idx],
    weekStart: week.start,
    weekEnd: week.end,
  };
}

export function spentByDateFrom(txs) {
  const map = {};
  for (const t of txs) {
    if (t.kind !== 'expense') continue;
    assertInt(t.amount, '금액');
    map[t.date] = (map[t.date] ?? 0) + t.amount;
  }
  return map;
}
