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

// 구독으로 보면 안 되는 일상 지출(같은 값이 우연히 반복되기 쉬움)
const DAILY = /점심|저녁|아침|간식|야식|장보기|커피|아메리카노|라떼|택시|버스|지하철|편의점|마트|식사|회식|술|밥/;
const DAILY_CATS = new Set(['food', 'cafe', 'transit', 'living']);
const BILL_CATS = new Set(['telecom', 'housing', 'insurance', 'edu']);
const monthIndex = (ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;

/**
 * 거래 기록에서 구독처럼 보이는 것 찾기. 모두 맞아야 제안:
 *  - 같은 가맹점(메모 첫 부분이 똑같음)·같은 금액
 *  - 한 달에 한 번씩, 3달 이상(통신·주거처럼 고지서 카테고리는 2달 이상), 달이 거의 이어짐
 *  - 결제일이 규칙적(날짜 차이 3일 이하, 말일 결제는 28~31일을 같은 날로 봄)
 *  - 점심·아메리카노·장보기 같은 일상 지출과 식비·카페·교통·생활 카테고리는 제외
 * @returns {{name, amount, months, day, categoryId}[]}
 */
export function detectSubscriptions(txs, existing = []) {
  const known = new Set(existing.map((r) => `${r.name}|${r.amount}`));
  const m = new Map();
  for (const t of txs) {
    if (t.kind !== 'expense' || t.recurringId || !t.memo || t.amount <= 0) continue;
    const name = t.memo.split(' · ')[0].replace(/#[^\s#]+/g, '').trim();
    if (!name) continue;
    const k = `${name}|${t.amount}`;
    if (!m.has(k)) m.set(k, { name, amount: t.amount, list: [], cats: new Map() });
    const e = m.get(k); e.list.push(t.date); e.cats.set(t.categoryId, (e.cats.get(t.categoryId) || 0) + 1);
  }
  const out = [];
  for (const [k, e] of m) {
    if (known.has(k) || DAILY.test(e.name)) continue;
    const categoryId = [...e.cats].sort((a, b) => b[1] - a[1])[0][0];
    if (DAILY_CATS.has(categoryId)) continue;
    const months = new Set(e.list.map((d) => d.slice(0, 7)));
    if (months.size !== e.list.length) continue; // 한 달에 두 번 이상 = 구독 아님
    const need = BILL_CATS.has(categoryId) ? 2 : 3;
    if (months.size < need) continue;
    const idx = [...months].map(monthIndex).sort((a, b) => a - b);
    if (idx[idx.length - 1] - idx[0] > months.size) continue; // 빠진 달이 2달 이상
    const days = e.list.map((d) => { const n = Number(d.slice(8)); return n >= 28 ? 31 : n; });
    if (Math.max(...days) - Math.min(...days) > 3) continue;
    const day = Math.min(31, Math.round(days.reduce((a, b) => a + b, 0) / days.length));
    out.push({ name: e.name, amount: e.amount, months: months.size, day, categoryId });
  }
  return out.sort((a, b) => b.months - a.months || b.amount - a.amount).slice(0, 5);
}
