// 학생: 용돈 주기와 '다음 용돈까지 하루에 쓸 수 있는 돈'. 금액은 정수 원, 하루 몫은 내림.
import { addDays, parseYmd, shiftYm } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');

function assertKrw(n) {
  if (!Number.isInteger(n)) throw new TypeError('금액은 정수 원이어야 해요');
}

/**
 * 이번 회차 시작(포함)과 다음 용돈날(미포함).
 * 오늘이 용돈날이면 오늘은 이번 회차의 시작이고, 다음은 한 주기 뒤.
 */
export function allowanceBounds({ cycle, weekday = 1, day = 1, today }) {
  if (cycle === 'week') {
    const dow = parseYmd(today).getDay();
    const wd = ((Number(weekday) % 7) + 7) % 7;
    const since = (dow - wd + 7) % 7;
    const prev = addDays(today, -since);
    return { prev, next: addDays(prev, 7) };
  }
  if (cycle !== 'month') throw new TypeError('용돈 주기는 week 또는 month');
  if (!Number.isInteger(day) || day < 1 || day > 28) throw new TypeError('용돈일은 1~28일');
  const ym = today.slice(0, 7);
  const dom = Number(today.slice(8, 10));
  const prevYm = dom >= day ? ym : shiftYm(ym, -1);
  const prev = `${prevYm}-${pad(day)}`;
  const next = `${shiftYm(prevYm, 1)}-${pad(day)}`;
  return { prev, next };
}

export function daysBetween(a, b) {
  return Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
}

/**
 * perDay = floor(max(0, 용돈 − 쓴 돈) / 남은 일수). 나머지는 remainder(마지막 날에 더함).
 * 남은 일수 0이면 하루 몫은 0.
 */
export function dailyAllowance({ amount, leftSpent, days }) {
  assertKrw(amount);
  assertKrw(leftSpent);
  if (!Number.isInteger(days) || days < 0) throw new TypeError('남은 일수는 0 이상의 정수');
  const left = amount - leftSpent;
  if (days === 0) return { left, perDay: 0, remainder: Math.max(0, left) };
  const pool = Math.max(0, left);
  const perDay = Math.floor(pool / days);
  return { left, perDay, remainder: pool - perDay * days };
}

/** txs: 이번 회차에 쓴 지출(용돈날 포함, 다음 용돈날 미포함, 오늘까지). */
export function allowanceStatus({ amount, cycle, weekday, day, today, txs = [] }) {
  assertKrw(amount);
  const { prev, next } = allowanceBounds({ cycle, weekday, day, today });
  let spent = 0;
  for (const t of txs) {
    if (t.kind !== 'expense') continue;
    if (t.date >= prev && t.date < next && t.date <= today) {
      assertKrw(t.amount);
      spent += t.amount;
    }
  }
  const days = daysBetween(today, next);
  return { prev, next, days, spent, ...dailyAllowance({ amount, leftSpent: spent, days }) };
}
