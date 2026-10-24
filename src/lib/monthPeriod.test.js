import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { period, periodOf, periodRangeLabel, normalizeStartDay, daysInMonth } from './monthPeriod.js';

describe('월 시작일 기간', () => {
  test('1일이면 달력 달과 같다', () => {
    expect(period('2026-10', 1)).toMatchObject({ start: '2026-10-01', end: '2026-11-01', days: 31 });
    expect(period('2026-10')).toMatchObject({ start: '2026-10-01', end: '2026-11-01', days: 31 });
    expect(periodOf('2026-10-01', 1)).toBe('2026-10');
    expect(periodOf('2026-10-31', 1)).toBe('2026-10');
    expect(periodRangeLabel('2026-10', 1)).toBe('10.1 ~ 10.31');
  });

  test('17일은 그 날부터 다음 달 전날까지', () => {
    expect(period('2026-10', 17)).toMatchObject({ start: '2026-10-17', end: '2026-11-17', days: 31 });
    expect(periodRangeLabel('2026-10', 17)).toBe('10.17 ~ 11.16');
    expect(periodOf('2026-10-16', 17)).toBe('2026-09');
    expect(periodOf('2026-10-17', 17)).toBe('2026-10');
    expect(periodOf('2026-11-16', 17)).toBe('2026-10');
    expect(periodOf('2026-11-17', 17)).toBe('2026-11');
    expect(periodRangeLabel(periodOf('2026-10-16', 17), 17)).toBe('9.17 ~ 10.16');
  });

  test('29·30·31일은 그 달 말일로 맞춘다', () => {
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(period('2026-04', 31)).toMatchObject({ start: '2026-04-30', end: '2026-05-31' });
    expect(periodRangeLabel('2026-04', 31)).toBe('4.30 ~ 5.30');
    expect(period('2026-01', 30)).toMatchObject({ start: '2026-01-30', end: '2026-02-28' });
    expect(periodRangeLabel('2026-01', 30)).toBe('1.30 ~ 2.27');
    expect(period('2026-01', 31)).toMatchObject({ start: '2026-01-31', end: '2026-02-28' });
    expect(periodRangeLabel('2026-01', 31)).toBe('1.31 ~ 2.27');
    expect(periodOf('2026-02-27', 31)).toBe('2026-01');
    expect(periodOf('2026-02-28', 31)).toBe('2026-02');
  });

  test('윤년 2월은 29일, 평년 2월은 28일부터', () => {
    expect(period('2024-02', 29)).toMatchObject({ start: '2024-02-29', end: '2024-03-29' });
    expect(periodRangeLabel('2024-02', 29)).toBe('2.29 ~ 3.28');
    expect(period('2024-02', 31)).toMatchObject({ start: '2024-02-29', end: '2024-03-31' });
    expect(periodRangeLabel('2024-02', 31)).toBe('2.29 ~ 3.30');
    expect(periodOf('2024-02-28', 31)).toBe('2024-01');
    expect(periodOf('2024-02-29', 31)).toBe('2024-02');
    expect(periodOf('2024-03-30', 31)).toBe('2024-02');
    expect(periodOf('2024-03-31', 31)).toBe('2024-03');
    expect(period('2023-02', 29)).toMatchObject({ start: '2023-02-28', end: '2023-03-29' });
    expect(period('2023-02', 31)).toMatchObject({ start: '2023-02-28', end: '2023-03-31' });
    expect(periodRangeLabel('2023-02', 31)).toBe('2.28 ~ 3.30');
    expect(periodOf('2023-02-27', 31)).toBe('2023-01');
    expect(periodOf('2023-02-28', 31)).toBe('2023-02');
    expect(period('1900-02', 31)).toMatchObject({ start: '1900-02-28', end: '1900-03-31' });
    expect(period('2000-02', 31)).toMatchObject({ start: '2000-02-29', end: '2000-03-31' });
  });

  test('12월에서 1월로 넘어간다', () => {
    expect(period('2025-12', 17)).toMatchObject({ start: '2025-12-17', end: '2026-01-17', days: 31 });
    expect(periodRangeLabel('2025-12', 17)).toBe('12.17 ~ 1.16');
    expect(periodOf('2026-01-05', 17)).toBe('2025-12');
    expect(periodOf('2026-01-16', 17)).toBe('2025-12');
    expect(periodOf('2026-01-17', 17)).toBe('2026-01');
    expect(period('2026-12', 31)).toMatchObject({ start: '2026-12-31', end: '2027-01-31' });
    expect(periodRangeLabel('2026-12', 31)).toBe('12.31 ~ 1.30');
    expect(periodOf('2027-01-30', 31)).toBe('2026-12');
    expect(periodOf('2027-01-31', 31)).toBe('2027-01');
  });

  test('없거나 범위 밖이면 1일', () => {
    expect(normalizeStartDay(undefined)).toBe(1);
    expect(normalizeStartDay(null)).toBe(1);
    expect(normalizeStartDay(0)).toBe(1);
    expect(normalizeStartDay(32)).toBe(1);
    expect(normalizeStartDay(1.5)).toBe(1);
    expect(period('2026-10', 0)).toMatchObject({ start: '2026-10-01', end: '2026-11-01' });
    expect(period('2026-10', 32)).toMatchObject({ start: '2026-10-01', end: '2026-11-01' });
  });
});

describe('설정 타일', () => {
  test('1~31 숫자 타일이고 스크롤·드롭다운이 아니다', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const grid = css.match(/\.day-grid \{[^}]*\}/)[0];
    const tile = css.match(/\.day-tile \{[^}]*\}/)[0];
    expect(grid).toMatch(/grid-template-columns:\s*repeat\(6,\s*minmax\(44px,\s*1fr\)\)/);
    expect(grid).not.toMatch(/overflow/);
    expect(tile).toMatch(/min-height:\s*44px/);
    expect(tile).toMatch(/min-width:\s*44px/);
  });
});
