// @vitest-environment jsdom
import { describe, test, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAddPop, ghostOver, POP_MS, FLASH_MS, BURST_AT_MS, createTapBurst, BURST_QUIET_MS, BURST_KEY_MS, BURST_RADIUS_PX } from './fabPop.js';

const fakeBtn = () => { const c = new Set(); let gone = false; return { offsetWidth: 1, remove: () => { gone = true; }, get gone() { return gone; }, classList: { add: (x) => c.add(x), remove: (x) => c.delete(x), has: (x) => c.has(x) } }; };
const clock = () => { const q = []; return { later: (f, ms) => q.push({ f, ms }), run: (upTo) => { q.sort((a, b) => a.ms - b.ms); while (q.length && q[0].ms <= upTo) q.shift().f(); } }; };
const frames = () => { const q = []; return { frame: (f) => q.push(f), flush: () => { while (q.length) q.shift()(); } }; };
const ghostMaker = (list) => () => () => { const g = fakeBtn(); list.push(g); return g; };

describe('쨈 컵 버튼의 탁 연출', () => {
  test('누르는 즉시 시트가 열리고(QA 4차 D1), 복사본·연출은 다음 프레임 뒤에 시작해 520ms 뒤 복사본은 사라진다(QA 5차 D2)', () => {
    let opened = 0, open = false; const c = clock(), f = frames(); const btn = fakeBtn(); const ghosts = [];
    const pop = createAddPop({ open: () => { opened++; open = true; }, isOpen: () => open, later: c.later, frame: f.frame, overlay: ghostMaker(ghosts) });
    expect(pop(btn)).toBe(true); expect(opened).toBe(1);
    expect(ghosts.length).toBe(0); expect(btn.classList.has('is-popping')).toBe(false); // 클릭 안에서는 시트만 엶
    expect(pop(btn)).toBe(false); expect(opened).toBe(1); // 이미 열림 → 다시 열지 않음
    f.flush(); expect(btn.classList.has('is-popping')).toBe(true); expect(ghosts[0].classList.has('is-popping')).toBe(true);
    c.run(POP_MS); expect(btn.classList.has('is-popping')).toBe(false); expect(ghosts[0].gone).toBe(true);
  });
  test('움직임 줄이기: 터지는 동작 없이 색 변화(160ms)만, 시트는 역시 바로 열린다', () => {
    let opened = 0; const btn = fakeBtn(); const ghosts = []; const c = clock(), f = frames();
    const pop = createAddPop({ open: () => opened++, reduced: () => true, later: c.later, frame: f.frame, overlay: ghostMaker(ghosts) });
    pop(btn); expect(opened).toBe(1); f.flush();
    expect(btn.classList.has('is-popping')).toBe(false); expect(ghosts[0].classList.has('is-flash')).toBe(true);
    c.run(FLASH_MS); expect(ghosts[0].classList.has('is-flash')).toBe(false); expect(ghosts[0].gone).toBe(true); expect(opened).toBe(1);
  });
  test('터지는 소리(onBurst)는 클릭 안이 아니라 프레임 뒤: 기본 90ms, 움직임 줄이기는 프레임 직후, 누름마다 한 번', () => {
    let burst = 0; const c = clock(), f = frames();
    createAddPop({ open: () => {}, later: c.later, frame: f.frame, onBurst: () => burst++, overlay: () => null })(fakeBtn());
    f.flush(); expect(burst).toBe(0); c.run(BURST_AT_MS); expect(burst).toBe(1);
    let b2 = 0; const f2 = frames();
    createAddPop({ open: () => {}, reduced: () => true, later: () => {}, frame: f2.frame, onBurst: () => b2++, overlay: () => null })(fakeBtn());
    expect(b2).toBe(0); f2.flush(); expect(b2).toBe(1);
  });
  test('연출 도중 시트를 닫고 다시 누르면 바로 다시 열리고, 앞 복사본은 치우고 새로 시작', () => {
    let opened = 0, open = false; const c = clock(), f = frames(); const btn = fakeBtn(); const ghosts = [];
    const pop = createAddPop({ open: () => { opened++; open = true; }, isOpen: () => open, later: c.later, frame: f.frame, overlay: ghostMaker(ghosts) });
    pop(btn); f.flush(); open = false; // 300ms 무렵 바로 닫음
    expect(pop(btn)).toBe(true); expect(opened).toBe(2); f.flush();
    expect(ghosts[0].gone).toBe(true); expect(ghosts[1].classList.has('is-popping')).toBe(true);
  });
  test('움직임 줄이기에서 닫고 바로 다시 열어도 소리는 누름마다 한 번, 프레임 전에 다시 누르면 앞 연출은 건너뜀', () => {
    let opened = 0, open = false, burst = 0; const f = frames(); const ghosts = [];
    const pop = createAddPop({ open: () => { opened++; open = true; }, isOpen: () => open, reduced: () => true, later: () => {}, frame: f.frame, onBurst: () => burst++, overlay: ghostMaker(ghosts) });
    pop(fakeBtn()); open = false; pop(fakeBtn()); f.flush();
    expect(opened).toBe(2); expect(burst).toBe(1); expect(ghosts.length).toBe(1);
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
  test('연타 보호(자판 간격 200ms, QA 5차 D1): 컵에서 이어지는 빠른 연타는 무시, 300ms 간격 "8 8" 은 둘 다 받음', () => {
    for (const gap of [40, 80, 120, 180]) {
      const b = createTapBurst(); b.fromButton(0, 138, 578); let n = 0;
      for (let i = 1; i < 12; i++) if (b.swallow(i * gap, 138 + (i % 2) * 5, 578, BURST_KEY_MS)) n++;
      expect(n).toBe(11);
    }
    const b = createTapBurst(); b.fromButton(0, 138, 578);
    expect(b.swallow(300, 140, 580, BURST_KEY_MS)).toBe(false); expect(b.swallow(600, 140, 580, BURST_KEY_MS)).toBe(false);
    b.fromButton(0, 138, 578); expect(b.swallow(BURST_KEY_MS, 138, 578, BURST_KEY_MS)).toBe(false); // 250ms 이상 뒤 일부러 누른 숫자는 받음
  });
  test('연타 보호: 다른 자리 누름은 열린 직후라도 받고, 받으면 묶음이 끝나 같은 자리라도 이어서 받는다(QA 4차 D2)', () => {
    const b = createTapBurst(); b.fromButton(0, 180, 740);
    expect(b.swallow(50, 180 + BURST_RADIUS_PX + 1, 740)).toBe(false); // 컵 자리 밖 바탕·✕ 는 받음
    expect(b.swallow(100, 180, 740)).toBe(false); // 묶음이 끝났으니 컵 자리 '저장'도 받음
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

// 실제 DOM 복사본(ghostOver): jsdom 은 배치를 안 하므로 자리 값을 직접 줌
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
function cupButton(r) {
  const b = document.createElement('button'); b.className = 'fab';
  b.innerHTML = '<span class="fab-disc"><svg class="cup-svg"></svg></span>'; document.body.append(b);
  b.querySelector('.fab-disc').getBoundingClientRect = () => r;
  return b;
}
function sheetPanel(left, top, width, height) {
  const root = document.createElement('div'), s = document.createElement('section');
  root.id = 'sheet-root'; s.className = 'sheet'; root.append(s); document.body.append(root);
  for (const [k, v] of Object.entries({ offsetParent: root, offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height })) Object.defineProperty(s, k, { value: v });
  root.getBoundingClientRect = () => rect(0, 0, 9999, 9999);
  return s;
}
describe('컵 복사본(ghostOver)', () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });
  test('누르는 동안 복사본은 하나, 버튼 자리 그대로 · 누름 통과(pointer-events:none) · 520ms 뒤 사라짐 · 다시 누르면 앞 복사본 정리', () => {
    vi.useFakeTimers();
    const btn = cupButton(rect(10, 20, 44, 34)); let open = false;
    const pop = createAddPop({ open: () => { open = true; }, isOpen: () => open, frame: (fn) => fn() });
    pop(btn);
    const gs = document.querySelectorAll('.fab-ghost'); expect(gs.length).toBe(1);
    expect(gs[0].style.left).toBe('10px'); expect(gs[0].style.top).toBe('20px'); expect(gs[0].getAttribute('aria-hidden')).toBe('true');
    expect(readFileSync(join(process.cwd(), 'src/style.css'), 'utf8')).toMatch(/\.fab\.fab-ghost\s*\{[^}]*pointer-events:\s*none/);
    vi.advanceTimersByTime(300); open = false; pop(btn); // 도중에 닫고 다시 누름
    expect(document.querySelectorAll('.fab-ghost').length).toBe(1);
    vi.advanceTimersByTime(POP_MS); expect(document.querySelectorAll('.fab-ghost').length).toBe(0);
  });
  test('휴대폰 피어남(6차 보완): 컵 자리가 시트 판과 겹치면 복사본은 제자리에서 빨리 터지고(is-burst) 쨈·호일 조각이 튀며, 520ms 뒤 모두 사라짐', () => {
    vi.useFakeTimers();
    const btn = cupButton(rect(138, 561, 44, 34)), panel = sheetPanel(0, 8, 320, 632);
    createAddPop({ open: () => {}, frame: (fn) => fn(), cover: () => panel })(btn);
    const g = document.querySelector('.fab-ghost'); expect(g.style.left).toBe('138px'); expect(g.style.top).toBe('561px');
    expect(g.classList.contains('is-burst')).toBe(true); expect(g.classList.contains('is-popping')).toBe(false); expect(btn.classList.contains('is-popping')).toBe(true);
    const bits = document.querySelector('.jam-burst'); expect(bits.getAttribute('aria-hidden')).toBe('true'); expect(bits.querySelectorAll('.jam-bit').length).toBe(12);
    const css = readFileSync(join(process.cwd(), 'src/style.css'), 'utf8');
    expect(css).toMatch(/\.jam-burst\s*\{[^}]*pointer-events:\s*none/);
    vi.advanceTimersByTime(POP_MS); expect(document.querySelectorAll('.fab-ghost, .jam-burst').length).toBe(0);
    const pc = cupButton(rect(40, 700, 44, 34)), dialog = sheetPanel(430, 100, 420, 600); // PC: 시트는 가운데, 컵은 왼쪽 메뉴 → 보통 연출, 조각 없음
    createAddPop({ open: () => {}, frame: (fn) => fn(), cover: () => dialog })(pc);
    expect(document.querySelector('.fab-ghost').classList.contains('is-popping')).toBe(true); expect(document.querySelectorAll('.jam-burst').length).toBe(0);
  });
  test('피어남: 시트 펼침(is-bloom)은 클릭 안에서 open() 전에 컵 가운데 기준으로 켜고 연출 끝에 끔, 움직임 줄이기는 펼침·조각 없이 색 변화만', () => {
    vi.useFakeTimers();
    const root = document.createElement('div'); root.id = 'sheet-root'; document.body.append(root);
    let seen = null; const f = frames();
    createAddPop({ open: () => { seen = root.classList.contains('is-bloom'); }, frame: f.frame })(cupButton(rect(138, 561, 44, 34)));
    expect(seen).toBe(true); // 첫 화면부터 펼쳐지게
    expect(root.style.getPropertyValue('--bloom-x')).toBe(`calc(50% + ${Math.round(160 - innerWidth / 2)}px)`);
    expect(root.style.getPropertyValue('--bloom-y')).toBe(`calc(100% - ${Math.round(innerHeight - 578)}px)`);
    f.flush(); vi.advanceTimersByTime(POP_MS); expect(root.classList.contains('is-bloom')).toBe(false);
    const panel = sheetPanel(0, 8, 320, 632);
    createAddPop({ open: () => {}, reduced: () => true, frame: (fn) => fn(), cover: () => panel })(cupButton(rect(138, 561, 44, 34)));
    expect(root.classList.contains('is-bloom')).toBe(false); expect(document.querySelectorAll('.jam-burst').length).toBe(0);
    expect(document.querySelector('.fab-ghost').classList.contains('is-flash')).toBe(true);
    const css = readFileSync(join(process.cwd(), 'src/style.css'), 'utf8');
    expect(css).toMatch(/max-width: 1023px\) and \(prefers-reduced-motion: no-preference\)\s*\{\s*#sheet-root\.is-bloom \.sheet/);
  });
  test('접시가 없는 버튼은 복사본 없음', () => {
    expect(ghostOver(document.createElement('button'))).toBe(null); // 접시가 없는 버튼
  });
});
