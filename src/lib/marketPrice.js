// 금융위원회 주식시세·증권상품시세(ETF) 응답을 종가·기준일로만 읽는다.
// 순자산가치(nav)는 쓰지 않는다. 펀드 기준가는 직접 입력.
// 시세는 사용자 보유 문서에만 기록하고, 공개 파일로 다시 올리지 않는다.
import { normalizeCode } from './assets.js';
import { isYmd } from './dates.js';

export { normalizeCode };

export const QUOTE_ENDPOINTS = {
  stock: [
    'https://apis.data.go.kr/1160100/GetStockSecuritiesInfoService_V2/getStockPriceInfo_V2',
    'https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo',
  ],
  etf: [
    'https://apis.data.go.kr/1160100/GetSecuritiesProductInfoService_V2/getETFPriceInfo_V2',
    'https://apis.data.go.kr/1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo',
  ],
};

const PRICE_MAX = 10_000_000_000;

export function kstYmd(now = new Date()) {
  const t = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

export function syncConfig(env = {}) {
  const key = typeof env.DATA_GO_KR_KEY === 'string' ? env.DATA_GO_KR_KEY.trim() : '';
  const serviceAccount = typeof env.FIREBASE_SERVICE_ACCOUNT === 'string' ? env.FIREBASE_SERVICE_ACCOUNT.trim() : '';
  const missing = [];
  if (!key) missing.push('DATA_GO_KR_KEY');
  if (!serviceAccount) missing.push('FIREBASE_SERVICE_ACCOUNT');
  return missing.length ? { ok: false, missing } : { ok: true, missing: [], key, serviceAccount };
}

export function parseServiceAccount(raw) {
  const t = String(raw ?? '').trim();
  if (!t) throw new Error('FIREBASE_SERVICE_ACCOUNT 가 비어 있어요.');
  let text = t;
  if (!t.startsWith('{')) {
    try { text = Buffer.from(t, 'base64').toString('utf8'); }
    catch { throw new Error('FIREBASE_SERVICE_ACCOUNT 를 읽지 못했어요.'); }
  }
  let obj;
  try { obj = JSON.parse(text); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT 는 서비스 계정 JSON 이어야 해요.'); }
  if (!obj || typeof obj !== 'object' || !obj.project_id || !obj.client_email || !obj.private_key) {
    throw new Error('서비스 계정 JSON에 project_id, client_email, private_key 가 있어야 해요.');
  }
  return obj;
}

function serviceKeyParam(key) {
  return key.includes('%') ? key : encodeURIComponent(key);
}

export function buildQuoteUrl({ kind, index = 0, serviceKey, code, begin, end }) {
  const list = QUOTE_ENDPOINTS[kind];
  const base = list?.[index];
  if (!base) throw new Error('시세 종류를 알 수 없어요.');
  const norm = normalizeCode(code);
  if (!norm) throw new Error('종목 코드가 없어요.');
  const q = new URLSearchParams({
    numOfRows: '30',
    pageNo: '1',
    resultType: 'json',
    likeSrtnCd: norm,
    beginBasDt: String(begin).replace(/-/g, ''),
    endBasDt: String(end).replace(/-/g, ''),
  });
  return `${base}?serviceKey=${serviceKeyParam(serviceKey)}&${q.toString()}`;
}

function ymdFromBas(bas) {
  const s = String(bas ?? '').trim();
  if (!/^\d{8}$/.test(s)) return null;
  const ymd = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return isYmd(ymd) ? ymd : null;
}

function parseClose(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/,/g, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

function parseItem(item) {
  if (!item || typeof item !== 'object') return null;
  const code = normalizeCode(item.srtnCd);
  const date = ymdFromBas(item.basDt);
  const close = parseClose(item.clpr);
  if (!code || !date || close == null || close <= 0 || close > PRICE_MAX) return null;
  return { code, date, close, name: typeof item.itmsNm === 'string' ? item.itmsNm : '' };
}

export function parseQuotePayload(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'bad-payload', quotes: [] };
  }
  const header = payload.response?.header ?? payload.header ?? {};
  const resultCode = String(header.resultCode ?? payload.resultCode ?? '');
  if (resultCode && resultCode !== '00' && resultCode !== '0') {
    return { ok: false, error: resultCode, message: String(header.resultMsg ?? ''), quotes: [] };
  }
  const raw = payload.response?.body?.items?.item;
  if (raw == null || raw === '') return { ok: true, quotes: [] };
  const list = Array.isArray(raw) ? raw : [raw];
  return { ok: true, quotes: list.map(parseItem).filter(Boolean) };
}

export function shouldFallback({ httpStatus, parsed }) {
  if (httpStatus === 404 || httpStatus === 301 || httpStatus === 302) return true;
  const c = String(parsed?.error ?? '');
  return c === '12' || c === '04';
}

export function latestQuotes(quotes) {
  const map = new Map();
  for (const q of quotes ?? []) {
    if (!q?.kind || !q.code || !q.date) continue;
    const key = `${q.kind}:${q.code}`;
    const prev = map.get(key);
    if (!prev || q.date > prev.date) map.set(key, q);
  }
  return [...map.values()];
}

export function isUserHoldingPath(path) {
  const p = String(path ?? '').split('/');
  return p.length === 4 && p[0] === 'users' && p[1].length > 0 && p[2] === 'holdings' && p[3].length > 0;
}

/**
 * 주식·ETF만, 같은 종류·같은 코드의 최신 종가만.
 * 저장된 기준일보다 오래된 시세는 건너뛴다(직접 입력한 더 새 날짜를 유지).
 * 종가·기준일이 같으면 쓰지 않는다(다시 돌려도 결과가 같음).
 * 삭제·다른 필드는 만들지 않는다.
 */
export function planPriceUpdates(holdings, quotes) {
  const qmap = new Map((quotes ?? []).map((q) => [`${q.kind}:${q.code}`, q]));
  const updates = [];
  const skipped = [];
  for (const h of holdings ?? []) {
    const path = h.path;
    if (h.kind !== 'stock' && h.kind !== 'etf') { skipped.push({ path, reason: 'manual-kind' }); continue; }
    const code = normalizeCode(h.code);
    if (!code) { skipped.push({ path, reason: 'no-code' }); continue; }
    const q = qmap.get(`${h.kind}:${code}`);
    if (!q) { skipped.push({ path, reason: 'no-quote' }); continue; }
    if (!Number.isInteger(q.close) || q.close <= 0 || q.close > PRICE_MAX || !isYmd(q.date)) {
      skipped.push({ path, reason: 'bad-quote' }); continue;
    }
    if (isYmd(h.priceDate) && q.date < h.priceDate) { skipped.push({ path, reason: 'older-than-saved' }); continue; }
    if (h.lastPrice === q.close && h.priceDate === q.date) { skipped.push({ path, reason: 'unchanged' }); continue; }
    updates.push({ path, lastPrice: q.close, priceDate: q.date, priceSource: 'dataGoKr' });
  }
  return { updates, skipped };
}

export function pricePatch(update) {
  return { lastPrice: update.lastPrice, priceDate: update.priceDate, priceSource: 'dataGoKr' };
}

export async function applyPricePlan({ holdings, quotes, writePrice }) {
  const plan = planPriceUpdates(holdings, quotes);
  const writes = [];
  for (const u of plan.updates) {
    if (!isUserHoldingPath(u.path)) continue;
    const patch = pricePatch(u);
    await writePrice(u.path, patch);
    writes.push({ path: u.path, patch });
  }
  return { ...plan, writes };
}
