import { describe, test, expect } from 'vitest';
import { totals, byCategory, byDay, heatLevel, trend, moneyWeather, recordStreak, noSpendDays, topIncrease, filterPeriod } from './stats.js';
import { period, periodOf, daysLeftInclusive, shiftYm, monthLabel, isYmd } from './dates.js';
import { formatWon, signedWon, shortWon } from './money.js';

const tx = (date, amount, kind = 'expense', categoryId = 'food') => ({ date, amount, kind, categoryId });

describe('기간(월 시작일)', () => {
  test('1일 시작', () => expect(period('2026-10')).toMatchObject({ start: '2026-10-01', end: '2026-11-01', days: 31 }));
  test('25일 시작, 해 넘김', () => expect(period('2026-12', 25)).toMatchObject({ start: '2026-12-25', end: '2027-01-25', days: 31 }));
  test('날짜가 속한 기간', () => { expect(periodOf('2026-10-24', 25)).toBe('2026-09'); expect(periodOf('2026-10-25', 25)).toBe('2026-10'); expect(periodOf('2026-01-03', 25)).toBe('2025-12'); });
  test('남은 일수(오늘 포함)', () => { const p = period('2026-10'); expect(daysLeftInclusive(p, '2026-10-19')).toBe(13); expect(daysLeftInclusive(p, '2026-10-31')).toBe(1); expect(daysLeftInclusive(p, '2026-11-02')).toBe(0); });
  test('월 이동', () => { expect(shiftYm('2026-01', -1)).toBe('2025-12'); expect(shiftYm('2026-12', 1)).toBe('2027-01'); });
  test('월 이름', () => { expect(monthLabel('2026-10')).toBe('10월'); expect(monthLabel('2026-10', 25)).toBe('10월 (10.25 ~ 11.24)'); });
  test('날짜 형식 검사', () => { expect(isYmd('2026-02-29')).toBe(false); expect(isYmd('2026-10-19')).toBe(true); expect(isYmd('2026-1-1')).toBe(false); });
});

describe('집계', () => {
  const txs = [tx('2026-10-01', 12000), tx('2026-10-01', 3000, 'expense', 'cafe'), tx('2026-10-02', 3100000, 'income', 'salary'), tx('2026-10-05', 8000, 'expense', 'cafe'), tx('2026-09-30', 99999)];
  const p = period('2026-10');
  test('기간 필터', () => expect(filterPeriod(txs, p)).toHaveLength(4));
  test('합계와 남긴 돈', () => expect(totals(filterPeriod(txs, p))).toEqual({ expense: 23000, income: 3100000, saved: 3077000 }));
  test('카테고리별 순위·비율', () => {
    const r = byCategory(filterPeriod(txs, p));
    expect(r.map((x) => x.categoryId)).toEqual(['food', 'cafe']);
    expect(r[1].amount).toBe(11000);
    expect(r[0].share + r[1].share).toBeCloseTo(1);
  });
  test('날짜별', () => expect(byDay(txs)['2026-10-01']).toEqual({ expense: 15000, income: 0, count: 2, spent: true }));
  test('히트맵 4단계', () => { expect(heatLevel(0, 100)).toBe(0); expect(heatLevel(10, 100)).toBe(1); expect(heatLevel(60, 100)).toBe(3); expect(heatLevel(100, 100)).toBe(4); });
  test('월 추이', () => {
    const r = trend(txs, [period('2026-09'), period('2026-10')]);
    expect(r[0]).toMatchObject({ ym: '2026-09', expense: 99999, income: 0 });
    expect(r[1].saved).toBe(3077000);
  });
  test('빈 목록', () => { expect(totals([])).toEqual({ expense: 0, income: 0, saved: 0 }); expect(byCategory([])).toEqual([]); });
});

describe('돈 날씨', () => {
  const p = period('2026-10');
  const today = '2026-10-19'; // 남은 13일
  test('예산 없으면 안내', () => expect(moneyWeather({ budget: 0, periodTxs: [], p, today }).hasBudget).toBe(false));
  test('맑음: 하루 권장액과 오늘 남은 돈', () => {
    const w = moneyWeather({ budget: 1_300_000, periodTxs: [tx('2026-10-10', 650000), tx(today, 10000)], p, today });
    expect(w.base).toBe(50000); // (130만-65만)/13
    expect(w.available).toBe(40000);
    expect(w.weather.key).toBe('sunny');
    expect(w.usedPct).toBe(51);
  });
  test('흐림', () => expect(moneyWeather({ budget: 1_300_000, periodTxs: [tx('2026-10-10', 650000), tx(today, 40000)], p, today }).weather.key).toBe('cloudy'));
  test('비: 권장액 초과', () => expect(moneyWeather({ budget: 1_300_000, periodTxs: [tx('2026-10-10', 650000), tx(today, 60000)], p, today }).weather.key).toBe('rainy'));
  test('비: 예산 초과, 쓸 돈 0', () => {
    const w = moneyWeather({ budget: 100000, periodTxs: [tx('2026-10-01', 200000)], p, today });
    expect(w.available).toBe(0); expect(w.remaining).toBe(-100000); expect(w.weather.key).toBe('rainy');
  });
  test('수입은 예산 계산에서 제외', () => expect(moneyWeather({ budget: 130000, periodTxs: [tx(today, 999999, 'income')], p, today }).base).toBe(10000));
});

describe('기록 습관', () => {
  test('연속 기록', () => { expect(recordStreak(['2026-10-19', '2026-10-18', '2026-10-17', '2026-10-15'], '2026-10-19')).toBe(3); expect(recordStreak(['2026-10-18'], '2026-10-19')).toBe(1); expect(recordStreak([], '2026-10-19')).toBe(0); });
  test('무지출 날 수(오늘 제외)', () => expect(noSpendDays([tx('2026-10-01', 1), tx('2026-10-03', 1, 'income')], period('2026-10'), '2026-10-04')).toBe(2));
  test('지난달 대비 증가', () => {
    expect(topIncrease([tx('2026-10-01', 23600, 'expense', 'cafe'), tx('2026-10-01', 5000)], [tx('2026-09-01', 20000, 'expense', 'cafe'), tx('2026-09-02', 9000)])).toEqual({ categoryId: 'cafe', pct: 18, diff: 3600 });
    expect(topIncrease([tx('2026-10-01', 100)], [])).toBeNull();
  });
});

describe('금액 표기', () => {
  test('원 표기', () => { expect(formatWon(12300)).toBe('12,300원'); expect(formatWon(-500)).toBe('−500원'); });
  test('부호', () => { expect(signedWon(12000, 'expense')).toBe('−12,000원'); expect(signedWon(3000, 'income')).toBe('+3,000원'); });
  test('짧은 표기', () => { expect(shortWon(9800)).toBe('9,800'); expect(shortWon(12300)).toBe('1.2만'); expect(shortWon(1240000)).toBe('124만'); expect(shortWon(250000000)).toBe('2.5억'); });
});
import { compactWon } from './money.js';
test('좁은 칸 금액', () => { expect(compactWon(98000)).toBe('98,000원'); expect(compactWon(1087000)).toBe('109만원'); expect(compactWon(254300)).toBe('25.4만원'); expect(compactWon(-3220000)).toBe('−322만원'); expect(compactWon(250000000)).toBe('2.5억원'); });
