// 반복 거래(월세·구독): 매달 정한 날에 자동 기록.
// 거래 id를 'rec-{반복id}-{YYYY-MM}'로 고정 → 여러 기기에서 동시에 돌아도 한 달에 한 번만 생김.
import { shiftYm } from './dates.js';
const pad = (n) => String(n).padStart(2, '0');
export const daysInMonth = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
/** 31일 반복 → 2월엔 28(29)일, 30일인 달엔 30일 */
export const dueDate = (ym, day) => `${ym}-${pad(Math.min(day, daysInMonth(ym)))}`;
export const recTxId = (rid, ym) => `rec-${rid}-${ym}`;

/**
 * 오늘까지 기록됐어야 하는 회차들(아직 안 만든 것만)
 * @param {{id: string, dayOfMonth: number, active: boolean, startYm: string, lastPosted?: string}} r
 * @param {string} today YYYY-MM-DD
 * @param {number} maxBack 최대 몇 달 전까지 채울지(오래 안 열었을 때 폭주 방지)
 * @returns {{ ym: string, date: string, id: string }[]}
 */
export function dueOccurrences(r, today, maxBack = 12) {
  if (!r.active || !r.startYm || !(r.dayOfMonth >= 1 && r.dayOfMonth <= 31)) return [];
  const curYm = today.slice(0, 7);
  let ym = r.lastPosted && r.lastPosted >= r.startYm ? shiftYm(r.lastPosted, 1) : r.startYm;
  const floor = shiftYm(curYm, -(maxBack - 1));
  if (ym < floor) ym = floor;
  const out = [];
  while (ym <= curYm) {
    const date = dueDate(ym, r.dayOfMonth);
    if (date > today) break;
    out.push({ ym, date, id: recTxId(r.id, ym) });
    ym = shiftYm(ym, 1);
  }
  return out;
}

/** 다음 기록 날짜(목록에 '다음: 11월 25일' 표시용) */
export function nextDue(r, today) {
  if (!r.active) return null;
  let ym = today.slice(0, 7);
  if (r.startYm > ym) ym = r.startYm;
  let d = dueDate(ym, r.dayOfMonth);
  if (d <= today || (r.lastPosted && r.lastPosted >= ym)) d = dueDate(shiftYm(ym, 1), r.dayOfMonth);
  return d;
}

/** 월 고정비 합계(활성만, 지출) */
export const monthlyFixed = (list) => list.filter((r) => r.active && r.kind !== 'income').reduce((a, r) => a + r.amount, 0);

/** 거래 기록에서 구독처럼 보이는 것 찾기: 같은 가맹점·같은 금액이 서로 다른 달에 2번 이상, 한 달에 거의 한 번꼴
 *  (지하철·편의점처럼 한 달에 여러 번 나가는 건 구독이 아니므로 뺌) */
export function detectSubscriptions(txs, existing = []) {
  const known = new Set(existing.map((r) => `${r.name}|${r.amount}`));
  const m = new Map();
  for (const t of txs) {
    if (t.kind !== 'expense' || t.recurringId || !t.memo) continue;
    const k = `${t.memo.split(' · ')[0].trim()}|${t.amount}`;
    if (!m.has(k)) m.set(k, { months: new Set(), n: 0 });
    const e = m.get(k); e.months.add(t.date.slice(0, 7)); e.n++;
  }
  return [...m].filter(([k, e]) => e.months.size >= 2 && e.n <= e.months.size * 1.25 && !known.has(k))
    .map(([k, e]) => { const [name, amount] = k.split('|'); return { name, amount: Number(amount), months: e.months.size }; })
    .sort((a, b) => b.months - a.months || b.amount - a.amount).slice(0, 5);
}
