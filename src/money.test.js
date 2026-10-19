import { test, expect } from 'vitest';
import { formatKRW } from './money.js';
test('원 단위 포맷', () => expect(formatKRW(1234567)).toBe('₩1,234,567'));
