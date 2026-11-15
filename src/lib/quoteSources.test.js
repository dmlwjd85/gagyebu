import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  fetchKrQuote, isFresh, isKrCode, naverDayUrl, naverUrl, parseNaverBasic, parseNaverDay, parseYahooChart, yahooUrl,
} from './quoteSources.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const TODAY = '2026-11-15';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** 주소별 가짜 응답. 부른 주소를 기록한다. */
function mockFetch(routes) {
  const calls = [];
  const f = async (url) => {
    calls.push(url);
    for (const [part, res] of routes) if (url.includes(part)) return typeof res === 'function' ? res() : res.clone();
    return new Response('not found', { status: 404 });
  };
  f.calls = calls;
  return f;
}

describe('응답 파싱', () => {
  test('네이버 현재가: 쉼표 종가·한국 날짜·이름, 코드가 다르면 버림', () => {
    expect(parseNaverBasic(load('naver-basic-etf'), '069500')).toEqual({ code: '069500', date: '2026-11-13', close: 83115, name: 'KODEX 200' });
    expect(parseNaverBasic(load('naver-basic-etf'), '005930')).toBeNull();
    expect(parseNaverBasic({ itemCode: '005930', closePrice: '-', localTradedAt: '2026-11-13T15:30:00+09:00' }, '005930')).toBeNull();
    expect(parseNaverBasic({ itemCode: '005930', closePrice: '209,000', localTradedAt: 'x' }, '005930')).toBeNull();
    expect(parseNaverBasic('<html>', '005930')).toBeNull();
    // 자정 직전 UTC 시각도 한국 날짜로
    expect(parseNaverBasic({ itemCode: '005930', closePrice: '1,000', localTradedAt: '2026-11-12T16:00:00Z' }, '005930').date).toBe('2026-11-13');
  });
  test('네이버 일봉: 가장 최근 날짜 종가', () => {
    expect(parseNaverDay(load('naver-day-stock'), '005930')).toEqual({ code: '005930', date: '2026-11-13', close: 209000, name: '' });
    expect(parseNaverDay([], '005930')).toBeNull();
    expect(parseNaverDay({ error: 1 }, '005930')).toBeNull();
  });
  test('Yahoo: 마지막 유효 종가(빈 값 건너뜀), 원화·같은 코드만, 시장 접미사가 맞을 때만', () => {
    const y = load('yahoo-chart-kq');
    expect(parseYahooChart(y, '247540')).toEqual({ code: '247540', date: '2026-11-13', close: 90800, name: 'ECOPROBM' });
    const withNull = structuredClone(y);
    withNull.chart.result[0].indicators.quote[0].close.push(null);
    withNull.chart.result[0].timestamp.push(1794700000);
    expect(parseYahooChart(withNull, '247540').date).toBe('2026-11-13');
    expect(parseYahooChart(y, '005930')).toBeNull();
    const usd = structuredClone(y); usd.chart.result[0].meta.currency = 'USD';
    expect(parseYahooChart(usd, '247540')).toBeNull();
    const wrongMarket = structuredClone(y); wrongMarket.chart.result[0].meta.symbol = '247540.KS';
    expect(parseYahooChart(wrongMarket, '247540')).toBeNull();
    expect(parseYahooChart({ chart: { result: null, error: { code: 'Not Found' } } }, '247540')).toBeNull();
  });
  test('국내 코드·신선도·주소', () => {
    expect(isKrCode('005930')).toBe(true);
    expect(isKrCode('A005930')).toBe(true);
    expect(isKrCode('0080G0')).toBe(true);
    expect(isKrCode('AAPL')).toBe(false);
    expect(isKrCode('')).toBe(false);
    expect(isFresh('2026-11-13', TODAY)).toBe(true);
    expect(isFresh('2026-11-01', TODAY)).toBe(false);
    expect(isFresh('2026-11-17', TODAY)).toBe(false);
    expect(naverUrl('A005930')).toBe('https://m.stock.naver.com/api/stock/005930/basic');
    expect(naverDayUrl('005930', '2026-11-01', '2026-11-15')).toContain('/005930/day?startDateTime=202611010000&endDateTime=202611152359');
    expect(yahooUrl('005930.KS')).toContain('/v8/finance/chart/005930.KS?');
  });
});

describe('받아오기와 대체 출처', () => {
  test('네이버가 되면 네이버만 부름(ETF를 같은 주소로)', async () => {
    const f = mockFetch([['m.stock.naver.com/api/stock/069500', json(load('naver-basic-etf'))]]);
    const r = await fetchKrQuote('069500', { fetchImpl: f, today: TODAY });
    expect(r.quote).toMatchObject({ close: 83115, date: '2026-11-13', source: 'naver' });
    expect(f.calls).toHaveLength(1);
  });
  test('네이버 현재가가 깨지면 네이버 일봉', async () => {
    const f = mockFetch([['m.stock.naver.com', json({ changed: true })], ['api.stock.naver.com', json(load('naver-day-stock'))]]);
    const r = await fetchKrQuote('005930', { fetchImpl: f, today: TODAY });
    expect(r.quote).toMatchObject({ close: 209000, source: 'naver' });
    expect(r.errors).toEqual(['naver:bad-payload']);
  });
  test('네이버가 모두 안 되면 Yahoo .KS 실패 후 .KQ', async () => {
    const f = mockFetch([
      ['naver.com', () => { throw new TypeError('fetch failed'); }],
      ['247540.KS', json({ chart: { result: null, error: { code: 'Not Found' } } }, 404)],
      ['247540.KQ', json(load('yahoo-chart-kq'))],
    ]);
    const r = await fetchKrQuote('247540', { fetchImpl: f, today: TODAY });
    expect(r.quote).toMatchObject({ close: 90800, date: '2026-11-13', source: 'yahoo' });
    expect(r.errors).toEqual(['naver:network', 'naver-day:network', 'yahoo-247540.KS:http-404']);
  });
  test('오래된 시세(상장폐지 등)는 쓰지 않음', async () => {
    const f = mockFetch([['m.stock.naver.com', json({ itemCode: '005930', closePrice: '50,000', localTradedAt: '2024-07-19T15:30:00+09:00' })]]);
    const r = await fetchKrQuote('005930', { fetchImpl: f, today: TODAY });
    expect(r.quote).toBeNull();
    expect(r.errors[0]).toBe('naver:stale-2024-07-19');
  });
  test('시간 초과·모두 실패해도 던지지 않음, 해외 코드는 부르지 않음', async () => {
    const f = mockFetch([['', () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; }]]);
    const r = await fetchKrQuote('005930', { fetchImpl: f, today: TODAY });
    expect(r.quote).toBeNull();
    expect(r.errors).toEqual(['naver:timeout', 'naver-day:timeout', 'yahoo-005930.KS:timeout', 'yahoo-005930.KQ:timeout']);
    const g = mockFetch([]);
    expect((await fetchKrQuote('AAPL', { fetchImpl: g, today: TODAY })).errors).toEqual(['unsupported-code']);
    expect(g.calls).toHaveLength(0);
  });
});
