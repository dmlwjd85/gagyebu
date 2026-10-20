// 카드·은행 문자 → 거래 초안. 기기 안에서만 읽고, 네트워크로 보내지 않는다.
import { ymd } from './dates.js';
import { classify } from './classify.js';
import { importHash } from './import/dedupe.js';
import { MAX_MEMO } from './validate.js';

const CARD_ISSUERS = [
  ['신한카드', /신한\s*카드/],
  ['삼성카드', /삼성\s*카드|삼성\s*\d{4}/],
  ['KB국민카드', /KB\s*국민\s*카드|국민\s*카드|KB국민/],
  ['현대카드', /현대\s*카드/],
  ['롯데카드', /롯데\s*카드|롯데\s*\d{4}/],
  ['하나카드', /하나\s*카드|하나\s*\d{4}\s*승인/],
  ['우리카드', /우리\s*카드/],
  ['NH농협카드', /NH\s*농협\s*카드|농협\s*카드|NH농협\s*\d{4}/],
  ['BC카드', /BC\s*카드|비씨\s*카드|BC\s*\(\s*\d{4}\s*\)/i],
  ['카카오뱅크', /카카오\s*뱅크/],
  ['토스뱅크', /토스\s*뱅크|\[토스\]/],
];
const BANK_ISSUERS = [
  ['KB국민은행', /\[KB\]|KB국민은행/],
  ['신한은행', /신한\s*은행|신한\d{1,2}\/\d{1,2}/],
  ['우리은행', /우리\s*은행|(?:^|\n)\s*우리\s+\d{1,2}\//],
  ['하나은행', /하나\s*은행/],
  ['NH농협은행', /\[NH농협\]|NH농협은행|농협은행/],
];

// 새 문자로 보이는 줄. [Web발신] 단독은 앞 문자에 붙인다.
const START_RE = /^(?:\[(?:Web발신|국제발신|국외발신)\])?\s*\[?(?:신한카드|신한은행|신한\d{1,2}\/\d{1,2}|삼성카드|삼성\s*\d{4}|KB국민카드|국민카드|KB국민|현대카드|롯데카드|롯데\s*\d{4}|하나카드|하나은행|하나\s*\d{4}|우리카드|우리은행|NH농협|농협카드|BC카드|비씨카드|BC\s*\(\s*\d{4}|카카오뱅크|카카오\s*뱅크|토스뱅크|\[토스\]|\[KB\]|\[신한|\[삼성|\[현대|\[롯데|\[하나|\[우리|\[BC|\[카카오|\[토스|우리\s+\d{1,2}\/)/i;

const STOP = /^(원|님|카드|은행|승인|취소|입금|출금|일시불|할부|체크|신용|누적|잔액|잔고|웹발신|부분취소|부분환불|결제|사용)$/;

export const SMS_UNPARSED = '이 문자는 결제·입출금으로 읽지 못했어요. 금액과 승인, 취소, 입금, 출금이 적힌 문자인지 확인해 주세요. 저장하지 않았어요.';
export const SMS_DECLINED = '승인되지 않은 안내(거절·한도 초과)라 기록으로 남기지 않았어요.';
export const SMS_EMPTY = '붙여 넣은 문자가 비어 있어요. 저장하지 않았어요.';

/** 클립보드를 읽는다. 없거나 거절·빈 값은 사유만 돌려주고 예외를 올리지 않는다. */
export async function readClipboard(nav = globalThis.navigator) {
  try {
    if (typeof nav?.clipboard?.readText !== 'function') return { ok: false, reason: 'unavailable' };
    const text = await nav.clipboard.readText();
    if (!String(text ?? '').trim()) return { ok: false, reason: 'empty' };
    return { ok: true, text: String(text) };
  } catch {
    return { ok: false, reason: 'denied' };
  }
}

export function clipboardHint(reason) {
  if (reason === 'empty') return '클립보드가 비어 있어요. 문자를 아래에 붙여 넣으세요.';
  return '클립보드를 읽지 못했어요. 문자를 아래에 붙여 넣으세요.';
}

/**
 * @param {string} text
 * @param {{ now?: Date }} [opt]
 * @returns {{ ok: true, items: object[], skipped: number } | { ok: false, reason: 'empty'|'unparsed'|'declined' }}
 */
export function parseSms(text, opt = {}) {
  const raw = String(text ?? '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').trim();
  if (!raw) return { ok: false, reason: 'empty' };
  const now = opt.now instanceof Date ? opt.now : new Date();
  let skipped = 0;
  let declined = 0;
  const items = [];
  splitBlocks(raw).forEach((block, index) => {
    const one = parseOne(block, now);
    if (!one) return;
    if (one.skip) {
      skipped++;
      if (one.skip === 'declined') declined++;
      return;
    }
    items.push({ ...one, index });
  });
  if (!items.length) return { ok: false, reason: declined && declined === skipped ? 'declined' : 'unparsed' };
  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.index - b.index);
  return { ok: true, items, skipped };
}

export function failMessage(reason) {
  if (reason === 'empty') return SMS_EMPTY;
  if (reason === 'declined') return SMS_DECLINED;
  return SMS_UNPARSED;
}

function splitBlocks(raw) {
  const chunks = raw.split(/(?=\[(?:Web발신|국제발신|국외발신)\])/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const chunk of chunks) {
    const paras = chunk.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    const groups = paras.length > 1 && paras.every(looksLikeMessage) ? paras : [chunk.trim()];
    for (const g of groups) out.push(...splitHeaders(g));
  }
  return out.filter(Boolean);
}
const looksLikeMessage = (p) => /승인|취소|입금|출금|썼어요|보냈어요|체크승인/.test(p) && /\d/.test(p);
function splitHeaders(text) {
  const lines = text.split('\n');
  const blocks = [];
  let cur = [];
  const hasBody = () => cur.some((l) => {
    const t = l.trim();
    return t && !/^\[(?:Web발신|국제발신|국외발신)\]$/.test(t);
  });
  for (const line of lines) {
    if (START_RE.test(line.trim()) && hasBody()) {
      blocks.push(cur.join('\n').trim());
      cur = [];
    }
    cur.push(line);
  }
  if (hasBody()) blocks.push(cur.join('\n').trim());
  return blocks.filter(Boolean);
}

function parseOne(block, now) {
  const text = block.replace(/\[Web발신\]/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
  if (/\[(?:국제|국외)발신\]/.test(block) || (/결제완료/.test(text) && /문의|회신|취소요청/.test(text))) return { skip: 'spam' };
  const status = statusOf(text);
  if (status === 'declined') return { skip: 'declined' };
  if (!status) return null;
  const amount = pickAmount(text);
  if (!amount || amount > 1_000_000_000) return null;
  const issuer = detectIssuer(text, status);
  const channel = channelOf(text, status, issuer);
  const date = pickDate(text, now);
  const time = pickTime(text);
  const dateInferred = !date.explicit;
  const installment = pickInstallment(text);
  const card4 = channel === 'card' ? pickCard4(text) : null;
  const merchant = pickMerchant(text, { issuer, channel, status });
  const ymdDate = date.ymd;
  if (!ymdDate) return null;
  const signedAmount = status === 'cancel' || status === 'partial-cancel' ? -amount : amount;
  const kind = status === 'deposit' ? 'income' : 'expense';
  return {
    issuer, channel, status, amount, signedAmount, kind,
    date: ymdDate, time, dateInferred, installment, card4, merchant,
    sortKey: `${ymdDate}T${time || '00:00'}`,
  };
}

function detectIssuer(text, status) {
  const bankish = status === 'deposit' || status === 'withdrawal';
  if (!bankish) {
    for (const [name, re] of CARD_ISSUERS) if (re.test(text)) return name;
  }
  for (const [name, re] of BANK_ISSUERS) if (re.test(text)) return name;
  for (const [name, re] of CARD_ISSUERS) if (re.test(text)) return name;
  return null;
}

function channelOf(text, status, issuer) {
  if (status === 'deposit' || status === 'withdrawal') return 'bank';
  if (issuer && /은행$/.test(issuer)) return 'bank';
  if (/승인|취소|썼어요|체크카드|카드/.test(text)) return 'card';
  return issuer ? 'card' : 'card';
}

function statusOf(text) {
  if (/승인\s*거절|거절|한도\s*초과|거래\s*정지|거래\s*불가|잔액\s*부족/.test(text)) return 'declined';
  if (/부분\s*취소|부분\s*환불/.test(text)) return 'partial-cancel';
  if (/승인\s*취소|(?<![가-힣A-Za-z])취소/.test(text)) return 'cancel';
  if (/체크\s*승인|신용\s*승인|카드\s*승인|(?<![가-힣A-Za-z])승인|썼어요|결제\s*완료/.test(text)) return 'approval';
  const depNarr = /님이[\s\S]{0,40}보냈/.test(text);
  const witNarr = /에게[\s\S]{0,40}보냈/.test(text);
  const depAmt = /입금\s*[\d,]|[\d,]+\s*원?\s*입금/.test(text);
  const witAmt = /인터넷\s*출금\s*[\d,]|출금\s*[\d,]|[\d,]+\s*원?\s*출금/.test(text);
  const dep = depNarr || depAmt || (/입금/.test(text) && !witAmt);
  const wit = witNarr || witAmt;
  if (dep && wit) {
    if (witAmt && !depAmt && !depNarr) return 'withdrawal';
    if (depAmt && !witAmt && !witNarr) return 'deposit';
    return null;
  }
  if (dep) return 'deposit';
  if (wit) return 'withdrawal';
  return null;
}

function stripNoiseForAmount(text) {
  return text
    .replace(/누적\s*[\d,]+(?:\s*원)?/g, ' ')
    .replace(/잔액\s*[\d,]+(?:\s*원)?/g, ' ')
    .replace(/잔고\s*[\d,]+(?:\s*원)?/g, ' ')
    .replace(/\[[^\]]{0,24}\]/g, ' ')
    .replace(/(?:카드|체크|신용|삼성|롯데|하나|우리|농협|신한|BC|비씨)\s*[(\[]?\s*\d{4}\s*[)\]]?/gi, ' ')
    .replace(/\(\s*\d{4}\s*\)/g, ' ')
    .replace(/\d+\*{2,}\d*/g, ' ')
    .replace(/\d{2,4}-\*{2,}[-*\d]*/g, ' ')
    .replace(/1[5-8]\d{2}-\d{4}/g, ' ')
    .replace(/20\d{2}[./-]\d{1,2}[./-]\d{1,2}/g, ' ')
    .replace(/\d{1,2}월\s*\d{1,2}일/g, ' ')
    .replace(/\d{1,2}[./]\d{1,2}/g, ' ')
    .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ')
    .replace(/\d{1,2}\s*개월/g, ' ');
}

function pickAmount(text) {
  const src = stripNoiseForAmount(text);
  const won = [...src.matchAll(/(?<![\d,])(\d{1,3}(?:,\d{3})+|\d{1,9})\s*원/g)]
    .map((m) => Number(m[1].replace(/,/g, '')))
    .filter((n) => n >= 1 && n <= 1_000_000_000);
  if (won.length) return won[0];
  const near = src.match(/(?:인터넷\s*출금|입금|출금|결제)\s*(\d{1,3}(?:,\d{3})+|\d{1,9})/)
    || src.match(/(\d{1,3}(?:,\d{3})+|\d{1,9})\s*(?:입금|출금)/);
  if (!near) return null;
  const n = Number(near[1].replace(/,/g, ''));
  return n >= 1 && n <= 1_000_000_000 ? n : null;
}

function pickDate(text, now) {
  let m = text.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
  if (m) {
    const v = validYmd(+m[1], +m[2], +m[3]);
    if (v) return { ymd: v, explicit: true };
  }
  m = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (m) {
    const v = inferYmd(now, +m[1], +m[2]);
    if (v) return { ymd: v, explicit: true };
  }
  m = text.match(/(?<!\d)(\d{1,2})[./](\d{1,2})(?!\d)/);
  if (m) {
    const v = inferYmd(now, +m[1], +m[2]);
    if (v) return { ymd: v, explicit: true };
  }
  return { ymd: ymd(now), explicit: false };
}

function validYmd(y, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(y, month - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return ymd(d);
}
function inferYmd(now, month, day) {
  const y = now.getFullYear();
  const cur = validYmd(y, month, day);
  if (!cur) return validYmd(y - 1, month, day);
  const dt = new Date(y, month - 1, day);
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dt.getTime() - today0.getTime() > 2 * 86400000) return validYmd(y - 1, month, day);
  return cur;
}

function pickTime(text) {
  const m = text.match(/(?<!\d)(\d{1,2}):(\d{2})(?::\d{2})?(?!\d)/);
  if (!m) return null;
  const h = +m[1]; const min = +m[2];
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function pickInstallment(text) {
  if (/일시불/.test(text) && !/\d{1,2}\s*개월/.test(text)) return null;
  const m = text.match(/(?:할부\s*)?(\d{1,2})\s*개월(?:\s*할부)?/);
  if (!m) return null;
  const n = +m[1];
  return n >= 2 && n <= 60 ? n : null;
}

function pickCard4(text) {
  const m = text.match(/(?:카드|체크|신용|삼성|롯데|하나|우리|농협|신한|BC|비씨)\s*[(\[]?\s*(\d{4})\s*[)\]]?/i)
    || text.match(/\(\s*(\d{4})\s*\)/);
  return m ? m[1] : null;
}

function pickMerchant(text, { issuer, channel }) {
  if (/보냈|썼어요/.test(text)) {
    const narr = text.match(/(.+?)님이[\s\S]{0,30}?[\d,]+원(?:을)?\s*보냈/)
      || text.match(/(.+?)(?:님)?에게[\s\S]{0,20}?[\d,]+원(?:을)?\s*보냈/)
      || text.match(/(.+?)에서[\s\S]{0,20}?[\d,]+원(?:을)?\s*썼/);
    if (narr) {
      const who = scrubMerchant(narr[1], issuer);
      if (who) return who;
    }
  }
  const t = scrubMerchant(text, issuer);
  if (!t && channel === 'bank') {
    // 김*수님 → 김*수. 별표 뒤 1~2글자만 이름이고, 바로 뒤 '님'은 빼 둔다.
    const name = text.match(/[가-힣]{1,2}\*[가-힣]{1,2}(?=님|[^가-힣]|$)/);
    if (name) return name[0];
  }
  return t;
}

function scrubMerchant(text, issuer) {
  let t = String(text);
  const strips = [
    /\[(?:Web발신|국제발신|국외발신)\]/g,
    /\[[^\]]{1,24}\]/g,
    /신한\s*카드|삼성\s*카드|KB\s*국민\s*카드|국민\s*카드|KB국민은행|KB국민|현대\s*카드|롯데\s*카드|하나\s*카드|우리\s*카드|NH\s*농협\s*카드|농협\s*카드|NH농협은행|농협은행|BC\s*카드|비씨\s*카드|카카오\s*뱅크|토스\s*뱅크|신한\s*은행|우리\s*은행|하나\s*은행|NH농협/g,
    /체크\s*승인|신용\s*승인|카드\s*승인|승인\s*취소|부분\s*취소|부분\s*환불|인터넷\s*출금/g,
    /일시불|할부|체크카드|신용카드/g,
    /승인|취소|입금|출금|결제|사용/g,
    /누적\s*[\d,]+(?:\s*원)?|잔액\s*[\d,]+(?:\s*원)?|잔고\s*[\d,]+(?:\s*원)?/g,
    /\d{1,3}(?:,\d{3})+(?:\s*원)?|\d{1,9}\s*원/g,
    /\d{1,2}\s*개월/g,
    /20\d{2}[./-]\d{1,2}[./-]\d{1,2}/g,
    /\d{1,2}월\s*\d{1,2}일/g,
    /\d{1,2}[./]\d{1,2}/g,
    /\d{1,2}:\d{2}(?::\d{2})?/g,
    /\d+\*{2,}\d*/g,
    /\d{2,4}-\*{2,}[-*\d]*/g,
    /1[5-8]\d{2}-\d{4}/g,
    /\(\s*\d{4}\s*\)/g,
    /(?:카드|삼성|롯데|하나|우리|농협|신한|BC|비씨)\s*\d{4}/gi,
    /[가-힣]{1,4}\*[가-힣]{0,2}님?/g,
    /\(주\)|㈜|주식회사/g,
    /님이|에게|에서|보냈어요|썼어요|했습니다|했어요/g,
    /신한(?=\d)/g,
    /체크|신용/g,
  ];
  for (const r of strips) t = t.replace(r, ' ');
  if (issuer === '우리은행') t = t.replace(/(^|\s)우리(?=\s|$)/g, ' ');
  if (issuer === '신한은행' || issuer === '신한카드') t = t.replace(/신한/g, ' ');
  const words = t.split(/\s+/).map((w) => w.replace(/^[^0-9A-Za-z가-힣&+]+|[^0-9A-Za-z가-힣&+.]+$/g, '')).filter((w) => w && !STOP.test(w) && !/^[\d,]+$/.test(w) && w.length >= 2);
  return words.join(' ').slice(0, 80);
}

const ISSUER_TOKENS = {
  신한카드: ['신한'], 신한은행: ['신한'], 삼성카드: ['삼성'], KB국민카드: ['국민', 'KB'], KB국민은행: ['국민', 'KB'],
  현대카드: ['현대'], 롯데카드: ['롯데'], 하나카드: ['하나'], 하나은행: ['하나'], 우리카드: ['우리'], 우리은행: ['우리'],
  NH농협카드: ['농협', 'NH'], NH농협은행: ['농협', 'NH'], BC카드: ['BC', '비씨'], 카카오뱅크: ['카카오'], 토스뱅크: ['토스'],
};

export function pickAccount(accounts, item) {
  const list = (accounts || []).filter((a) => !a.archived);
  const type = item.channel === 'bank' ? 'bank' : 'card';
  const tokens = ISSUER_TOKENS[item.issuer] || [];
  const named = list.find((a) => (a.type === type || !a.type) && tokens.some((t) => String(a.name).includes(t)));
  if (named) return named.id;
  return list.find((a) => a.type === type)?.id || list.find((a) => a.id === (type === 'bank' ? 'bank' : 'card'))?.id || list[0]?.id || '';
}

export function composeMemo(d) {
  const merchant = String(d.merchant ?? '').trim();
  const bits = [];
  if (merchant) bits.push(merchant);
  if (d.installment >= 2) bits.push(`${d.installment}개월`);
  if (d.time) bits.push(d.time);
  if (d.status === 'partial-cancel') bits.push('부분취소');
  const issuer = String(d.issuer ?? '').trim();
  if (issuer && !merchant.includes(issuer)) bits.push(issuer);
  return bits.join(' · ').slice(0, MAX_MEMO);
}

export function categorize(item, rules = [], categories = []) {
  const valid = new Set(categories.filter((c) => c.kind === item.kind && !c.archived).map((c) => c.id));
  return classify({ desc: item.merchant, memo: item.merchant, kind: item.kind }, rules, valid.size ? valid : null);
}

/** 같은 날·같은 금액(저장될 부호 포함)이면 중복 가능 */
export function isLikelyDuplicate(txs, tx) {
  return (txs || []).some((t) => t && t.date === tx.date && t.amount === tx.amount);
}

export function draftFromItem(item, { rules = [], categories = [], accounts = [], txs = [] } = {}) {
  const cat = categorize(item, rules, categories);
  const accountId = pickAccount(accounts, item);
  return {
    ...item,
    categoryId: cat.categoryId,
    categoryBy: cat.by,
    accountId,
    duplicate: isLikelyDuplicate(txs, { date: item.date, amount: item.signedAmount }),
    memo: composeMemo(item),
    memoTouched: false,
    catTouched: false,
    error: '',
  };
}

/** 미리보기에서 고친 값 → 기존 거래 칸만. 취소·부분취소는 음수 지출 + 가져오기와 같은 지문. */
export function txFromDraft(d) {
  const n = Math.abs(parseInt(String(d.amount ?? '').replace(/[^\d]/g, ''), 10) || 0);
  const refund = (d.status === 'cancel' || d.status === 'partial-cancel') && d.kind === 'expense';
  const amount = refund ? -n : (d.kind === 'income' ? n : n);
  const memo = String(d.memoTouched ? (d.memo ?? '') : composeMemo(d)).trim().slice(0, MAX_MEMO);
  const tx = { kind: d.kind === 'income' ? 'income' : 'expense', amount, date: d.date, categoryId: d.categoryId, memo };
  if (d.accountId) tx.accountId = d.accountId;
  if (d.channel === 'card' && /^\d{4}$/.test(d.card4 || '')) tx.card4 = d.card4;
  if (amount < 0) tx.importHash = importHash({ date: d.date, amount, kind: 'expense', desc: String(d.merchant || memo).split(' · ')[0] });
  return tx;
}

export function signedOf(d) {
  const n = Math.abs(parseInt(String(d.amount ?? '').replace(/[^\d]/g, ''), 10) || 0);
  return (d.status === 'cancel' || d.status === 'partial-cancel') && d.kind !== 'income' ? -n : n;
}
