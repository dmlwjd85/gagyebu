import { describe, expect, test } from 'vitest';
import { buildBackup } from './backup.js';
import {
  contributed, formatPct, formatQty, isaReminder, mulQtyPrice, normalizeCode, parseQtyE4, parseRateBp,
  returnPct, summarizeAll, taxCredit, taxPrefs, validateAssetAccount, validateHolding, DEFAULT_TAX,
} from './assets.js';
import { assetsView, taxView } from '../ui/assetsView.js';

const y = '2026';
const acc = (id, type, extra = {}) => ({ id, type, institution: '기관', name: id, opened: '2020-01-01', ...extra });

describe('수량·금액', () => {
  test('코드 정규화와 수량 소수 넷째 자리', () => {
    expect(normalizeCode('a005930')).toBe('005930');
    expect(normalizeCode('5930')).toBe('005930');
    expect(normalizeCode('069500')).toBe('069500');
    expect(parseQtyE4('10')).toBe(100000);
    expect(parseQtyE4('120.5')).toBe(1_205_000);
    expect(parseQtyE4('1,234.5678')).toBe(12_345_678);
    expect(parseQtyE4('1.23456')).toBeNull();
    expect(parseQtyE4('-1')).toBeNull();
    expect(formatQty(1_205_000)).toBe('120.5');
  });
  test('수량×가격은 원 단위 반올림', () => {
    expect(mulQtyPrice(100_000, 70000)).toBe(700_000);
    expect(mulQtyPrice(1_205_000, 11050)).toBe(1_331_525);
    expect(mulQtyPrice(1, 1)).toBe(0);
    expect(mulQtyPrice(150_000, 45210)).toBe(678_150);
  });
  test('수익률은 소수 한 자리, 원금 0은 비움', () => {
    expect(returnPct(700_000, 715_000)).toBe(2.1);
    expect(returnPct(6_809_100, 7_298_675)).toBe(7.2);
    expect(returnPct(0, 100)).toBeNull();
    expect(formatPct(-3.5)).toBe('−3.5%');
    expect(formatPct(0)).toBe('0.0%');
  });
});

describe('세액공제', () => {
  const accounts = [
    acc('pension', 'pension'), acc('irp', 'irp'), acc('dc', 'dc'),
    acc('stock', 'stock'), acc('isa', 'isa', { maturity: '2026-11-20' }),
  ];
  const contributions = [
    ...Array.from({ length: 10 }, (_, i) => ({ assetAccountId: 'pension', date: `2026-${String(i + 1).padStart(2, '0')}-25`, amount: 500_000, deductible: true })),
    { assetAccountId: 'pension', date: '2026-01-10', amount: 1_000_000, deductible: true },
    { assetAccountId: 'irp', date: '2026-03-02', amount: 3_000_000, deductible: true },
    { assetAccountId: 'dc', date: '2026-06-15', amount: 500_000, deductible: true },
    { assetAccountId: 'stock', date: '2026-04-01', amount: 200_000, deductible: false },
    { assetAccountId: 'isa', date: '2026-05-01', amount: 9_000_000, deductible: true },
    { assetAccountId: 'pension', date: '2025-12-31', amount: 9_000_000, deductible: true },
    { assetAccountId: 'pension', date: '2026-08-01', amount: 100_000, deductible: false },
  ];
  test('기본 한도 600만·합산 900만, 16.5%면 환급 1,485,000원', () => {
    const t = taxCredit({ accounts, contributions, year: y });
    expect(t.pensionPaid).toBe(6_000_000);
    expect(t.extraPaid).toBe(3_500_000);
    expect(t.pensionBase).toBe(6_000_000);
    expect(t.extraBase).toBe(3_000_000);
    expect(t.base).toBe(9_000_000);
    expect(t.refund).toBe(1_485_000);
    expect(taxPrefs(null)).toMatchObject(DEFAULT_TAX);
  });
  test('13.2%와 한도를 넘긴 연금저축, 합산 한도가 더 작은 경우', () => {
    const low = taxCredit({
      accounts, contributions: [{ assetAccountId: 'pension', date: '2026-01-01', amount: 6_000_000, deductible: true }],
      prefs: { ...DEFAULT_TAX, rateChoice: 'low' }, year: y,
    });
    expect(low.refund).toBe(792_000);
    const over = taxCredit({
      accounts, contributions: [{ assetAccountId: 'pension', date: '2026-01-01', amount: 9_000_000, deductible: true }],
      prefs: { pensionLimit: 9_000_000, combinedLimit: 6_000_000, rateHigh: 1650, rateLow: 1320, rateChoice: 'high' }, year: y,
    });
    expect(over.base).toBe(6_000_000);
    expect(over.refund).toBe(990_000);
  });
  test('세율 입력', () => {
    expect(parseRateBp('16.5')).toBe(1650);
    expect(parseRateBp('13.2%')).toBe(1320);
    expect(parseRateBp('16.55')).toBeNull();
    expect(contributed('pension', contributions, y, { deductible: true })).toBe(6_000_000);
  });
});

describe('ISA 이전 알림', () => {
  const isa = acc('isa', 'isa', { maturity: '2026-11-20' });
  test('만기 60일 전후만', () => {
    expect(isaReminder(isa, '2026-10-20')?.tone).toBe('soon');
    expect(isaReminder(isa, '2026-10-20')?.untilMaturity).toBe(31);
    expect(isaReminder(isa, '2026-08-01')).toBeNull();
    expect(isaReminder({ ...isa, maturity: '2026-10-20' }, '2026-10-20')?.tone).toBe('today');
    expect(isaReminder({ ...isa, maturity: '2026-09-01' }, '2026-10-20')?.tone).toBe('window');
    expect(isaReminder({ ...isa, maturity: '2026-08-01' }, '2026-10-20')).toBeNull();
    expect(isaReminder(acc('stock', 'stock'), '2026-10-20')).toBeNull();
  });
});

describe('검증', () => {
  test('계좌번호·ISA 만기·주식 코드', () => {
    expect(validateAssetAccount({ type: 'stock', institution: '삼성증권', name: '직장', opened: '2022-03-02' })).toBeNull();
    expect(validateAssetAccount({ type: 'stock', institution: '1101234567890', name: '직장', opened: '2022-03-02' })).toMatch(/계좌번호/);
    expect(validateAssetAccount({ type: 'isa', institution: '키움', name: 'ISA', opened: '2023-11-01' })).toMatch(/만기/);
    expect(validateHolding({ kind: 'stock', name: '삼성전자', code: '5930', qty: '10', avgPrice: 70000, lastPrice: 71500, priceDate: '2026-10-16' })).toBeNull();
    expect(validateHolding({ kind: 'fund', name: 'TDF', code: '', qty: '80', avgPrice: 10000, lastPrice: 0, priceDate: '' })).toBeNull();
    expect(validateHolding({ kind: 'etf', name: 'KODEX', code: '', qty: '1', avgPrice: 1, lastPrice: 0, priceDate: '' })).toMatch(/코드/);
  });
});

describe('화면 문구', () => {
  const accounts = [acc('stock', 'stock', { institution: '삼성증권', name: '직장인 주식' }), acc('isa', 'isa', { institution: '키움', name: '중개형 ISA', maturity: '2026-11-20' })];
  const holdings = [
    { id: 'h1', assetAccountId: 'stock', code: '005930', name: '삼성전자', kind: 'stock', qtyE4: 100_000, avgPrice: 70_000, lastPrice: 71_500, priceDate: '2026-10-16', priceSource: 'dataGoKr' },
    { id: 'h2', assetAccountId: 'stock', code: '', name: '배당펀드', kind: 'fund', qtyE4: 100_000, avgPrice: 1000, lastPrice: 1100, priceDate: '2026-10-01', priceSource: 'manual' },
  ];
  const m = { today: '2026-10-20', assetAccounts: accounts, holdings, contributions: [], assetPrefs: null };
  test('시세 기준일을 항상 보여주고 만기 알림이 있다', () => {
    const html = assetsView(m, { assetOpen: 'stock' });
    expect(html).toContain('시세 기준일 2026-10-16');
    expect(html).toContain('가장 오래된 종목 2026-10-01');
    expect(html).toContain('시세 기준일 2026-10-16');
    expect(html).toContain('시세 기준일 2026-10-01');
    expect(html).toContain('만기까지 31일');
    expect(html).toContain('공공누리');
    expect(html).not.toContain('undefined');
  });
  test('세액공제 화면에 한도·환급·세율이 있다', () => {
    const html = taxView({
      ...m,
      assetAccounts: [acc('pension', 'pension', { name: '연금' })],
      contributions: [{ id: 'c1', assetAccountId: 'pension', date: '2026-03-01', amount: 1_000_000, deductible: true }],
    }, {});
    expect(html).toContain('예상 환급');
    expect(html).toContain('165,000원');
    expect(html).toContain('16.5%');
    expect(html).toContain('13.2%');
    expect(html).toContain('6,000,000원');
    expect(html).toContain('한도·세율 고치기');
  });
});

describe('백업에 자산이 들어간다', () => {
  test('없는 값은 빈 목록, 서버 시각은 뺌', () => {
    const b = buildBackup({ transactions: [{ id: 't', amount: 1, createdAt: 'x' }] }, new Date('2026-10-20T00:00:00Z'));
    expect(b.version).toBe(4);
    expect(b.settings).toBeNull();
    expect(b.assetAccounts).toEqual([]);
    expect(b.holdings).toEqual([]);
    expect(b.contributions).toEqual([]);
    expect(b.assetPrefs).toBeNull();
    expect(b.transactions[0].amount).toBe(1);
  });
  test('계좌·보유·납입·세액 설정을 담고 시각은 뺌', () => {
    const b = buildBackup({
      assetAccounts: [{ id: 'a', name: '연금', createdAt: 'x', updatedAt: 'y' }],
      holdings: [{ id: 'h', code: '005930', lastPrice: 1, priceDate: '2026-10-16' }],
      contributions: [{ id: 'c', amount: 10, deductible: true }],
      assetPrefs: { pensionLimit: 1, updatedAt: 'z' },
    }, new Date('2026-10-20T00:00:00Z'));
    expect(b.assetAccounts[0]).toEqual({ id: 'a', name: '연금' });
    expect(b.holdings[0].priceDate).toBe('2026-10-16');
    expect(b.assetPrefs).toEqual({ pensionLimit: 1 });
    expect(JSON.stringify(b)).not.toMatch(/createdAt|updatedAt/);
  });
  test('예시 포트폴리오 합계', () => {
    const accounts = [
      acc('stock', 'stock'), acc('pension', 'pension'), acc('irp', 'irp'), acc('isa', 'isa'),
      acc('civil', 'civil', { expectedPension: 2_150_000 }),
    ];
    const holdings = [
      { assetAccountId: 'stock', qtyE4: 100_000, avgPrice: 70_000, lastPrice: 71_500, priceDate: '2026-10-16' },
      { assetAccountId: 'stock', qtyE4: 150_000, avgPrice: 42_000, lastPrice: 45_210, priceDate: '2026-10-16' },
      { assetAccountId: 'stock', qtyE4: 1_205_000, avgPrice: 10_200, lastPrice: 11_050, priceDate: '2026-10-01' },
      { assetAccountId: 'pension', qtyE4: 800_000, avgPrice: 10_000, lastPrice: 12_100, priceDate: '2026-10-10' },
      { assetAccountId: 'irp', qtyE4: 10_000, avgPrice: 3_000_000, lastPrice: 3_120_000, priceDate: '2026-10-16' },
      { assetAccountId: 'isa', qtyE4: 300_000, avgPrice: 15_000, lastPrice: 16_200, priceDate: '2026-10-16' },
    ];
    const all = summarizeAll(accounts, holdings);
    expect(all.valuation).toBe(7_298_675);
    expect(all.invested).toBe(6_809_100);
    expect(all.returnPct).toBe(7.2);
    expect(all.civilMonthly).toBe(2_150_000);
  });
});
