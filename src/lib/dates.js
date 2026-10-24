// 날짜는 모두 기기 현지 시간 기준 'YYYY-MM-DD' 문자열로 다룬다.
import { periodRangeLabel, normalizeStartDay } from './monthPeriod.js';
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const isYm = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(parseYmd(s)) === s;
export const clampStartDay = (n) => Math.min(28, Math.max(1, Math.trunc(Number(n)) || 1));

export function shiftYm(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// 월 시작일(월급날) 기간. 29~31일은 그 달 말일로 맞춘다. 자세한 계산은 monthPeriod.js.
export { period, periodOf, periodRangeLabel, normalizeStartDay } from './monthPeriod.js';
export function daysLeftInclusive(p, today) {
  if (today < p.start) return p.days;
  if (today >= p.end) return 0;
  return Math.round((parseYmd(p.end) - parseYmd(today)) / 86400000);
}
export function monthLabel(ym, startDay = 1) {
  const m = Number(ym.slice(5, 7));
  if (normalizeStartDay(startDay) === 1) return `${m}월`;
  return `${m}월 (${periodRangeLabel(ym, startDay)})`;
}
export const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
export function prettyDate(s, today) {
  if (s === today) return '오늘';
  if (s === addDays(today, -1)) return '어제';
  const d = parseYmd(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
}
