import { describe, test, expect } from 'vitest';
import { createAddPop, OPEN_AT_MS, POP_MS, isEarlyTap, SHEET_GUARD_MS } from './fabPop.js';

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
  test('연출 도중(520ms 안) 시트를 닫고 다시 누르면 기다리지 않고 바로 다시 열린다', () => {
    let opened = 0; let open = false; const c = clock(); const btn = fakeBtn();
    const pop = createAddPop({ open: () => { opened++; open = true; }, isOpen: () => open, later: c.later });
    pop(btn); c.run(OPEN_AT_MS); expect(opened).toBe(1);
    open = false; // 사용자가 바로 닫음(300ms 무렵)
    expect(pop(btn)).toBe(true); expect(opened).toBe(2);
    expect(pop(btn)).toBe(false); // 이미 열림
  });
  test('움직임 줄이기: 160ms 안에 닫고 다시 눌러도 다시 열린다', () => {
    let opened = 0; let open = false; const c = clock();
    const pop = createAddPop({ open: () => { opened++; open = true; }, isOpen: () => open, reduced: () => true, later: c.later });
    pop(fakeBtn()); open = false; pop(fakeBtn()); expect(opened).toBe(2);
  });
  test('시트가 올라오는 동안(300ms)의 손가락 누름은 무시, 키보드 click 과 그 뒤 누름은 받음', () => {
    expect(isEarlyTap(40)).toBe(true); expect(isEarlyTap(120)).toBe(true);
    expect(isEarlyTap(SHEET_GUARD_MS)).toBe(false); expect(isEarlyTap(800)).toBe(false);
    expect(isEarlyTap(40, 0)).toBe(false);
  });
});
