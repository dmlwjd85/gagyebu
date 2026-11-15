// 주식·연금 계좌. 결제수단(accounts)과 컬렉션을 나누어 기존 가계부 기록을 건드리지 않는다.
// 금액은 정수 원. 수량은 소수 넷째 자리까지 qtyE4(수량 × 10000) 정수로 저장한다.
import { addDays, isYmd, parseYmd } from './dates.js';

export const ACCOUNT_TYPES = {
  stock: '일반 주식',
  pension: '연금저축',
  irp: 'IRP',
  isa: 'ISA',
  dc: 'DC',
  civil: '공무원연금',
};
export const HOLDING_KINDS = { stock: '주식', etf: 'ETF', fund: '펀드', deposit: '예금' };

// 2025년 시행 한도·세율. 2026년 법이 바뀌면 설정에서 고친다.
export const DEFAULT_TAX = {
  pensionLimit: 6_000_000,
  combinedLimit: 9_000_000,
  rateHigh: 1650, // 16.5% = 10000분의 1650
  rateLow: 1320, // 13.2%
  rateChoice: 'high',
};
const MONEY_MAX = 10_000_000_000;
const LIMIT_MAX = 100_000_000_000;
const QTY_MAX = 1_000_000_000_000; // 1억 단위 × 10000

const clampInt = (v, min, max, fallback) => (Number.isInteger(v) && v >= min && v <= max ? v : fallback);

export function taxPrefs(stored) {
  const s = stored ?? {};
  const choice = s.rateChoice === 'low' ? 'low' : 'high';
  return {
    pensionLimit: clampInt(s.pensionLimit, 0, LIMIT_MAX, DEFAULT_TAX.pensionLimit),
    combinedLimit: clampInt(s.combinedLimit, 0, LIMIT_MAX, DEFAULT_TAX.combinedLimit),
    rateHigh: clampInt(s.rateHigh, 0, 10000, DEFAULT_TAX.rateHigh),
    rateLow: clampInt(s.rateLow, 0, 10000, DEFAULT_TAX.rateLow),
    rateChoice: choice,
  };
}

export function daysBetween(from, to) {
  if (!isYmd(from) || !isYmd(to)) return null;
  return Math.round((parseYmd(to) - parseYmd(from)) / 86400000);
}

/** 종목 코드: 앞의 A 제거, 숫자 1~6자리는 6자리로. 한글·기호는 버림. */
export function normalizeCode(code) {
  let s = String(code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^A\d{6}$/.test(s)) s = s.slice(1);
  if (/^\d{1,6}$/.test(s)) s = s.padStart(6, '0');
  return s;
}

export function parseQtyE4(input) {
  const s = String(input ?? '').trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,4})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const e4 = Number(whole) * 10000 + Number(frac.padEnd(4, '0'));
  if (!Number.isSafeInteger(e4) || e4 > QTY_MAX) return null;
  return e4;
}

export function formatQty(qtyE4) {
  const v = Math.trunc(Number(qtyE4) || 0);
  const neg = v < 0;
  const a = Math.abs(v);
  const whole = Math.floor(a / 10000);
  const frac = String(a % 10000).padStart(4, '0').replace(/0+$/, '');
  const body = whole.toLocaleString('ko-KR') + (frac ? `.${frac}` : '');
  return neg ? `-${body}` : body;
}

/** 수량(qtyE4) × 가격(원)을 반올림한 원. 범위 밖이면 null. */
export function mulQtyPrice(qtyE4, price) {
  if (!Number.isInteger(qtyE4) || !Number.isInteger(price) || qtyE4 < 0 || price < 0) return null;
  if (qtyE4 > QTY_MAX || price > MONEY_MAX) return null;
  const num = BigInt(qtyE4) * BigInt(price);
  const den = 10000n;
  const rounded = (num + den / 2n) / den;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(rounded);
}

/** 수익률(소수 한 자리). 원금이 0이면 null. */
export function returnPct(invested, valuation) {
  if (!Number.isInteger(invested) || !Number.isInteger(valuation) || invested <= 0) return null;
  const diff = BigInt(valuation) - BigInt(invested);
  const bp = Number((diff * 1000n + (diff < 0n ? -BigInt(invested) / 2n : BigInt(invested) / 2n)) / BigInt(invested));
  return bp / 10;
}

export function formatPct(p) {
  if (p == null || !Number.isFinite(p)) return '—';
  const sign = p > 0 ? '+' : p < 0 ? '−' : '';
  return `${sign}${Math.abs(p).toFixed(1)}%`;
}

export function formatRateBp(bp) {
  const n = clampInt(bp, 0, 10000, 0);
  return `${(n / 100).toFixed(1)}%`;
}

/** '16.5' '%13.2' → 1650. 소수 한 자리, 0~100. */
export function parseRateBp(input) {
  const s = String(input ?? '').trim().replace(/%/g, '').replace(/,/g, '');
  if (!/^\d{1,3}(\.\d)?$/.test(s)) return null;
  const n = Number(s);
  if (n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

export function roundByRate(amount, rateBp) {
  if (!Number.isInteger(amount) || amount < 0 || !Number.isInteger(rateBp) || rateBp < 0) return 0;
  const num = BigInt(amount) * BigInt(rateBp);
  return Number((num + 5000n) / 10000n);
}

const hasPrice = (h) => Number.isInteger(h.lastPrice) && h.lastPrice >= 0 && isYmd(h.priceDate);

export function summarizeAccount(account, holdings) {
  const mine = (holdings ?? []).filter((h) => h.assetAccountId === account.id);
  let invested = 0, valuation = 0, pricedCost = 0, unpriced = 0;
  for (const h of mine) {
    const cost = mulQtyPrice(h.qtyE4 ?? 0, h.avgPrice ?? 0);
    if (cost == null) continue;
    invested += cost;
    if (!hasPrice(h)) { unpriced++; continue; }
    const val = mulQtyPrice(h.qtyE4 ?? 0, h.lastPrice);
    if (val == null) { unpriced++; continue; }
    valuation += val;
    pricedCost += cost;
  }
  return {
    holdings: mine,
    invested, valuation, pricedCost, unpriced,
    gain: valuation - pricedCost,
    returnPct: returnPct(pricedCost, valuation),
  };
}

export function summarizeAll(accounts, holdings) {
  const rows = (accounts ?? []).filter((a) => !a.archived).map((account) => ({ account, ...summarizeAccount(account, holdings) }));
  const invested = rows.reduce((s, r) => s + r.invested, 0);
  const valuation = rows.reduce((s, r) => s + r.valuation, 0);
  const pricedCost = rows.reduce((s, r) => s + r.pricedCost, 0);
  const unpriced = rows.reduce((s, r) => s + r.unpriced, 0);
  const civil = rows.filter((r) => r.account.type === 'civil' && Number.isInteger(r.account.expectedPension) && r.account.expectedPension > 0);
  return {
    rows, invested, valuation, pricedCost, unpriced,
    gain: valuation - pricedCost,
    returnPct: returnPct(pricedCost, valuation),
    civilMonthly: civil.reduce((s, r) => s + r.account.expectedPension, 0),
    civilCount: civil.length,
  };
}

export function priceDateSummary(holdings) {
  const dates = (holdings ?? []).map((h) => h.priceDate).filter(isYmd);
  if (!dates.length) return { has: false, oldest: null, newest: null, mixed: false };
  const oldest = dates.reduce((a, b) => (a < b ? a : b));
  const newest = dates.reduce((a, b) => (a > b ? a : b));
  return { has: true, oldest, newest, mixed: oldest !== newest };
}

export function contributed(accountId, contributions, year, { deductible } = {}) {
  return (contributions ?? []).reduce((sum, c) => {
    if (c.assetAccountId !== accountId || !String(c.date || '').startsWith(String(year))) return sum;
    if (deductible != null && Boolean(c.deductible) !== deductible) return sum;
    return Number.isInteger(c.amount) && c.amount > 0 ? sum + c.amount : sum;
  }, 0);
}

/**
 * 연금저축은 pensionLimit까지, 그 합산은 combinedLimit까지.
 * 연금저축이 한도를 넘어도 IRP·DC 자리를 대신 쓰지 않는다.
 * 합산 한도가 연금저축 한도보다 작으면 공제 대상은 합산 한도를 넘지 않는다.
 */
export function taxCredit({ accounts = [], contributions = [], prefs, year }) {
  const p = taxPrefs(prefs);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  let pensionPaid = 0, extraPaid = 0;
  for (const c of contributions ?? []) {
    if (!c.deductible || !Number.isInteger(c.amount) || c.amount <= 0) continue;
    if (!String(c.date || '').startsWith(String(year))) continue;
    const type = byId.get(c.assetAccountId)?.type;
    if (type === 'pension') pensionPaid += c.amount;
    else if (type === 'irp' || type === 'dc') extraPaid += c.amount;
  }
  const pensionBase = Math.min(pensionPaid, p.pensionLimit, p.combinedLimit);
  const room = Math.max(0, p.combinedLimit - pensionBase);
  const extraBase = Math.min(extraPaid, room);
  const base = pensionBase + extraBase;
  const rateBp = p.rateChoice === 'low' ? p.rateLow : p.rateHigh;
  return {
    ...p, year: String(year), pensionPaid, extraPaid, pensionBase, extraBase, room, base, rateBp,
    refund: roundByRate(base, rateBp),
  };
}

export function progressPct(used, limit) {
  if (!limit) return used > 0 ? 100 : 0;
  return Math.min(999, Math.round((used / limit) * 100));
}

/** 만기 60일 전~만기 후 60일. 그 밖에는 null(계좌 카드의 만기일은 따로 보여 줌). */
export function isaReminder(account, today) {
  if (account?.type !== 'isa' || !isYmd(account.maturity) || !isYmd(today)) return null;
  const untilMaturity = daysBetween(today, account.maturity);
  const windowEnd = addDays(account.maturity, 60);
  const untilWindowEnd = daysBetween(today, windowEnd);
  if (untilMaturity > 60 || untilWindowEnd < 0) return null;
  let tone = 'soon';
  let text = `만기까지 ${untilMaturity}일. 만기일부터 60일(${windowEnd}) 안에 연금계좌로 옮기면 추가 세액공제를 받을 수 있어요.`;
  if (untilMaturity === 0) {
    tone = 'today';
    text = `오늘이 ISA 만기예요. ${windowEnd}까지 연금계좌로 옮길 수 있어요.`;
  } else if (untilMaturity < 0) {
    tone = 'window';
    text = `연금 이전 기간이 ${untilWindowEnd}일 남았어요. ${windowEnd}까지예요.`;
  }
  return { maturity: account.maturity, windowEnd, untilMaturity, untilWindowEnd, tone, text };
}

const longDigits = (s) => /\d{10,}/.test(s ?? '');

export function validateAssetAccount(v) {
  if (!ACCOUNT_TYPES[v.type]) return '계좌 종류를 골라 주세요.';
  const institution = (v.institution ?? '').trim();
  const name = (v.name ?? '').trim();
  if (!institution || institution.length > 40) return '금융기관은 1~40자로 적어 주세요.';
  if (!name || name.length > 40) return '이름은 1~40자로 적어 주세요.';
  if (longDigits(institution) || longDigits(name)) return '계좌번호는 저장하지 않아요. 기관과 별명만 적어 주세요.';
  if (!isYmd(v.opened)) return '개설일을 확인해 주세요.';
  if (v.type === 'isa') {
    if (!isYmd(v.maturity)) return 'ISA 만기일을 적어 주세요.';
    if (v.maturity < v.opened) return '만기일은 개설일 이후로 정해 주세요.';
  }
  if (v.type === 'civil' && (!Number.isInteger(v.expectedPension) || v.expectedPension < 0 || v.expectedPension > MONEY_MAX)) {
    return '예상 연금은 0원~100억 원으로 적어 주세요.';
  }
  return null;
}

export function validateHolding(v) {
  if (!HOLDING_KINDS[v.kind]) return '종류를 골라 주세요.';
  const name = (v.name ?? '').trim();
  if (!name || name.length > 80) return '종목 이름은 1~80자로 적어 주세요.';
  if (longDigits(name)) return '계좌번호는 저장하지 않아요.';
  const code = normalizeCode(v.code);
  if (v.kind === 'stock' || v.kind === 'etf') {
    if (!/^[A-Z0-9]{1,12}$/.test(code)) return '종목 코드는 영문·숫자로 적어 주세요. 예: 005930';
  } else if (v.code && !/^[A-Z0-9]{1,12}$/.test(code)) return '코드는 영문·숫자 12자까지예요.';
  const qtyE4 = typeof v.qtyE4 === 'number' ? v.qtyE4 : parseQtyE4(v.qty);
  if (qtyE4 == null || qtyE4 <= 0) return '수량은 0보다 큰 숫자로, 소수 넷째 자리까지 적어 주세요.';
  if (!Number.isInteger(v.avgPrice) || v.avgPrice < 0 || v.avgPrice > MONEY_MAX) return '평균 단가는 0원~100억 원이에요.';
  if (!Number.isInteger(v.lastPrice) || v.lastPrice < 0 || v.lastPrice > MONEY_MAX) return '현재 가격은 0원~100억 원이에요.';
  if (v.lastPrice > 0 && !isYmd(v.priceDate)) return '시세 기준일을 적어 주세요.';
  return null;
}

export function validateContribution(v) {
  if (!isYmd(v.date)) return '납입일을 확인해 주세요.';
  if (!Number.isInteger(v.amount) || v.amount <= 0 || v.amount > MONEY_MAX) return '금액은 1원~100억 원으로 적어 주세요.';
  return null;
}

export function validateTaxPrefs(v) {
  if (!Number.isInteger(v.pensionLimit) || v.pensionLimit < 0 || v.pensionLimit > LIMIT_MAX) return '연금저축 한도는 0원~1,000억 원이에요.';
  if (!Number.isInteger(v.combinedLimit) || v.combinedLimit < 0 || v.combinedLimit > LIMIT_MAX) return '합산 한도는 0원~1,000억 원이에요.';
  if (parseRateBp(v.rateHigh) == null || parseRateBp(v.rateLow) == null) return '세율은 0~100, 소수 한 자리로 적어 주세요. 예: 16.5';
  return null;
}
