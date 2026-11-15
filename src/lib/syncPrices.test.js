import { describe, expect, test } from 'vitest';
import { syncOnce, wantedCodes } from '../../tools/prices/sync-prices.mjs';

const json = (body) => new Response(JSON.stringify(body), { status: 200 });
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const naver = (code, close) => ({ itemCode: code, stockName: code, closePrice: close, localTradedAt: `${today}T15:30:00+09:00` });

function fakeDb(docs) {
  const writes = [];
  return {
    writes,
    collectionGroup: () => ({ get: async () => ({ forEach: (cb) => docs.forEach(([path, data]) => cb({ ref: { path }, data: () => data })) }) }),
    doc: (path) => ({ update: async (patch) => { writes.push({ path, patch }); } }),
  };
}

describe('시세 동기화 스크립트(가짜 DB·가짜 응답)', () => {
  const docs = [
    ['users/a/holdings/1', { kind: 'stock', code: '005930', lastPrice: 1, priceDate: '2026-01-01', qtyE4: 10000, avgPrice: 5 }],
    ['users/a/holdings/2', { kind: 'stock', code: '069500' }], // ETF를 주식으로 등록
    ['users/b/holdings/3', { kind: 'etf', code: '069500', lastPrice: 9, priceDate: '2999-01-01', priceSource: 'manual' }], // 더 새 직접 입력
    ['users/b/holdings/4', { kind: 'stock', code: 'AAPL' }],
    ['users/b/holdings/5', { kind: 'fund', code: '' }],
  ];
  test('조회할 코드는 국내 코드만 한 번씩', () => {
    expect(wantedCodes(docs.map(([, d]) => d))).toEqual({ codes: ['005930', '069500'], unsupported: 1 });
  });
  test('종가·기준일·출처만 쓰고, 더 새 직접 입력은 그대로', async () => {
    const db = fakeDb(docs);
    const fetchImpl = async (url) => json(url.includes('005930') ? naver('005930', '209,000') : naver('069500', '83,115'));
    const logs = [];
    const r = await syncOnce({ env: {}, db, fetchImpl, delayMs: 0, log: (m) => logs.push(m) });
    expect(r).toMatchObject({ failed: false, allFailed: false, updates: 2 });
    expect(db.writes).toEqual([
      { path: 'users/a/holdings/1', patch: { lastPrice: 209000, priceDate: today, priceSource: 'dataGoKr' } },
      { path: 'users/a/holdings/2', patch: { lastPrice: 83115, priceDate: today, priceSource: 'dataGoKr' } },
    ]);
    expect(logs.join('\n')).toContain('네이버 2');
  });
  test('일부 실패는 경고만, 모두 실패하면 실패로 끝남(조용히 성공하지 않음)', async () => {
    const some = await syncOnce({
      env: {}, db: fakeDb(docs), delayMs: 0, log: () => {},
      fetchImpl: async (url) => (url.includes('005930') && url.includes('m.stock') ? json(naver('005930', '209,000')) : new Response('', { status: 500 })),
    });
    expect(some).toMatchObject({ failed: false, partialFailures: 1, updates: 1 });
    const logs = [];
    const none = await syncOnce({ env: {}, db: fakeDb(docs), delayMs: 0, log: (m) => logs.push(m), fetchImpl: async () => new Response('', { status: 503 }) });
    expect(none).toMatchObject({ failed: true, allFailed: true, updates: 0 });
    expect(logs.join('\n')).toContain('모두 실패');
  });
  test('서비스 계정이 없으면 실패, PRICE_SYNC=off 면 조용히 건너뜀', async () => {
    expect(await syncOnce({ env: {}, log: () => {} })).toMatchObject({ failed: true, missing: ['FIREBASE_SERVICE_ACCOUNT'] });
    expect(await syncOnce({ env: { PRICE_SYNC: 'off' }, log: () => {} })).toMatchObject({ skipped: true, failed: false });
  });
});
