// 부부: 한 사람의 장부 안에서 거래의 누구 돈(나·배우자·공동).
// 계정 연결·공유 장부·초대는 없다.
// 필드가 없는 예전 거래는 '나'로 읽는다. 이 모듈은 문서를 고치지 않는다.
export const OWNERS = ['나', '배우자', '공동'];
export const DEFAULT_OWNER = '나';
export const DEFAULT_SPLIT_ME = 50;
export const MAX_SPOUSE_NAME = 20;

/**
 * 읽기 전용. 없거나 모르는 값은 '나'. tx 객체는 바꾸지 않는다.
 */
export function ownerOf(tx) {
  const o = tx?.owner;
  return o === '배우자' || o === '공동' || o === '나' ? o : DEFAULT_OWNER;
}

/**
 * 저장할 값. '나'·빈 값·모르는 값은 undefined → 필드를 쓰지 않는다.
 * (없는 문서와 같게 읽히므로 예전 기록에 '나'를 채워 넣지 않는다.)
 */
export function ownerToWrite(value) {
  return value === '배우자' || value === '공동' ? value : undefined;
}

/**
 * 시트에서 고른 값을 저장 필드로.
 * 기능이 꺼져 있으면 고른 값을 무시하고, 원래 문서에 있던 배우자·공동·나만 유지한다.
 */
export function ownerForSave(picked, original, enabled) {
  if (enabled) return ownerToWrite(picked);
  const prev = original?.owner;
  if (prev === '배우자' || prev === '공동' || prev === '나') return prev;
  return undefined;
}

export function spouseLabel(settings) {
  const n = typeof settings?.spouseName === 'string' ? settings.spouseName.trim() : '';
  return n.length >= 1 && n.length <= MAX_SPOUSE_NAME ? n : '배우자';
}

export function splitMeOf(settings) {
  const n = settings?.splitMe;
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : DEFAULT_SPLIT_ME;
}

function addInt(a, b) {
  const s = a + b;
  if (!Number.isSafeInteger(s)) throw new TypeError('금액 합이 너무 커요');
  return s;
}

/** 사람별 수입·지출(순액). 필드가 없으면 나. 지출 환불(음수)은 지출 합에서 빠진다. */
export function personTotals(txs) {
  const blank = () => ({ income: 0, expense: 0, saved: 0 });
  const out = { 나: blank(), 배우자: blank(), 공동: blank() };
  for (const t of txs || []) {
    if (!Number.isInteger(t?.amount)) throw new TypeError('금액은 정수여야 해요');
    const bucket = out[ownerOf(t)];
    if (t.kind === 'income') bucket.income = addInt(bucket.income, t.amount);
    else if (t.kind === 'expense') bucket.expense = addInt(bucket.expense, t.amount);
  }
  for (const k of OWNERS) out[k].saved = addInt(out[k].income, -out[k].expense);
  return out;
}

/** 공동 지출 순액. 수입·나·배우자 지출은 넣지 않는다. 환불은 뺀다. */
export function jointNet(txs) {
  let n = 0;
  for (const t of txs || []) {
    if (t?.kind !== 'expense' || ownerOf(t) !== '공동') continue;
    if (!Number.isInteger(t.amount)) throw new TypeError('금액은 정수여야 해요');
    n = addInt(n, t.amount);
  }
  return n;
}

/**
 * 공동 순지출을 비율로 나눈다. splitMe는 나의 퍼센트(0~100 정수). 배우자 비율은 100 - splitMe.
 *
 * 반올림: 나의 부담 = roundHalfAwayFromZero(공동순지출 × splitMe / 100).
 * 즉 절댓값을 100으로 나눈 나머지가 50 이상이면 0에서 먼 정수로 올리고, 50 미만이면 버린다.
 * 배우자 부담 = 공동순지출 − 나의 부담. 그래서 둘의 합은 공동순지출과 같고 1원도 남지 않는다.
 *
 * 누가 누구에게: 이 장부는 한 사람의 것이다. 공동 지출은 장부 주인(나)이 먼저 낸 돈으로 본다.
 * 배우자 부담이 양수면 배우자가 나에게 그 금액. 음수(환불이 더 큼)면 내가 배우자에게 그 절댓값.
 * 0이면 서로 줄 돈 없음.
 */
export function settleAmount(joint, splitMe) {
  if (!Number.isInteger(joint)) throw new TypeError('공동 순지출은 정수여야 해요');
  if (!Number.isInteger(splitMe) || splitMe < 0 || splitMe > 100) throw new TypeError('비율은 0에서 100 사이의 정수여야 해요');
  const prod = joint * splitMe;
  if (!Number.isSafeInteger(prod)) throw new TypeError('금액이 너무 커요');
  const sign = prod < 0 ? -1 : 1;
  const n = Math.abs(prod);
  const q = Math.floor(n / 100);
  const r = n % 100;
  const me = sign * (r >= 50 ? q + 1 : q);
  const spouse = joint - me;
  const owes = spouse > 0 ? { from: '배우자', to: '나', amount: spouse }
    : spouse < 0 ? { from: '나', to: '배우자', amount: -spouse }
    : null;
  return { joint, splitMe, splitSpouse: 100 - splitMe, me, spouse, owes };
}

export function settleJoint(txs, splitMe) {
  return settleAmount(jointNet(txs), splitMe);
}

/** 백업 한 줄. 올바른 owner만 남긴다. 없는 줄은 필드를 만들지 않는다. */
export function sanitizeOwnerRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  if (!('owner' in row)) return row;
  if (row.owner === '나' || row.owner === '배우자' || row.owner === '공동') return row;
  const { owner, ...rest } = row;
  return rest;
}
