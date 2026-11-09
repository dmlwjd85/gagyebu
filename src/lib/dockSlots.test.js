import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DOCK_KEY, DEFAULT_DOCK, DOCK_POOL, SIDE_COUNT, normalizeDock, loadDock, saveDock, resetDock, pickDock, moveDock, activeDockId, dockPool } from './dockSlots.js';
import { dockHtml, dockKey, dockMenuHtml, dockEditHtml, DOCK_ICONS, HOLD_MS, MOVE_PX } from '../ui/dock.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

describe('아래 독 칸 배치', () => {
  it('기본: 홈·달력·차트 | 예산·계산기·더 (기존 탭 목적지 홈·달력·차트·예산 모두 유지)', () => {
    expect(DEFAULT_DOCK).toEqual(['home', 'calendar', 'chart', 'budget', 'calc', 'more']);
    expect(loadDock(mem())).toEqual(DEFAULT_DOCK);
  });
  it('모든 화면이 후보에 있음(연금·세액공제·검색·반복·가져오기·설정)', () => {
    const views = DOCK_POOL.filter((t) => t.view).map((t) => t.view).sort();
    expect(views).toEqual(['assets', 'budget', 'calendar', 'chart', 'home', 'import', 'recurring', 'search', 'settings', 'tax']);
    for (const t of DOCK_POOL) expect(DOCK_ICONS[t.id]).toBeTruthy();
  });
  it('모르는·겹친 아이디는 빼고 모자란 칸은 기본에서 채움, 늘 6칸', () => {
    expect(normalizeDock(['assets', 'assets', 'nope', 'home'])).toEqual(['assets', 'home', 'calendar', 'chart', 'budget', 'calc']);
    expect(normalizeDock('망가짐')).toEqual(DEFAULT_DOCK);
    expect(normalizeDock(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'home'])).toHaveLength(SIDE_COUNT);
  });
  it('꺼진 기능(반복 거래) 칸은 고를 수 없음', () => {
    expect(dockPool({ recurring: false }).some((t) => t.id === 'recurring')).toBe(false);
    expect(normalizeDock(['recurring', 'home'], { recurring: false })).not.toContain('recurring');
    expect(normalizeDock(['recurring', 'home'], { recurring: true })[0]).toBe('recurring');
  });
  it('저장·불러오기는 dockTabs 키 하나만 쓰고 다른 키는 건드리지 않음', () => {
    const s = mem({ theme: 'dark', homeBudgetOpen: '1' });
    saveDock(['assets', 'home'], s, 1000);
    expect(JSON.parse(s.getItem(DOCK_KEY))).toEqual({ order: ['assets', 'home', 'calendar', 'chart', 'budget', 'calc'], at: 1000 });
    expect(loadDock(s)[0]).toBe('assets');
    expect(s.getItem('theme')).toBe('dark');
    expect(s.getItem('homeBudgetOpen')).toBe('1');
    expect([...s.m.keys()].sort()).toEqual(['dockTabs', 'homeBudgetOpen', 'theme']);
    resetDock(s);
    expect(s.getItem(DOCK_KEY)).toBeNull();
    expect(s.getItem('theme')).toBe('dark');
  });
  it('망가진 저장값·막힌 저장소에서도 기본으로', () => {
    expect(loadDock(mem({ dockTabs: '{망가짐' }))).toEqual(DEFAULT_DOCK);
    const blocked = { getItem() { throw new Error('막힘'); }, setItem() { throw new Error('막힘'); } };
    expect(loadDock(blocked)).toEqual(DEFAULT_DOCK);
    expect(saveDock(['home'], blocked)).toEqual(DEFAULT_DOCK);
  });
  it('칸 고르기: 이미 있던 항목이면 맞바꿈', () => {
    expect(pickDock(DEFAULT_DOCK, 2, 'assets')).toEqual(['home', 'calendar', 'assets', 'budget', 'calc', 'more']);
    expect(pickDock(DEFAULT_DOCK, 0, 'more')).toEqual(['more', 'calendar', 'chart', 'budget', 'calc', 'home']);
    expect(pickDock(DEFAULT_DOCK, 9, 'assets')).toEqual(DEFAULT_DOCK);
    expect(pickDock(DEFAULT_DOCK, 1, 'nope')).toEqual(DEFAULT_DOCK);
  });
  it('칸 옮기기: 끝에서는 그대로', () => {
    expect(moveDock(DEFAULT_DOCK, 0, 1)).toEqual(['calendar', 'home', 'chart', 'budget', 'calc', 'more']);
    expect(moveDock(DEFAULT_DOCK, 0, -1)).toEqual(DEFAULT_DOCK);
    expect(moveDock(DEFAULT_DOCK, 5, 1)).toEqual(DEFAULT_DOCK);
  });
  it('켜질 칸: 같은 화면, 세액공제는 연금 칸', () => {
    expect(activeDockId(DEFAULT_DOCK, 'chart')).toBe('chart');
    expect(activeDockId(['assets', ...DEFAULT_DOCK.slice(1)], 'tax')).toBe('assets');
  });
  it('독에 없는 화면(세액공제·검색·설정·가져오기·반복·연금)은 「더」 칸이 켜짐', () => {
    for (const v of ['tax', 'search', 'settings', 'import', 'recurring', 'assets']) expect(activeDockId(DEFAULT_DOCK, v)).toBe('more');
  });
  it('「더」를 뺀 배치: 독에 있는 화면은 그 칸, 없는 화면은 켜지는 칸 없음', () => {
    const noMore = ['home', 'calendar', 'chart', 'budget', 'calc', 'settings'];
    expect(activeDockId(noMore, 'settings')).toBe('settings');
    expect(activeDockId(noMore, 'search')).toBeNull();
    expect(activeDockId(noMore, 'tax')).toBeNull();
  });
});

describe('아래 독 HTML', () => {
  const mid = '<button class="fab" data-action="add" aria-label="기록 추가 (지출·수입)">컵</button>';
  it('옆 3칸 + 가운데 기록 + 옆 3칸, 지금 화면은 aria-current', () => {
    const html = dockHtml({ view: 'calendar', order: DEFAULT_DOCK, mid });
    const order = [...html.matchAll(/data-dock="(\w+)"|class="fab"/g)].map((m) => m[1] ?? 'fab');
    expect(order).toEqual(['home', 'calendar', 'chart', 'fab', 'budget', 'calc', 'more']);
    expect(html).toContain('data-nav="home"');
    expect(html).toContain('data-action="calc"');
    expect(html).toContain('data-action="dock-more"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/data-dock="calendar" data-nav="calendar" aria-current="page"/);
    expect(html).toContain('aria-label="주요 화면"');
    expect(html).toContain('id="dock-hint"');
  });
  it('독에 없는 화면에서는 「더」가 켜지고 접근 이름에 지금 화면을 알림(메뉴 단추라 aria-current="true")', () => {
    const html = dockHtml({ view: 'tax', order: DEFAULT_DOCK, mid });
    expect(html).toMatch(/class="tab dock-key on" data-dock="more" [^>]*aria-current="true" aria-label="더 보기\(모든 메뉴\) \(지금 화면: 세액공제\)"/);
    expect(html).not.toContain('aria-current="page"');
    const noMore = dockHtml({ view: 'tax', order: ['home', 'calendar', 'chart', 'budget', 'calc', 'search'], mid });
    expect(noMore).not.toMatch(/dock-key on/);
    expect(noMore).not.toContain('aria-current');
  });
  it('보이는 글자가 접근 이름에 들어 있음(WCAG 2.5.3)', () => {
    for (const t of DOCK_POOL) {
      const k = dockKey(t.id, false);
      const name = k.match(/aria-label="([^"]+)"/)[1];
      expect(name).toContain(t.label);
    }
  });
  it('모든 메뉴는 더 칸을 빼고 모든 화면·계산기', () => {
    const html = dockMenuHtml({ view: 'assets', features: { recurring: true } });
    expect(html).not.toContain('data-menu="more"');
    for (const id of ['home', 'calendar', 'chart', 'budget', 'calc', 'assets', 'tax', 'search', 'recurring', 'import', 'settings']) expect(html).toContain(`data-menu="${id}"`);
    expect(html).toMatch(/data-menu="assets" aria-current="page"/);
  });
  it('배치 바꾸기: 6칸 선택 + 앞뒤, 「더」를 빼면 안내', () => {
    const html = dockEditHtml({ draft: ['home', 'calendar', 'chart', 'budget', 'calc', 'assets'] });
    expect(html.match(/<select /g)).toHaveLength(6);
    expect(html).toContain('data-dock-nomore');
    expect(dockEditHtml({ draft: DEFAULT_DOCK })).not.toContain('data-dock-nomore');
  });
  it('길게 누르기는 교무수첩과 같은 0.52초·10px', () => { expect(HOLD_MS).toBe(520); expect(MOVE_PX).toBe(10); });
  it('main.js 는 독을 어느 화면에서나 그리고(연금 포함), 가운데는 쨈 컵 기록 버튼', () => {
    const src = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    expect(src).toContain("${nav ? tabBar(m) : ''}");
    expect(src).toMatch(/const nav = !ask;/);
    expect(src).toMatch(/mid: `<button class="fab" data-action="add" aria-label="기록 추가 \(지출·수입\)">\$\{FAB_INNER\}<\/button>`/);
  });
  it('아이폰 홈 인디케이터 자리(safe-area)를 독 아래 여백에 둠', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.tabbar \{[^}]*margin: 0 max\(8px, env\(safe-area-inset-right\)\) max\(8px, env\(safe-area-inset-bottom\)\)/);
  });
});
