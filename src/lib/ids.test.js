import { describe, test, expect } from 'vitest';
import { looksLikeCard, isRuleId, safeRef, fixedRecId } from './ids.js';
import { recTxId } from './recurring.js';
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS } from './defaults.js';

describe('R5 문서 id 형식(규칙과 같은 기준)', () => {
  test('숫자 13개 이상(영문·밑줄 사이)이면 카드번호 모양', () => {
    for (const v of ['q1w2e3r4t5y6u7i8o9p0a1s2d3', '1234567890123', '1234_5678_9012_3456', '1234a5678b9012c3456']) {
      expect(looksLikeCard(v)).toBe(true);
      expect(isRuleId(v)).toBe(false);
    }
  });
  test('앱이 쓰는 id는 통과', () => {
    for (const v of ['food', 'etc-in', 'Xk3J9aZ0qLm2nB7cD4eF', 'r31', 'rent_home', 'n1234567890', ...DEFAULT_CATEGORIES.map((c) => c.id), ...DEFAULT_ACCOUNTS.map((a) => a.id)]) expect(isRuleId(v)).toBe(true);
  });
  test('자동 id가 카드번호 모양이면 다시 뽑음', () => {
    const seq = ['12a34b56c78d90e12f34', '1234567890123456', 'Xk3J9aZ0qLm2nB7cD4eF'];
    let i = 0;
    const ref = safeRef(() => ({ id: seq[i++] }));
    expect(ref.id).toBe('Xk3J9aZ0qLm2nB7cD4eF');
    expect(i).toBe(3);
  });
  test('바로 맞는 id면 한 번만 뽑음', () => {
    let n = 0; safeRef(() => (n++, { id: 'abc' })); expect(n).toBe(1);
  });
  test('예전 반복 id 옮기기: 늘 같은 결과, 영문 20자, rec- 거래 id도 규칙 형식', () => {
    const a = fixedRecId('q1w2e3r4t5y6u7i8o9p0a1s2d3');
    expect(a).toBe(fixedRecId('q1w2e3r4t5y6u7i8o9p0a1s2d3'));
    expect(a).toMatch(/^rx[A-Za-z]{18}$/);
    expect(isRuleId(a)).toBe(true);
    expect(fixedRecId('1234567890123')).not.toBe(a);
    expect(recTxId(a, '2026-11')).toMatch(/^rec-rx[A-Za-z]{18}-2026-11$/);
  });
});
