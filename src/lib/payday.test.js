import { describe, test, expect } from 'vitest';
import { nextPayday, paydayIn, paydayText, paydayChip } from './payday.js';

describe('다음 월급날 계산', () => {
  test('당일은 D-0', () => expect(nextPayday('2026-10-25', 25)).toEqual({ date: '2026-10-25', days: 0 }));
  test('월급날 다음 날은 다음 달 월급날까지', () => expect(nextPayday('2026-10-26', 25)).toEqual({ date: '2026-11-25', days: 30 }));
  test('말일: 31일 월급은 30일까지인 달에 30일', () => {
    expect(paydayIn(2026, 11, 31)).toBe('2026-11-30');
    expect(nextPayday('2026-11-01', 31)).toEqual({ date: '2026-11-30', days: 29 });
    expect(nextPayday('2026-11-30', 31).days).toBe(0);
    expect(nextPayday('2026-12-01', 31)).toEqual({ date: '2026-12-31', days: 30 });
  });
  test('2월: 평년 28일, 윤년 29일로 맞춤', () => {
    expect(nextPayday('2026-02-10', 30)).toEqual({ date: '2026-02-28', days: 18 });
    expect(nextPayday('2028-02-10', 30)).toEqual({ date: '2028-02-29', days: 19 });
    expect(nextPayday('2026-01-31', 30)).toEqual({ date: '2026-02-28', days: 28 });
  });
  test('연말: 12월 월급날이 지나면 다음 해 1월', () => {
    expect(nextPayday('2026-12-26', 25)).toEqual({ date: '2027-01-25', days: 30 });
    expect(nextPayday('2026-12-31', 10)).toEqual({ date: '2027-01-10', days: 10 });
  });
  test('1이거나 없거나 범위 밖이면 숨김(null)', () => {
    for (const d of [1, undefined, null, 0, 32, 2.5, '25']) expect(nextPayday('2026-10-01', d)).toBeNull();
    expect(paydayChip('2026-10-01', {})).toBeNull();
    expect(paydayChip('2026-10-01', { monthStartDay: 1 })).toBeNull();
    expect(paydayChip('2026-10-20', { monthStartDay: 25 })).toMatchObject({ days: 5, emoji: '🚚' });
  });
});
describe('문구 규칙', () => {
  test('구간별 문구와 이모지 하나', () => {
    expect(paydayText(0)).toEqual({ text: '오늘 월급날!', emoji: '🎉' });
    expect(paydayText(1).text).toBe('내일 월급날 D-1');
    expect(paydayText(2)).toEqual({ text: '조금만 버텨요 D-2', emoji: '🏃' });
    expect(paydayText(18)).toEqual({ text: 'D-18 · 아직 지갑은 무사', emoji: '👍' });
    for (let d = 0; d <= 31; d++) expect([...new Intl.Segmenter().segment(paydayText(d).emoji)].length).toBe(1);
  });
});
