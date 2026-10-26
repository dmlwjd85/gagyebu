import { describe, test, expect } from 'vitest';
import { createAddPop, OPEN_AT_MS, POP_MS, REDUCED_OPEN_MS, FLASH_MS, createTapBurst, BURST_QUIET_MS } from './fabPop.js';

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
  test('움직임 줄이기: 터지는 연출 없이 버튼 색 변화를 보여 준 뒤(120ms) 시트가 열린다', () => {
    let opened = 0; const btn = fakeBtn(); const c = clock();
    const pop = createAddPop({ open: () => opened++, reduced: () => true, later: c.later });
    pop(btn); pop(btn);
    expect(btn.classList.has('is-popping')).toBe(false);
    expect(btn.classList.has('is-flash')).toBe(true); expect(opened).toBe(0);
    c.run(REDUCED_OPEN_MS); expect(opened).toBe(1); expect(btn.classList.has('is-flash')).toBe(true);
    c.run(FLASH_MS); expect(btn.classList.has('is-flash')).toBe(false); expect(opened).toBe(1);
  });
  test('연타해도 터지는 소리(onBurst)는 연출마다 한 번, 움직임 줄이기에서도 바로 한 번', () => {
    let burst = 0; const c = clock(); const btn = fakeBtn();
    const pop = createAddPop({ open: () => {}, later: c.later, onBurst: () => burst++ });
    pop(btn); pop(btn); c.run(POP_MS); expect(burst).toBe(1);
    pop(btn); c.run(POP_MS * 2); expect(burst).toBe(2);
    let b2 = 0; createAddPop({ open: () => {}, reduced: () => true, later: () => {}, onBurst: () => b2++ })(fakeBtn());
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
  test('움직임 줄이기: 열리자마자 닫고 다시 눌러도 다시 열린다', () => {
    let opened = 0; let open = false; const c = clock();
    const pop = createAddPop({ open: () => { opened++; open = true; }, isOpen: () => open, reduced: () => true, later: c.later });
    pop(fakeBtn()); c.run(REDUCED_OPEN_MS); open = false; pop(fakeBtn()); c.run(REDUCED_OPEN_MS * 2); expect(opened).toBe(2);
  });
  test('연타 보호: 버튼에서 시작한 누름이 400ms 안으로 이어지는 동안 시트 누름은 모두 무시(40~300ms 간격 12번)', () => {
    for (const gap of [40, 80, 120, 200, 300]) {
      const b = createTapBurst(); let swallowed = 0;
      b.fromButton(0);
      for (let i = 1; i < 12; i++) if (b.swallow(i * gap)) swallowed++; // 2번째부터는 시트(바탕·저장·자판)에 떨어짐
      expect(swallowed).toBe(11);
      expect(b.swallow(11 * gap + BURST_QUIET_MS)).toBe(false); // 손을 400ms 떼면 보통 누름
    }
  });
  test('연타 보호: 보통 사용(한 번 누르고 잠시 뒤 시트 누름)은 막지 않는다', () => {
    const b = createTapBurst(); b.fromButton(0);
    expect(b.swallow(BURST_QUIET_MS)).toBe(false); expect(b.swallow(900)).toBe(false);
    b.fromButton(1000); b.reset(); expect(b.swallow(1010)).toBe(false);
  });
});
