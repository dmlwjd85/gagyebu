// 키 없이 받는 국내 주식·ETF 종가. 네이버 증권(현재가 → 일봉)을 먼저 보고, 안 되면 Yahoo Finance(.KS → .KQ)로 한 번 더 본다.
// Yahoo 국내 종가는 네이버(한국거래소 종가)와 조금 다를 때가 있어 마지막 수단으로만 쓴다.
// 비공식 공개 주소라 응답 모양이 바뀔 수 있어, 숫자·날짜·코드가 모두 맞을 때만 시세로 인정한다.
// 원화 정수만 쓴다(해외 종목·외화 시세는 쓰지 않음). 종류(주식/ETF)와 상관없이 같은 코드로 찾는다.
import { normalizeCode } from './assets.js';
import { isYmd } from './dates.js';

export const PRICE_MAX = 10_000_000_000;
export const QUOTE_TIMEOUT_MS = 15_000;
export const MAX_AGE_DAYS = 10;
const UA = 'Mozilla/5.0 (compatible; jjaem-gagyebu-price-sync/1.0)';

/** 국내 종목 코드: 6자리, 첫 글자 숫자(예: 005930, 0080G0). */
export function isKrCode(code) {
  return /^\d[0-9A-Z]{5}$/.test(normalizeCode(code));
}

export function kstYmdFromMs(ms) {
  if (!Number.isFinite(ms)) return null;
  const t = new Date(ms + 9 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const ymd = `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
  return isYmd(ymd) ? ymd : null;
}

function wonInt(v) {
  let n;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const s = v.trim().replace(/,/g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    n = Number(s);
  } else return null;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r > 0 && r <= PRICE_MAX ? r : null;
}

export const naverUrl = (code) => `https://m.stock.naver.com/api/stock/${encodeURIComponent(normalizeCode(code))}/basic`;
/** 네이버 일봉(장 마감 종가). begin/end: YYYY-MM-DD */
export const naverDayUrl = (code, begin, end) => `https://api.stock.naver.com/chart/domestic/item/${encodeURIComponent(normalizeCode(code))}/day?startDateTime=${String(begin).replace(/-/g, '')}0000&endDateTime=${String(end).replace(/-/g, '')}2359`;
export const yahooUrl = (symbol) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10d&interval=1d`;
export const yahooSymbols = (code) => [`${normalizeCode(code)}.KS`, `${normalizeCode(code)}.KQ`];

/** 네이버 증권 basic 응답 → { code, date, close, name } 또는 null */
export function parseNaverBasic(payload, code) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const want = normalizeCode(code);
  if (normalizeCode(payload.itemCode) !== want) return null;
  const close = wonInt(payload.closePrice);
  const ms = Date.parse(String(payload.localTradedAt ?? ''));
  const date = kstYmdFromMs(ms);
  if (close == null || !date) return null;
  return { code: want, date, close, name: typeof payload.stockName === 'string' ? payload.stockName : '' };
}

/** 네이버 일봉 응답(배열) → 가장 최근 날짜의 { code, date, close, name:'' } 또는 null */
export function parseNaverDay(payload, code) {
  if (!Array.isArray(payload)) return null;
  let best = null;
  for (const row of payload) {
    const s = String(row?.localDate ?? '');
    if (!/^\d{8}$/.test(s)) continue;
    const date = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    const close = wonInt(row.closePrice);
    if (!isYmd(date) || close == null) continue;
    if (!best || date > best.date) best = { code: normalizeCode(code), date, close, name: '' };
  }
  return best;
}

function addDaysYmd(ymd, n) {
  return kstYmdFromMs(Date.parse(`${ymd}T00:00:00+09:00`) + n * 86_400_000);
}

/** Yahoo chart 응답 → 마지막 종가가 있는 날의 { code, date, close, name } 또는 null. KRW만. */
export function parseYahooChart(payload, code) {
  const r = payload?.chart?.result?.[0];
  if (!r || typeof r !== 'object') return null;
  const meta = r.meta ?? {};
  if (meta.currency !== 'KRW') return null;
  const want = normalizeCode(code);
  const sym = String(meta.symbol ?? '').toUpperCase();
  if (!sym.startsWith(`${want}.`)) return null;
  // 잘못된 시장 접미사(.KS 로 코스닥 종목 등)는 오래된 다른 상품을 돌려주는 일이 있어 시장이 맞을 때만 쓴다.
  const ex = String(meta.exchangeName ?? '');
  if (sym.endsWith('.KS') && ex && ex !== 'KSC') return null;
  if (sym.endsWith('.KQ') && ex && ex !== 'KOE') return null;
  const ts = Array.isArray(r.timestamp) ? r.timestamp : [];
  const closes = r.indicators?.quote?.[0]?.close;
  if (Array.isArray(closes)) {
    for (let i = Math.min(ts.length, closes.length) - 1; i >= 0; i--) {
      const close = wonInt(closes[i]);
      const date = kstYmdFromMs(Number(ts[i]) * 1000);
      if (close != null && date) return { code: want, date, close, name: String(meta.shortName ?? meta.longName ?? '') };
    }
  }
  const close = wonInt(meta.regularMarketPrice);
  const date = kstYmdFromMs(Number(meta.regularMarketTime) * 1000);
  return close != null && date ? { code: want, date, close, name: String(meta.shortName ?? '') } : null;
}

async function getJson(url, fetchImpl, timeoutMs) {
  let res;
  try {
    res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { error: e?.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
  if (!res.ok) return { error: `http-${res.status}` };
  try { return { json: await res.json() }; } catch { return { error: 'bad-json' }; }
}

/** 기준일이 today 보다 maxAgeDays 넘게 오래됐거나 미래면 쓰지 않는다(상장폐지·잘못된 종목 방지). */
export function isFresh(date, today, maxAgeDays = MAX_AGE_DAYS) {
  if (!isYmd(date) || !isYmd(today)) return false;
  const d = Date.parse(`${date}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  return d <= t + 86_400_000 && t - d <= maxAgeDays * 86_400_000;
}

/**
 * 한 종목 종가. 실패해도 던지지 않고 { quote:null, errors } 를 돌려준다(종목마다 따로 처리).
 * @returns {Promise<{quote: null | {code,date,close,name,source}, errors: string[]}>}
 */
export async function fetchKrQuote(code, { fetchImpl = fetch, timeoutMs = QUOTE_TIMEOUT_MS, today = kstYmdFromMs(Date.now()) } = {}) {
  const norm = normalizeCode(code);
  if (!isKrCode(norm)) return { quote: null, errors: ['unsupported-code'] };
  const errors = [];
  const n = await getJson(naverUrl(norm), fetchImpl, timeoutMs);
  if (n.json) {
    const q = parseNaverBasic(n.json, norm);
    if (q && isFresh(q.date, today)) return { quote: { ...q, source: 'naver' }, errors };
    errors.push(q ? `naver:stale-${q.date}` : 'naver:bad-payload');
  } else errors.push(`naver:${n.error}`);
  const d = await getJson(naverDayUrl(norm, addDaysYmd(today, -14), today), fetchImpl, timeoutMs);
  if (d.json) {
    const q = parseNaverDay(d.json, norm);
    if (q && isFresh(q.date, today)) return { quote: { ...q, source: 'naver' }, errors };
    errors.push(q ? `naver-day:stale-${q.date}` : 'naver-day:bad-payload');
  } else errors.push(`naver-day:${d.error}`);
  for (const sym of yahooSymbols(norm)) {
    const y = await getJson(yahooUrl(sym), fetchImpl, timeoutMs);
    if (y.json) {
      const q = parseYahooChart(y.json, norm);
      if (q && isFresh(q.date, today)) return { quote: { ...q, source: 'yahoo' }, errors };
      errors.push(q ? `yahoo-${sym}:stale-${q.date}` : `yahoo-${sym}:bad-payload`);
    } else errors.push(`yahoo-${sym}:${y.error}`);
  }
  return { quote: null, errors };
}
