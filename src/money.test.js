import { describe, test, expect } from 'vitest';
import { formatKRW, parseKRW, sumKRW } from './money.js';

describe('formatKRW', () => {
  test('콤마와 ₩', () => expect(formatKRW(1234567)).toBe('₩1,234,567'));
  test('0', () => expect(formatKRW(0)).toBe('₩0'));
  test('음수', () => expect(formatKRW(-5000)).toBe('-₩5,000'));
  test('소수는 버림', () => expect(formatKRW(999.9)).toBe('₩999'));
});
describe('parseKRW', () => {
  test('콤마/기호 제거', () => expect(parseKRW('₩1,234,567')).toBe(1234567));
  test('원 접미사/공백', () => expect(parseKRW(' 3 500원 ')).toBe(3500));
  test('음수', () => expect(parseKRW('-2,000')).toBe(-2000));
  test('소수점 이하 무시', () => expect(parseKRW('1,000.75')).toBe(1000));
  test('빈 값은 null', () => { expect(parseKRW('')).toBeNull(); expect(parseKRW('abc')).toBeNull(); expect(parseKRW(null)).toBeNull(); });
  test('숫자 입력', () => expect(parseKRW(42)).toBe(42));
});
describe('sumKRW', () => {
  test('정수 합계', () => expect(sumKRW([1000, 2500, -500])).toBe(3000));
  test('빈 배열 0', () => expect(sumKRW([])).toBe(0));
  test('비정수 거부', () => expect(() => sumKRW([100, 1.5])).toThrow(TypeError));
});
