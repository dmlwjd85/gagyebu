// 다음 월급날까지 남은 날(읽기 전용). 월급날 = settings/prefs.monthStartDay(2~31).
// 1이거나 없으면 월급날을 정하지 않은 것으로 보고 숨김(매달 1일 'D-day'는 의미 없는 숫자라서).
import { monthStartDayOf } from './modes.js';

const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1~12
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dayNum = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;

/** 그 달의 월급날(그 날이 없으면 말일) */
export function paydayIn(y, m, day) { return ymd(y, m, Math.min(day, lastDay(y, m))); }

/**
 * @param {string} today 'YYYY-MM-DD'
 * @param {number|null|undefined} day 1~31
 * @returns {{ date: string, days: number } | null} 오늘이 월급날이면 days 0
 */
export function nextPayday(today, day) {
  if (!Number.isInteger(day) || day < 2 || day > 31) return null;
  let y = +today.slice(0, 4), m = +today.slice(5, 7);
  let date = paydayIn(y, m, day);
  if (date < today) { m += 1; if (m > 12) { m = 1; y += 1; } date = paydayIn(y, m, day); }
  return { date, days: dayNum(date) - dayNum(today) };
}

/** 남은 날에 따라 문구·이모지 하나 */
export function paydayText(days) {
  if (days === 0) return { text: '오늘 월급날!', emoji: '🎉' };
  if (days === 1) return { text: '내일 월급날 D-1', emoji: '🥳' };
  if (days <= 3) return { text: `조금만 버텨요 D-${days}`, emoji: '🏃' };
  if (days <= 7) return { text: `D-${days} · 월급이 오고 있어요`, emoji: '🚚' };
  if (days <= 14) return { text: `D-${days} · 반은 왔어요`, emoji: '⛰️' };
  if (days <= 21) return { text: `D-${days} · 아직 지갑은 무사`, emoji: '👍' };
  return { text: `D-${days} · 월급 받은 지 얼마 안 됐어요`, emoji: '🌱' };
}

/** 홈 칩에 쓸 값(숨김이면 null) */
export function paydayChip(today, settings) {
  const n = nextPayday(today, monthStartDayOf(settings));
  return n ? { ...n, ...paydayText(n.days) } : null;
}
