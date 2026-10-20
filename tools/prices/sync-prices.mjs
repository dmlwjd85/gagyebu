// 평일 시세 동기화. 공개 JSON을 만들지 않고, 사용자 보유 문서의 종가·기준일만 고친다.
// 시크릿이 없으면 아무 것도 쓰지 않고 끝난다. 삭제하지 않는다.
import { pathToFileURL } from 'node:url';
import { addDays } from '../../src/lib/dates.js';
import {
  QUOTE_ENDPOINTS, applyPricePlan, buildQuoteUrl, isUserHoldingPath, kstYmd, latestQuotes,
  normalizeCode, parseQuotePayload, parseServiceAccount, shouldFallback, syncConfig,
} from '../../src/lib/marketPrice.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchQuote(kind, code, { serviceKey, today, fetchImpl }) {
  const begin = addDays(today, -14);
  const end = addDays(today, 1);
  let lastError = 'no-response';
  for (let i = 0; i < QUOTE_ENDPOINTS[kind].length; i++) {
    const url = buildQuoteUrl({ kind, index: i, serviceKey, code, begin, end });
    let res;
    try { res = await fetchImpl(url, { signal: AbortSignal.timeout(20000) }); }
    catch { lastError = 'network'; break; }
    let payload = null;
    try { payload = await res.json(); } catch { payload = null; }
    const parsed = parseQuotePayload(payload);
    if (res.ok && parsed.ok) return { quotes: parsed.quotes, error: null };
    lastError = parsed.error || String(res.status);
    if (shouldFallback({ httpStatus: res.status, parsed }) && i < QUOTE_ENDPOINTS[kind].length - 1) continue;
    break;
  }
  return { quotes: [], error: lastError };
}

export async function syncOnce({ env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const cfg = syncConfig(env);
  if (!cfg.ok) {
    log(`시세 동기화를 건너뜁니다. 저장소 Secrets에 ${cfg.missing.join(', ')} 를 넣으면 다음 실행부터 보유 종목의 종가와 기준일만 갱신합니다.`);
    return { skipped: true, missing: cfg.missing, failed: false };
  }
  const cred = parseServiceAccount(cfg.serviceAccount);
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  let app;
  try { app = initializeApp({ credential: cert(cred) }, `prices-${Date.now()}`); }
  catch { throw new Error('Firebase 서비스 계정으로 접속하지 못했어요. JSON의 project_id, client_email, private_key 를 확인해 주세요.'); }
  const db = getFirestore(app);
  const snap = await db.collectionGroup('holdings').get();
  const holdings = [];
  snap.forEach((doc) => {
    if (!isUserHoldingPath(doc.ref.path)) return;
    const d = doc.data() ?? {};
    holdings.push({ path: doc.ref.path, kind: d.kind, code: d.code, lastPrice: d.lastPrice, priceDate: d.priceDate });
  });
  const wanted = [];
  const seen = new Set();
  for (const h of holdings) {
    if (h.kind !== 'stock' && h.kind !== 'etf') continue;
    const code = normalizeCode(h.code);
    if (!code) continue;
    const key = `${h.kind}:${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    wanted.push({ kind: h.kind, code });
  }
  const today = kstYmd(new Date());
  const raw = [];
  let requestErrors = 0;
  for (const w of wanted) {
    const got = await fetchQuote(w.kind, w.code, { serviceKey: cfg.key, today, fetchImpl });
    if (got.error) requestErrors++;
    else for (const q of got.quotes) if (q.code === w.code) raw.push({ ...q, kind: w.kind });
    await sleep(250);
  }
  const quotes = latestQuotes(raw);
  let writeErrors = 0;
  const result = await applyPricePlan({
    holdings, quotes,
    writePrice: async (path, patch) => {
      try {
        await db.doc(path).update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
      } catch (e) {
        writeErrors++;
        log(`한 종목 시세를 쓰지 못했습니다(${e.code || 'error'}). 그 문서는 그대로 둡니다.`);
      }
    },
  });
  log(`보유 ${holdings.length}건, 조회 ${wanted.length}건, 갱신 ${result.writes.length - writeErrors}건, 건너뜀 ${result.skipped.length}건, 조회 실패 ${requestErrors}건`);
  return { skipped: false, failed: requestErrors > 0 || writeErrors > 0, updates: result.writes.length - writeErrors };
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  syncOnce().then((r) => process.exit(r.failed ? 1 : 0)).catch((e) => {
    const msg = String(e?.message || '시세 동기화에 실패했습니다.');
    console.error(/private_key|PRIVATE KEY/.test(msg) ? '서비스 계정 인증에 실패했습니다.' : msg.slice(0, 300));
    process.exit(1);
  });
}
