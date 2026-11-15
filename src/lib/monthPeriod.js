// 월급날 기간. 순수 함수만. 저장소·화면과 무관하다.
// 시작일이 그 달에 없으면 그 달 말일로 맞춘다. 없는 값·범위 밖은 1일.
const pad = (n) => String(n).padStart(2, '0');

export function normalizeStartDay(n) {
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : 1;
}

/** month는 1~12. */
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function shiftYm(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function ymdOf(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymdOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function clampedStart(ym, startDay) {
  const [y, m] = ym.split('-').map(Number);
  return Math.min(normalizeStartDay(startDay), daysInMonth(y, m));
}

/**
 * ym 기간. startDay=17, ym=2026-10 → 2026-10-17 이상, 2026-11-17 미만.
 * 끝의 전날이 기간의 마지막 날(10.17 ~ 11.16).
 */
export function period(ym, startDay = 1) {
  const day = normalizeStartDay(startDay);
  const startN = clampedStart(ym, day);
  const [y, m] = ym.split('-').map(Number);
  const start = ymdOf(y, m, startN);
  const next = shiftYm(ym, 1);
  const endN = clampedStart(next, day);
  const [ny, nm] = next.split('-').map(Number);
  const end = ymdOf(ny, nm, endN);
  return { ym, start, end, days: Math.round((parseYmd(end) - parseYmd(start)) / 86400000) };
}

/** 그 날짜가 들어 있는 기간의 ym. 오늘이 속한 기간이 현재 달. */
export function periodOf(dateStr, startDay = 1) {
  const ym = dateStr.slice(0, 7);
  const startN = clampedStart(ym, startDay);
  return Number(dateStr.slice(8, 10)) >= startN ? ym : shiftYm(ym, -1);
}

/** '10.17 ~ 11.16'. 앞자리 0은 붙이지 않는다. */
export function periodRangeLabel(ym, startDay = 1) {
  const p = period(ym, startDay);
  const last = addDays(p.end, -1);
  const dot = (s) => `${Number(s.slice(5, 7))}.${Number(s.slice(8, 10))}`;
  return `${dot(p.start)} ~ ${dot(last)}`;
}
