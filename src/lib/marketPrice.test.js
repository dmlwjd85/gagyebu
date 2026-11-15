import { describe, expect, test } from 'vitest';
import {
  applyPricePlan, isUserHoldingPath, parseServiceAccount, planPriceUpdates, pricePatch, syncConfig, kstYmd,
} from './marketPrice.js';

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
  test('ETF를 주식으로 등록해도 코드로 찾아 갱신, 같은 코드면 최신 날짜 종가', () => {
    const plan = planPriceUpdates(
      [{ path: 'users/a/holdings/x', kind: 'stock', code: '069500', lastPrice: 1, priceDate: '2026-10-01' }],
      [{ kind: 'any', code: '069500', date: '2026-10-15', close: 45000 }, { kind: 'any', code: '069500', date: '2026-10-16', close: 45210 }],
    );
    expect(plan.updates).toEqual([{ path: 'users/a/holdings/x', lastPrice: 45210, priceDate: '2026-10-16', priceSource: 'dataGoKr' }]);
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
  test('시세 키는 필요 없고 서비스 계정만 필요, PRICE_SYNC=off 면 꺼짐', () => {
    expect(syncConfig({}).missing).toEqual(['FIREBASE_SERVICE_ACCOUNT']);
    expect(syncConfig({ FIREBASE_SERVICE_ACCOUNT: '{}' }).ok).toBe(true);
    expect(syncConfig({ FIREBASE_SERVICE_ACCOUNT: '{}', PRICE_SYNC: 'OFF' })).toMatchObject({ ok: false, off: true });
    expect(syncConfig({ FIREBASE_SERVICE_ACCOUNT: '{}', PRICE_SYNC: '' }).ok).toBe(true);
  });
  test('서비스 계정 JSON·base64, 키 원문은 오류에 없음', () => {
    const json = JSON.stringify({ project_id: 'p', client_email: 'a@b.c', private_key: 'secret-key' });
    expect(parseServiceAccount(json).project_id).toBe('p');
    expect(parseServiceAccount(Buffer.from(json).toString('base64')).client_email).toBe('a@b.c');
    expect(() => parseServiceAccount('nope')).toThrow(/JSON/);
    try { parseServiceAccount('nope-secret-value'); } catch (e) { expect(e.message).not.toContain('nope-secret-value'); }
  });
  test('한국 날짜', () => {
    expect(kstYmd(new Date('2026-10-19T15:30:00Z'))).toBe('2026-10-20');
    expect(kstYmd(new Date('2026-10-19T14:00:00Z'))).toBe('2026-10-19');
  });
});
