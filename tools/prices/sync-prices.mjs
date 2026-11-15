// 평일 시세 동기화. 공개 JSON을 만들지 않고, 사용자 보유 문서의 종가·기준일만 고친다. 삭제하지 않는다.
// 시세는 키 없이 받는다: 네이버 증권 → (실패 시) Yahoo Finance. 종목마다 따로 처리해 한 종목 실패가 전체를 막지 않는다.
// 모든 조회가 실패하거나 쓰기가 실패하면 0이 아닌 코드로 끝나 Actions에 실패로 보인다(조용히 '성공'하지 않음).
import { pathToFileURL } from 'node:url';
import {
  applyPricePlan, isUserHoldingPath, latestQuotes, normalizeCode, parseServiceAccount, syncConfig,
} from '../../src/lib/marketPrice.js';
import { fetchKrQuote, isKrCode } from '../../src/lib/quoteSources.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gh = (level, msg) => (process.env.GITHUB_ACTIONS ? `::${level}::${msg}` : msg);

/** 보유 목록에서 조회할 국내 코드만 한 번씩. 해외·이상한 코드는 건너뜀. */
export function wantedCodes(holdings) {
  const codes = new Set();
  let unsupported = 0;
  for (const h of holdings ?? []) {
    if (h.kind !== 'stock' && h.kind !== 'etf') continue;
    const code = normalizeCode(h.code);
    if (!code) continue;
    if (!isKrCode(code)) { unsupported++; continue; }
    codes.add(code);
  }
  return { codes: [...codes], unsupported };
}

/** 코드별로 시세를 받는다(실패는 모아서 돌려줌). 쓰기는 하지 않는다. */
export async function fetchAll(codes, { fetchImpl = fetch, delayMs = 300, log = () => {} } = {}) {
  const quotes = [];
  const failed = [];
  const sources = { naver: 0, yahoo: 0 };
  for (const code of codes) {
    let got;
    try { got = await fetchKrQuote(code, { fetchImpl }); }
    catch { got = { quote: null, errors: ['unexpected'] }; }
    if (got.quote) {
      sources[got.quote.source] = (sources[got.quote.source] ?? 0) + 1;
      // planPriceUpdates 는 코드로 찾는다. latestQuotes 용으로 종류 자리를 채워 둔다.
      quotes.push({ ...got.quote, kind: 'any' });
    } else {
      failed.push({ code, errors: got.errors });
      log(`${code} 시세를 받지 못했어요(${got.errors.join(', ')}). 그 종목은 그대로 둡니다.`);
    }
    if (delayMs) await sleep(delayMs);
  }
  return { quotes: latestQuotes(quotes), failed, sources };
}

export async function syncOnce({ env = process.env, fetchImpl = fetch, log = console.log, delayMs = 300, db: injectedDb, serverTimestamp } = {}) {
  const cfg = syncConfig(env);
  if (cfg.off) {
    log('PRICE_SYNC=off 라서 시세 동기화를 건너뜁니다.');
    return { skipped: true, failed: false };
  }
  let db = injectedDb;
  let ts = serverTimestamp;
  if (!db) {
    if (!cfg.ok) {
      log(gh('error', `시세를 쓰려면 저장소 Secrets에 ${cfg.missing.join(', ')} 가 필요해요. 끄려면 저장소 변수 PRICE_SYNC=off 를 넣어 주세요.`));
      return { skipped: true, missing: cfg.missing, failed: true };
    }
    const cred = parseServiceAccount(cfg.serviceAccount);
    const { initializeApp, cert } = await import('firebase-admin/app');
    const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
    let app;
    try { app = initializeApp({ credential: cert(cred) }, `prices-${Date.now()}`); }
    catch { throw new Error('Firebase 서비스 계정으로 접속하지 못했어요. JSON의 project_id, client_email, private_key 를 확인해 주세요.'); }
    db = getFirestore(app);
    ts = () => FieldValue.serverTimestamp();
  }
  const snap = await db.collectionGroup('holdings').get();
  const holdings = [];
  snap.forEach((doc) => {
    if (!isUserHoldingPath(doc.ref.path)) return;
    const d = doc.data() ?? {};
    holdings.push({ path: doc.ref.path, kind: d.kind, code: d.code, lastPrice: d.lastPrice, priceDate: d.priceDate });
  });
  const { codes, unsupported } = wantedCodes(holdings);
  const { quotes, failed, sources } = await fetchAll(codes, { fetchImpl, delayMs, log });
  let writeErrors = 0;
  const result = await applyPricePlan({
    holdings, quotes,
    writePrice: async (path, patch) => {
      try {
        await db.doc(path).update({ ...patch, ...(ts ? { updatedAt: ts() } : {}) });
      } catch (e) {
        writeErrors++;
        log(`한 종목 시세를 쓰지 못했습니다(${e.code || 'error'}). 그 문서는 그대로 둡니다.`);
      }
    },
  });
  const written = result.writes.length - writeErrors;
  log(`보유 ${holdings.length}건, 조회 ${codes.length}건(네이버 ${sources.naver ?? 0}·Yahoo ${sources.yahoo ?? 0}), 조회 실패 ${failed.length}건, 국내 코드 아님 ${unsupported}건, 갱신 ${written}건, 건너뜀 ${result.skipped.length}건`);
  const allFailed = codes.length > 0 && failed.length === codes.length;
  if (allFailed) log(gh('error', `시세 조회가 모두 실패했어요(${codes.length}건). 네이버·Yahoo 응답이 바뀌었거나 막혔을 수 있어요.`));
  else if (failed.length) log(gh('warning', `시세 조회 ${failed.length}/${codes.length}건 실패: ${failed.map((f) => f.code).join(', ')}`));
  if (writeErrors) log(gh('error', `시세 쓰기 ${writeErrors}건 실패`));
  return { skipped: false, failed: allFailed || writeErrors > 0, allFailed, partialFailures: failed.length, updates: written };
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  syncOnce().then((r) => process.exit(r.failed ? 1 : 0)).catch((e) => {
    const msg = String(e?.message || '시세 동기화에 실패했습니다.');
    console.error(gh('error', /private_key|PRIVATE KEY/.test(msg) ? '서비스 계정 인증에 실패했습니다.' : msg.slice(0, 300)));
    process.exit(1);
  });
}
