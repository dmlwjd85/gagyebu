// @vitest-environment jsdom
// 시트 연타 보호(sheet.js window 캡처 pointerdown): 컵에서 이어진 같은 자리 누름만 무시하는지 실제 핸들러로 확인(QA 5차 D3)
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '../lib/defaults.js';
import { initSheet, openSheet, closeSheet, isSheetOpen } from './sheet.js';

const state = { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, features: { sms: false, txOwner: false, recurring: false }, txs: [] };
let fab;
beforeAll(() => {
  window.matchMedia ??= (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  document.body.innerHTML = '<div id="app"><button class="fab">+</button></div>';
  fab = document.querySelector('.fab');
  initSheet({ getState: () => state, onSave() {}, onDelete() {} });
});
beforeEach(() => { if (isSheetOpen()) closeSheet(); openSheet(); });

const P = { x: 160, y: 595 }; // 320 화면의 컵 자리(그 위에 '8')
// 누름: pointerdown(시각·자리 지정) → click. pointerdown 이 막혔는지 돌려줌
function tap(target, t, at = P) {
  const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y });
  Object.defineProperty(down, 'timeStamp', { value: t });
  target.dispatchEvent(down);
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, clientX: at.x, clientY: at.y }));
  return down.defaultPrevented;
}
const key = (k) => document.querySelector(`#sheet-root [data-key="${k}"]`);
const amount = () => document.querySelector('#sheet-root .amount-display').textContent.replace(/[^0-9원]/g, '');

describe('시트 연타 보호', () => {
  test('320 컵 연타 12번(120ms 간격, 같은 자리 \'8\') → 모두 무시, 0원', () => {
    tap(fab, 0);
    let swallowed = 0; for (let i = 1; i < 12; i++) if (tap(key('8'), i * 120, { x: P.x + (i % 2) * 4, y: P.y })) swallowed++;
    expect(swallowed).toBe(11); expect(amount()).toMatch(/^0원/);
  });
  test('320 "8 8"(컵 뒤 300ms 간격) → 둘 다 받아 88원', () => {
    tap(fab, 1000); expect(tap(key('8'), 1300)).toBe(false); expect(tap(key('8'), 1600)).toBe(false);
    expect(amount()).toMatch(/^88원/);
  });
  test('\'저장\'·바탕은 400ms 창: 컵 뒤 300ms 같은 자리 \'저장\'은 무시', () => {
    tap(fab, 2000); expect(tap(document.querySelector('#sheet-root [data-save]'), 2300)).toBe(true);
    expect(isSheetOpen()).toBe(true);
  });
  test('다른 자리 자판을 누르면 묶음이 끝나, 바로 뒤 컵 자리 \'저장\'·자판도 받음', () => {
    tap(fab, 3000); expect(tap(key('1'), 3050, { x: 40, y: 400 })).toBe(false);
    expect(tap(key('8'), 3100)).toBe(false); expect(amount()).toMatch(/^18원/);
  });
});
