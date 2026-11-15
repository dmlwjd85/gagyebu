// 자동 시세 갱신 계획(어느 문서에 어떤 종가를 쓸지). 시세는 quoteSources.js(네이버 증권 → Yahoo Finance)에서 받는다.
// 펀드 기준가는 직접 입력. 시세는 사용자 보유 문서에만 기록하고, 공개 파일로 다시 올리지 않는다.
// priceSource 값 'dataGoKr' 는 규칙·저장 형식을 바꾸지 않으려고 그대로 두며, 이제 '자동 시세'라는 뜻으로만 쓴다.
import { normalizeCode } from './assets.js';
import { isYmd } from './dates.js';
import { PRICE_MAX } from './quoteSources.js';

export { normalizeCode };

export function kstYmd(now = new Date()) {
  const t = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

/** 시세 동기화 설정. 시세에는 키가 필요 없고, 쓰기에 서비스 계정만 필요하다. PRICE_SYNC=off 면 끈다. */
export function syncConfig(env = {}) {
  const off = String(env.PRICE_SYNC ?? '').trim().toLowerCase() === 'off';
  if (off) return { ok: false, off: true, missing: [] };
  const serviceAccount = typeof env.FIREBASE_SERVICE_ACCOUNT === 'string' ? env.FIREBASE_SERVICE_ACCOUNT.trim() : '';
  return serviceAccount ? { ok: true, off: false, missing: [], serviceAccount } : { ok: false, off: false, missing: ['FIREBASE_SERVICE_ACCOUNT'] };
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
 * 주식·ETF만, 같은 코드의 최신 종가만.
 * 저장된 기준일보다 오래된 시세는 건너뛴다(직접 입력한 더 새 날짜를 유지).
 * 종가·기준일이 같으면 쓰지 않는다(다시 돌려도 결과가 같음).
 * 삭제·다른 필드는 만들지 않는다.
 */
export function planPriceUpdates(holdings, quotes) {
  // 종목 코드만으로 찾는다: ETF를 '주식'으로 등록해도 같은 종가가 들어간다(시세 출처가 종류를 가리지 않음).
  const qmap = new Map();
  for (const q of quotes ?? []) {
    const c = normalizeCode(q?.code);
    if (!c) continue;
    const prev = qmap.get(c);
    if (!prev || String(q.date) > String(prev.date)) qmap.set(c, q);
  }
  const updates = [];
  const skipped = [];
  for (const h of holdings ?? []) {
    const path = h.path;
    if (h.kind !== 'stock' && h.kind !== 'etf') { skipped.push({ path, reason: 'manual-kind' }); continue; }
    const code = normalizeCode(h.code);
    if (!code) { skipped.push({ path, reason: 'no-code' }); continue; }
    const q = qmap.get(code);
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
