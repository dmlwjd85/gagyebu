import { describe, it, expect } from 'vitest';
import { evaluate, calcWon, roundWon, press, pressAll, tokenize, formatExpr, exprFromWon, exprFromText, speakExpr, normalizeOp, MAX_RESULT, MAX_INT_DIGITS, MAX_EXPR } from './calc.js';

const won = (e) => calcWon(e);
describe('계산기: 연산 우선순위(괄호 없이)', () => {
  it('곱셈·나눗셈 먼저', () => {
    expect(won('2+3×4')).toEqual({ ok: true, won: 14 });
    expect(won('10−6÷2')).toEqual({ ok: true, won: 7 });
    expect(won('100÷4×2')).toEqual({ ok: true, won: 50 });
    expect(won('2×3+4×5−6÷3')).toEqual({ ok: true, won: 24 });
    expect(won('12,000+3,500×2')).toEqual({ ok: true, won: 19000 });
  });
  it('왼쪽부터: 빼기·나누기가 이어져도', () => {
    expect(won('100−20−30')).toEqual({ ok: true, won: 50 });
    expect(won('1000÷10÷10')).toEqual({ ok: true, won: 10 });
  });
  it('키보드 연산자(- * / x)도 같음', () => {
    expect(won('2+3*4')).toEqual({ ok: true, won: 14 });
    expect(won('9/3-1')).toEqual({ ok: true, won: 2 });
    expect(won('7x6')).toEqual({ ok: true, won: 42 });
  });
});

describe('계산기: 원 단위 반올림', () => {
  it('0.5는 0에서 먼 쪽', () => {
    expect(roundWon(2.5)).toBe(3);
    expect(roundWon(-2.5)).toBe(-3);
    expect(roundWon(2.49)).toBe(2);
    expect(roundWon(-0.4)).toBe(0);
    expect(Object.is(roundWon(-0.4), 0)).toBe(true);
  });
  it('나눗셈 결과를 반올림', () => {
    expect(won('10000÷3')).toEqual({ ok: true, won: 3333 });
    expect(won('20000÷3')).toEqual({ ok: true, won: 6667 });
    expect(won('5÷2')).toEqual({ ok: true, won: 3 });
  });
  it('부동소수 오차를 다듬음', () => {
    expect(won('0.1+0.2')).toEqual({ ok: true, won: 0 });
    expect(won('1.005×1000')).toEqual({ ok: true, won: 1005 });
    expect(won('4.35×100')).toEqual({ ok: true, won: 435 });
    expect(won('10000÷3×3')).toEqual({ ok: true, won: 10000 });
  });
});

describe('계산기: 음수·0·큰 수·잘못된 식', () => {
  it('음수', () => {
    expect(won('−5000+2000')).toEqual({ ok: true, won: -3000 });
    expect(won('3000−5000')).toEqual({ ok: true, won: -2000 });
    expect(won('5×−3')).toEqual({ ok: true, won: -15 });
    expect(won('−4÷−2')).toEqual({ ok: true, won: 2 });
  });
  it('0으로 나누기', () => {
    expect(won('5÷0')).toEqual({ ok: false, error: 'div0' });
    expect(won('5÷0.0')).toEqual({ ok: false, error: 'div0' });
    expect(won('0÷5')).toEqual({ ok: true, won: 0 });
    expect(won('1+2÷0×3')).toEqual({ ok: false, error: 'div0' });
  });
  it('아주 큰 수', () => {
    expect(won('999999999999999')).toEqual({ ok: true, won: MAX_RESULT });
    expect(won('999999999999999+1')).toEqual({ ok: false, error: 'overflow' });
    expect(won('999999999999999×999999999999999')).toEqual({ ok: false, error: 'overflow' });
    expect(won('999999999999999×999999999999999÷999999999999999')).toEqual({ ok: false, error: 'overflow' });
    expect(won('−999999999999999−1')).toEqual({ ok: false, error: 'overflow' });
  });
  it('빈 식·끝 연산자·잘못된 글자', () => {
    expect(won('')).toEqual({ ok: false, error: 'empty' });
    expect(won('−')).toEqual({ ok: false, error: 'empty' }); // 부호만 있으면 아직 빈 식
    expect(won('5+')).toEqual({ ok: true, won: 5 });
    expect(won('5×')).toEqual({ ok: true, won: 5 });
    expect(won('5++3')).toEqual({ ok: true, won: 8 });
    expect(won('abc')).toEqual({ ok: false, error: 'syntax' });
    expect(won('alert(1)')).toEqual({ ok: false, error: 'syntax' });
    expect(won('1..2')).toEqual({ ok: false, error: 'syntax' });
    expect(evaluate('5+3').ok).toBe(true);
    expect(tokenize('(1+2)')).toBeNull();
  });
});

describe('계산기: 누르기(입력 규칙)', () => {
  const ex = (keys, st) => pressAll(keys, st).expr;
  it('숫자·지우기·모두 지우기', () => {
    expect(ex(['1', '2', '3'])).toBe('123');
    expect(ex(['1', '2', '⌫'])).toBe('1');
    expect(ex(['1', '+', '2', 'C'])).toBe('');
    expect(ex(['⌫'])).toBe('');
  });
  it('앞자리 0 정리·00', () => {
    expect(ex(['0', '0', '5'])).toBe('5');
    expect(ex(['00'])).toBe('0');
    expect(ex(['000', '7'])).toBe('7');
    expect(ex(['5', '00'])).toBe('500');
    expect(ex(['1', '+', '0', '3'])).toBe('1+3');
    expect(ex(['1', '+', '00'])).toBe('1+0');
  });
  it('연속 연산자는 마지막 것으로', () => {
    expect(ex(['5', '+', '×'])).toBe('5×');
    expect(ex(['5', '×', '÷', '+'])).toBe('5+');
    expect(ex(['5', '+', '−'])).toBe('5−');
    expect(ex(['5', '−', '−'])).toBe('5−');
  });
  it('× ÷ 뒤의 −는 음수 부호, 그 뒤 다른 연산자는 둘 다 바꿈', () => {
    expect(ex(['5', '×', '−', '3'])).toBe('5×−3');
    expect(ex(['5', '×', '−', '+'])).toBe('5+');
    expect(ex(['5', '÷', '−', '−'])).toBe('5÷−');
  });
  it('맨 앞에는 −만(음수)', () => {
    expect(ex(['+'])).toBe('');
    expect(ex(['×', '5'])).toBe('5');
    expect(ex(['−', '5'])).toBe('−5');
    expect(ex(['−', '+'])).toBe('');
    expect(ex(['−', '−'])).toBe('−');
  });
  it('소수점은 숫자마다 한 번, 빈 곳이면 0.', () => {
    expect(ex(['.', '5'])).toBe('0.5');
    expect(ex(['1', '.', '.', '5'])).toBe('1.5');
    expect(ex(['1', '.', '5', '+', '.', '2'])).toBe('1.5+0.2');
    expect(ex(['1', '.', '+'])).toBe('1+');
    expect(ex(['1', '.', '1', '2', '3', '4', '5'])).toBe('1.1234');
  });
  it('자리 수·길이 한도', () => {
    const big = Array(MAX_INT_DIGITS + 3).fill('9');
    expect(ex(big)).toBe('9'.repeat(MAX_INT_DIGITS));
    expect(ex(['9'.repeat(14), '000'])).toBe('9'.repeat(14) + '0');
    const long = [];
    for (let i = 0; i < 60; i++) long.push('1', '2', '+');
    expect(ex(long).length).toBeLessThanOrEqual(MAX_EXPR);
  });
  it('= 뒤: 숫자는 새 식, 연산자는 이어서', () => {
    const after = { expr: '19000', fresh: true };
    expect(press(after, '5').expr).toBe('5');
    expect(press(after, '+').expr).toBe('19000+');
    expect(press(after, '.').expr).toBe('0.');
    expect(press(after, '⌫').expr).toBe('');
    expect(press(after, '+').fresh).toBe(false);
  });
  it('모르는 키는 그대로', () => {
    const s = { expr: '12', fresh: false };
    expect(press(s, 'Enter')).toEqual(s);
    expect(press(s, '=')).toEqual(s);
  });
  it('받은 상태를 바꾸지 않음', () => {
    const s = Object.freeze({ expr: '1', fresh: false });
    expect(press(s, '2').expr).toBe('12');
    expect(s.expr).toBe('1');
  });
});

describe('계산기: 보조', () => {
  it('천 단위 쉼표', () => {
    expect(formatExpr('1234567+89.5×1000')).toBe('1,234,567+89.5×1,000');
    expect(formatExpr('0.12345')).toBe('0.12345');
  });
  it('금액 → 식', () => {
    expect(exprFromWon(12000)).toBe('12000');
    expect(exprFromWon(-500)).toBe('−500');
    expect(exprFromWon(0)).toBe('');
  });
  it('붙여넣기 글자 → 식', () => {
    expect(exprFromText('12,000원 + 3,500원')).toBe('12000+3500');
    expect(exprFromText('(1+2)*3')).toBe('1+2×3');
    expect(exprFromText('<script>')).toBe('');
  });
  it('읽기용 문장', () => expect(speakExpr('1200+3×−2')).toBe('1,200 더하기 3 곱하기 빼기 2'));
  it('연산자 정규화', () => {
    expect(normalizeOp('*')).toBe('×');
    expect(normalizeOp('/')).toBe('÷');
    expect(normalizeOp('-')).toBe('−');
    expect(normalizeOp('a')).toBeNull();
  });
  it('eval·Function 을 쓰지 않음', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('./calc.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\beval\s*\(|new\s+Function|Function\s*\(/);
  });
});
