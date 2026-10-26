import { describe, test, expect } from 'vitest';
import { createAddPop, OPEN_AT_MS, POP_MS, REDUCED_OPEN_MS, FLASH_MS, createTapBurst, BURST_QUIET_MS, BURST_PAD_PX } from './fabPop.js';

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
  const CUP = { left: 148, right: 212, top: 712, bottom: 772 }; // 360 폭 아래 메뉴 가운데 컵 버튼 자리
  test('연타 보호: 버튼에서 시작한 누름이 400ms 안으로 이어지는 동안 시트 누름은 모두 무시(40~300ms 간격 12번)', () => {
    for (const gap of [40, 80, 120, 200, 300]) {
      const b = createTapBurst(); let swallowed = 0;
      b.fromButton(0, CUP);
      for (let i = 1; i < 12; i++) if (b.swallow(i * gap, 180 + (i % 3) * 4, 740 - (i % 2) * 6)) swallowed++; // 2번째부터는 시트(바탕·저장·자판)에 떨어짐
      expect(swallowed).toBe(11);
      expect(b.swallow(11 * gap + BURST_QUIET_MS, 180, 740)).toBe(false); // 손을 400ms 떼면 보통 누름
    }
  });
  test('연타 보호: 보통 사용(한 번 누르고 잠시 뒤 시트 누름)은 막지 않는다', () => {
    const b = createTapBurst(); b.fromButton(0);
    expect(b.swallow(BURST_QUIET_MS)).toBe(false); expect(b.swallow(900)).toBe(false);
    b.fromButton(1000); b.reset(); expect(b.swallow(1010)).toBe(false);
  });
  test('연타 보호: 창을 늘리고 무시하는 것은 컵 자리(버튼 + 24px) 안 누름뿐, 자판·입력칸은 열린 직후라도 받는다(QA 3차 N1)', () => {
    const b = createTapBurst(); b.fromButton(0, CUP);
    // 컵 한 번 → 250ms 간격으로 자판 1·2·3·4(컵 자리 밖): 모두 받고 창도 늘지 않음
    for (const [i, t] of [280, 530, 780, 1030].entries()) expect(b.swallow(t, 60 + i * 80, 560)).toBe(false);
    // 자판을 누른 뒤에도 창은 처음 그대로(0+400) → 450ms 의 컵 자리 누름도 보통 누름
    b.fromButton(0, CUP); expect(b.swallow(300, 60, 560)).toBe(false); expect(b.swallow(450, 180, 740)).toBe(false);
    // 경계: 24px 여유 안은 연타, 바로 밖은 보통
    b.fromButton(0, CUP); expect(b.swallow(100, CUP.right + BURST_PAD_PX, 740)).toBe(true);
    b.fromButton(0, CUP); expect(b.swallow(100, CUP.right + BURST_PAD_PX + 1, 740)).toBe(false);
    b.fromButton(0, CUP); expect(b.swallow(100, 180, CUP.top - BURST_PAD_PX - 1)).toBe(false);
  });
  test('키보드 연타 보호: 자리 없이 쓰면 Enter·Space 묶음만 400ms 창, reset(다른 키) 뒤 Enter 는 바로 받음(QA 3차 N2)', () => {
    const k = createTapBurst(); k.fromButton(0);
    let n = 0; for (let i = 1; i < 12; i++) if (k.swallow(i * 80)) n++;
    expect(n).toBe(11);
    k.fromButton(0); k.reset(); expect(k.swallow(50)).toBe(false); // 숫자 키를 치면 묶음 끝
  });
});
