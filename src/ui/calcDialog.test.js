// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { openCalc, isCalcOpen } from './calcDialog.js';
import { bindModalHistory, dismissTopModal, hasModal, promptAmount } from './util.js';

const click = (sel) => document.querySelector(sel).click();
const keys = (list) => list.forEach((k) => click(`.calc-key[data-ck="${k}"]`));
const text = (sel) => document.querySelector(sel)?.textContent ?? '';
const type = (k) => document.querySelector('.calc-card').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
let hist;
beforeAll(() => {
  globalThis.CSS ??= { escape: (s) => String(s).replace(/[^\w-]/g, (c) => `\\${c}`) };
  hist = { open: vi.fn(), close: vi.fn() };
  bindModalHistory(hist);
});
beforeEach(() => { while (hasModal()) dismissTopModal(); document.body.innerHTML = '<div id="app"></div>'; hist.open.mockClear(); hist.close.mockClear(); });

describe('계산기 대화상자', () => {
  test('연산 우선순위 미리보기·= 결과·0 나누기 안내', async () => {
    const done = openCalc();
    expect(isCalcOpen()).toBe(true);
    expect(hist.open).toHaveBeenCalledTimes(1);
    keys(['1', '2', '0', '0', '0', '+', '3', '5', '0', '0', '×', '2']);
    expect(text('[data-calc-main]')).toBe('12,000+3,500×2');
    expect(text('[data-calc-sub]')).toBe('= 19,000원');
    keys(['=']);
    expect(text('[data-calc-main]')).toBe('19,000');
    expect(text('[data-calc-sub]')).toBe('12,000+3,500×2 =');
    keys(['÷', '0', '=']);
    expect(text('[data-calc-msg]')).toBe('0으로 나눌 수 없어요.');
    click('[data-calc-close]');
    await done;
    expect(isCalcOpen()).toBe(false);
    expect(hist.close).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.calc-wrap')).toBeNull();
    expect(document.getElementById('app').inert).toBe(false);
  });
  test('금액 칸: = 를 누르면 바로 넣고, 0원 이하·한도 넘음은 넣지 않음', async () => {
    const got = [];
    const done = openCalc({ mode: 'amount', value: 5000, onApply: (w) => (w <= 0 ? '0원보다 큰 결과만' : w > 1e9 ? '10억' : (got.push(w), null)) });
    expect(text('[data-calc-main]')).toBe('5,000');
    keys(['×', '3', '=']);
    expect(got).toEqual([15000]);
    expect(text('[data-calc-msg]')).toContain('15,000원을 넣었어요');
    keys(['−', '2', '0', '0', '0', '0', '=']);
    expect(got).toEqual([15000]);
    expect(text('[data-calc-msg]')).toBe('0원보다 큰 결과만');
    click('[data-calc-done]'); // 넣지 못한 결과면 열어 둠
    expect(isCalcOpen()).toBe(true);
    keys(['C', '7', '+', '3']);
    click('[data-calc-done]'); // 남은 식을 계산해 넣고 닫음
    await done;
    expect(got).toEqual([15000, 10]);
  });
  test('키보드: 숫자·연산자·Enter·Backspace·Esc, 반올림', async () => {
    const got = [];
    const done = openCalc({ mode: 'amount', onApply: (w) => (got.push(w), null) });
    for (const k of ['1', '0', '0', '0', '0', '/', '3', 'Enter']) type(k);
    expect(got).toEqual([3333]);
    type('Backspace');
    expect(text('[data-calc-main]')).toBe('0');
    for (const k of ['5', '-', '*', '2']) type(k);
    expect(text('[data-calc-main]')).toBe('5×2');
    type('Escape');
    await done;
    expect(got).toEqual([3333]);
  });
  test('휴대폰 뒤로 가기(맨 위 대화상자 닫기)로 닫힘', async () => {
    const done = openCalc();
    expect(dismissTopModal()).toBe(true);
    await done;
    expect(isCalcOpen()).toBe(false);
    expect(hist.close).not.toHaveBeenCalled(); // 뒤로 가기로 닫히면 히스토리를 또 되돌리지 않음
  });
  test('이 금액으로 기록: 1원~10억 원만', async () => {
    const rec = vi.fn();
    const done = openCalc({ onRecord: rec });
    keys(['5', '−', '9', '=']);
    click('[data-calc-record]');
    expect(rec).not.toHaveBeenCalled();
    expect(text('[data-calc-msg]')).toContain('0원보다 큰');
    keys(['C', '4', '8', '0', '0', '0', '÷', '3']);
    click('[data-calc-record]');
    await done;
    expect(rec).toHaveBeenCalledWith(16000);
  });
  test('예산 금액 칸에서도: 계산기 단추·+ 입력으로 열고 결과를 칸에 넣음', async () => {
    const p = promptAmount({ title: '예산', value: 300000 });
    expect(document.querySelector('[data-calc-in]')).not.toBeNull();
    click('[data-calc-in]');
    expect(isCalcOpen()).toBe(true);
    keys(['×', '3', '=']);
    click('[data-calc-done]');
    await Promise.resolve();
    const input = document.querySelector('[data-amount-calc]');
    expect(input.value).toBe('900,000');
    const ev = new InputEvent('beforeinput', { data: '+', bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(text('[data-calc-main]')).toBe('900,000+');
    type('Escape');
    expect(isCalcOpen()).toBe(false);
    document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(await p).toBe(900000);
  });
});
