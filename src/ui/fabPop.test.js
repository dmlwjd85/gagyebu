import { describe, test, expect } from 'vitest';
import { createAddPop, OPEN_AT_MS, POP_MS } from './fabPop.js';

const fakeBtn = () => { const c = new Set(); return { offsetWidth: 1, classList: { add: (x) => c.add(x), remove: (x) => c.delete(x), has: (x) => c.has(x) } }; };
const clock = () => { const q = []; return { later: (f, ms) => q.push({ f, ms }), run: (upTo) => { q.sort((a, b) => a.ms - b.ms); while (q.length && q[0].ms <= upTo) q.shift().f(); } }; };

describe('쨈 컵 버튼의 탁 연출', () => {
  test('연달아 눌러도 시트는 한 번만 열리고, 연출 도중(250ms)에 열린다', () => {
    let opened = 0; const c = clock(); const btn = fakeBtn();
    const pop = createAddPop({ open: () => opened++, later: c.later });
    pop(btn); pop(btn); pop(btn);
    expect(btn.classList.has('is-popping')).toBe(true);
    expect(opened).toBe(0);
    c.run(OPEN_AT_MS); expect(opened).toBe(1);
    c.run(1000); expect(opened).toBe(1);
    expect(btn.classList.has('is-popping')).toBe(false);
  });
  test('시트가 이미 열려 있으면 다시 열지 않는다', () => {
    let opened = 0; const pop = createAddPop({ open: () => opened++, isOpen: () => true, later: clock().later });
    expect(pop(fakeBtn())).toBe(false); expect(opened).toBe(0);
  });
  test('움직임 줄이기: 터지는 연출 없이 시트가 바로 열린다', () => {
    let opened = 0; const btn = fakeBtn();
    const pop = createAddPop({ open: () => opened++, reduced: () => true, later: clock().later });
    pop(btn);
    expect(opened).toBe(1);
    expect(btn.classList.has('is-popping')).toBe(false);
    expect(btn.classList.has('is-flash')).toBe(true);
  });
  test('연타해도 터지는 소리(onBurst)는 연출마다 한 번, 움직임 줄이기에서도 바로 한 번', () => {
    let burst = 0; const c = clock(); const btn = fakeBtn();
    const pop = createAddPop({ open: () => {}, later: c.later, onBurst: () => burst++ });
    pop(btn); pop(btn); c.run(POP_MS); expect(burst).toBe(1);
    pop(btn); c.run(POP_MS * 2); expect(burst).toBe(2);
    let b2 = 0; createAddPop({ open: () => {}, reduced: () => true, later: clock().later, onBurst: () => b2++ })(fakeBtn());
    expect(b2).toBe(1);
  });
});
