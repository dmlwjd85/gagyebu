import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  applyPricePlan, buildQuoteUrl, isUserHoldingPath, latestQuotes, parseQuotePayload, parseServiceAccount,
  planPriceUpdates, pricePatch, shouldFallback, syncConfig, kstYmd,
} from './marketPrice.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

describe('시세 응답 파싱', () => {
  test('주식: 최신 종가만, 다른 코드·과거 종가·등락은 쓰지 않음', () => {
    const parsed = parseQuotePayload(load('stock-price'));
    expect(parsed.ok).toBe(true);
    const latest = latestQuotes(parsed.quotes.map((q) => ({ ...q, kind: 'stock' })));
    const samsung = latest.find((q) => q.code === '005930');
    expect(samsung).toMatchObject({ date: '2026-10-16', close: 71500, kind: 'stock' });
    expect(latest.find((q) => q.code === '90059301')?.close).toBe(1);
    expect(JSON.stringify(samsung)).not.toContain('fltRt');
  });
  test('ETF는 종가(clpr)만 쓰고 순자산가치(nav)는 무시. 항목이 객체 하나여도 읽음', () => {
    const parsed = parseQuotePayload(load('etf-price'));
    expect(parsed.quotes).toEqual([{ code: '069500', date: '2026-10-16', close: 45210, name: 'KODEX 200' }]);
  });
  test('빈 결과·오류 코드·nav만 있는 행·소수 종가', () => {
    expect(parseQuotePayload(load('quote-empty'))).toEqual({ ok: true, quotes: [] });
    const err = parseQuotePayload(load('quote-error'));
    expect(err.ok).toBe(false);
    expect(err.error).toBe('12');
    expect(shouldFallback({ httpStatus: 200, parsed: err })).toBe(true);
    expect(shouldFallback({ httpStatus: 404, parsed: { ok: false, error: 'bad-payload' } })).toBe(true);
    expect(parseQuotePayload({ response: { header: { resultCode: '00' }, body: { items: { item: { basDt: '20261016', srtnCd: '069500', nav: '100', clpr: '12.5' } } } } }).quotes).toEqual([]);
    expect(parseQuotePayload('<xml></xml>').ok).toBe(false);
  });
});

describe('갱신 계획', () => {
  const quote = { kind: 'stock', code: '005930', date: '2026-10-16', close: 71500 };
  const holding = { path: 'users/alice/holdings/h1', kind: 'stock', code: 'A005930', lastPrice: 70000, priceDate: '2026-10-15' };
  test('종가와 기준일만 넣고, 같으면 건너뛰며, 펀드·예금·오래된 시세는 유지', () => {
    const plan = planPriceUpdates([
      holding,
      { path: 'users/alice/holdings/h2', kind: 'etf', code: '069500', lastPrice: 1, priceDate: '2026-10-01' },
      { path: 'users/alice/holdings/h3', kind: 'fund', code: '005930', lastPrice: 1, priceDate: '2026-01-01' },
      { path: 'users/alice/holdings/h4', kind: 'deposit', code: '', lastPrice: 10, priceDate: '2026-10-16' },
      { path: 'users/alice/holdings/h5', kind: 'stock', code: '005930', lastPrice: 71500, priceDate: '2026-10-16' },
      { path: 'users/alice/holdings/h6', kind: 'stock', code: '005930', lastPrice: 80000, priceDate: '2026-10-17' },
    ], [quote, { kind: 'etf', code: '069500', date: '2026-10-16', close: 45210 }]);
    expect(plan.updates.map((u) => u.path)).toEqual(['users/alice/holdings/h1', 'users/alice/holdings/h2']);
    expect(pricePatch(plan.updates[0])).toEqual({ lastPrice: 71500, priceDate: '2026-10-16', priceSource: 'dataGoKr' });
    expect(Object.keys(pricePatch(plan.updates[0])).sort()).toEqual(['lastPrice', 'priceDate', 'priceSource']);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['manual-kind', 'manual-kind', 'unchanged', 'older-than-saved']);
    expect(JSON.stringify(plan)).not.toMatch(/delete|qtyE4|avgPrice/);
  });
  test('다시 돌려도 쓰기가 없고, 사용자 보유 경로가 아니면 쓰지 않음', async () => {
    const writes = [];
    const first = await applyPricePlan({
      holdings: [holding, { path: 'public/prices/x', kind: 'stock', code: '005930' }],
      quotes: [quote],
      writePrice: async (path, patch) => writes.push({ path, patch }),
    });
    expect(first.writes).toHaveLength(1);
    expect(isUserHoldingPath('users/alice/holdings/h1')).toBe(true);
    expect(isUserHoldingPath('public/prices/x')).toBe(false);
    expect(isUserHoldingPath('users/alice/assetAccounts/a')).toBe(false);
    const again = await applyPricePlan({
      holdings: [{ ...holding, lastPrice: 71500, priceDate: '2026-10-16' }],
      quotes: [quote],
      writePrice: async () => { throw new Error('쓰면 안 됨'); },
    });
    expect(again.writes).toEqual([]);
    expect(writes[0].patch).toEqual({ lastPrice: 71500, priceDate: '2026-10-16', priceSource: 'dataGoKr' });
  });
});

describe('시크릿·주소', () => {
  test('시크릿이 없으면 켜지지 않음', () => {
    expect(syncConfig({}).missing).toEqual(['DATA_GO_KR_KEY', 'FIREBASE_SERVICE_ACCOUNT']);
    expect(syncConfig({ DATA_GO_KR_KEY: 'k', FIREBASE_SERVICE_ACCOUNT: '{}' }).ok).toBe(true);
  });
  test('서비스 계정 JSON·base64, 키 원문은 오류에 없음', () => {
    const json = JSON.stringify({ project_id: 'p', client_email: 'a@b.c', private_key: 'secret-key' });
    expect(parseServiceAccount(json).project_id).toBe('p');
    expect(parseServiceAccount(Buffer.from(json).toString('base64')).client_email).toBe('a@b.c');
    expect(() => parseServiceAccount('nope')).toThrow(/JSON/);
    try { parseServiceAccount('nope-secret-value'); } catch (e) { expect(e.message).not.toContain('nope-secret-value'); }
  });
  test('호출 주소는 종목 코드 조회이고 키를 경로에 넣지 않음', () => {
    const url = buildQuoteUrl({ kind: 'stock', serviceKey: 'abc+/=', code: '005930', begin: '2026-10-06', end: '2026-10-21' });
    expect(url.startsWith('https://apis.data.go.kr/1160100/GetStockSecuritiesInfoService_V2/getStockPriceInfo_V2?')).toBe(true);
    expect(url).toContain('resultType=json');
    expect(url).toContain('likeSrtnCd=005930');
    expect(url).toContain('beginBasDt=20261006');
    expect(url).toContain('endBasDt=20261021');
    expect(url).toContain(`serviceKey=${encodeURIComponent('abc+/=')}`);
    expect(url).not.toContain('nav=');
    const encoded = buildQuoteUrl({ kind: 'etf', index: 1, serviceKey: 'abc%2B', code: '069500', begin: '2026-10-01', end: '2026-10-02' });
    expect(encoded).toContain('serviceKey=abc%2B&');
    expect(encoded).toContain('/service/GetSecuritiesProductInfoService/getETFPriceInfo');
  });
  test('한국 날짜', () => {
    expect(kstYmd(new Date('2026-10-19T15:30:00Z'))).toBe('2026-10-20');
    expect(kstYmd(new Date('2026-10-19T14:00:00Z'))).toBe('2026-10-19');
  });
});
