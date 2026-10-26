import { describe, test, expect } from 'vitest';
import { createAddPop, POP_MS, FLASH_MS, BURST_AT_MS, createTapBurst, BURST_QUIET_MS, BURST_RADIUS_PX } from './fabPop.js';

const fakeBtn = () => { const c = new Set(); let gone = false; return { offsetWidth: 1, remove: () => { gone = true; }, get gone() { return gone; }, classList: { add: (x) => c.add(x), remove: (x) => c.delete(x), has: (x) => c.has(x) } }; };
const clock = () => { const q = []; return { later: (f, ms) => q.push({ f, ms }), run: (upTo) => { q.sort((a, b) => a.ms - b.ms); while (q.length && q[0].ms <= upTo) q.shift().f(); } }; };

describe('쨈 컵 버튼의 탁 연출', () => {
  test('누르는 즉시 시트가 열리고(QA 4차 D1), 터지는 연출은 시트 위 복사본과 버튼에서 520ms 돈 뒤 복사본은 사라진다', () => {
    let opened = 0, open = false; const c = clock(); const btn = fakeBtn(); const ghosts = [];
    const pop = createAddPop({ open: () => { opened++; open = true; }, isOpen: () => open, later: c.later, overlay: () => { const g = fakeBtn(); ghosts.push(g); return g; } });
    expect(pop(btn)).toBe(true); expect(opened).toBe(1);
    expect(pop(btn)).toBe(false); expect(opened).toBe(1); // 이미 열림 → 다시 열지 않음
    expect(btn.classList.has('is-popping')).toBe(true); expect(ghosts[0].classList.has('is-popping')).toBe(true);
    c.run(POP_MS); expect(btn.classList.has('is-popping')).toBe(false); expect(ghosts[0].gone).toBe(true);
  });
  test('움직임 줄이기: 터지는 동작 없이 색 변화(160ms)만, 시트는 역시 바로 열린다', () => {
    let opened = 0; const btn = fakeBtn(); const g = fakeBtn(); const c = clock();
    const pop = createAddPop({ open: () => opened++, reduced: () => true, later: c.later, overlay: () => g });
    pop(btn); expect(opened).toBe(1);
    expect(btn.classList.has('is-popping')).toBe(false); expect(g.classList.has('is-flash')).toBe(true);
    c.run(FLASH_MS); expect(g.classList.has('is-flash')).toBe(false); expect(g.gone).toBe(true); expect(opened).toBe(1);
  });
  test('터지는 소리(onBurst)는 누름마다 한 번(90ms), 움직임 줄이기에서는 바로', () => {
    let burst = 0; const c = clock();
    createAddPop({ open: () => {}, later: c.later, onBurst: () => burst++, overlay: () => null })(fakeBtn());
    expect(burst).toBe(0); c.run(BURST_AT_MS); expect(burst).toBe(1);
    let b2 = 0; createAddPop({ open: () => {}, reduced: () => true, later: () => {}, onBurst: () => b2++, overlay: () => null })(fakeBtn());
    expect(b2).toBe(1);
  });
  test('연출 도중 시트를 닫고 다시 누르면 바로 다시 열리고, 앞 복사본은 치우고 새로 시작', () => {
    let opened = 0, open = false; const c = clock(); const btn = fakeBtn(); const ghosts = [];
    const pop = createAddPop({ open: () => { opened++; open = true; }, isOpen: () => open, later: c.later, overlay: () => { const g = fakeBtn(); ghosts.push(g); return g; } });
    pop(btn); open = false; // 300ms 무렵 바로 닫음
    expect(pop(btn)).toBe(true); expect(opened).toBe(2);
    expect(ghosts[0].gone).toBe(true); expect(ghosts[1].classList.has('is-popping')).toBe(true);
  });
  test('연타 보호: 같은 자리 되풀이 누름(40~300ms 간격 12번, 손가락 흔들림 몇 px)은 모두 무시하고, 400ms 쉬면 보통 누름', () => {
    for (const gap of [40, 80, 120, 200, 300]) {
      const b = createTapBurst(); let swallowed = 0;
      b.fromButton(0, 180, 740);
      for (let i = 1; i < 12; i++) if (b.swallow(i * gap, 180 + (i % 3) * 4, 740 - (i % 2) * 6)) swallowed++;
      expect(swallowed).toBe(11);
      expect(b.swallow(11 * gap + BURST_QUIET_MS, 180, 740)).toBe(false);
    }
  });
  test('연타 보호: 다른 자리 누름은 열린 직후라도 받고, 받으면 묶음이 끝나 같은 자리라도 이어서 받는다(QA 4차 D2)', () => {
    const b = createTapBurst(); b.fromButton(0, 180, 740);
    expect(b.swallow(50, 180 + BURST_RADIUS_PX + 1, 740)).toBe(false); // 컵 자리 밖 바탕·✕ 는 받음
    expect(b.swallow(100, 180, 740)).toBe(false); // 묶음이 끝났으니 컵 자리 '저장'도 받음(자판을 누른 경우는 sheet.js 가 reset)
    b.fromButton(0, 180, 740); expect(b.swallow(100, 180, 740 - BURST_RADIUS_PX)).toBe(true);
    const n = createTapBurst(); n.fromButton(0); n.reset(); expect(n.swallow(10)).toBe(false);
  });
  test('키보드 연타 보호: 자리 없이 쓰면 Enter·Space 묶음만 400ms 창, reset(다른 키) 뒤 Enter 는 바로 받음(QA 3차 N2)', () => {
    const k = createTapBurst(); k.fromButton(0);
    let n = 0; for (let i = 1; i < 12; i++) if (k.swallow(i * 80)) n++;
    expect(n).toBe(11);
    k.fromButton(0); k.reset(); expect(k.swallow(50)).toBe(false);
  });
});
