import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createNavHistory, parentView, TAB_VIEWS } from './navBack.js';
import { topBar } from '../ui/views.js';

function fakeHistory(url = 'http://app.local/gagyebu/') {
  const entries = [{ url, state: { gagyebuExit: 1 } }];
  let index = 0;
  return {
    pushState(state, _t, next) {
      entries.splice(index + 1);
      entries.push({ state, url: next || entries[index].url });
      index += 1;
    },
    replaceState(state, _t, next) {
      entries[index] = { state: state ?? entries[index].state, url: next || entries[index].url };
    },
    go(delta) { index = Math.max(0, Math.min(entries.length - 1, index + delta)); },
    back() { this.go(-1); },
    get href() { return entries[index].url; },
    get state() { return entries[index].state; },
    get index() { return index; },
    get length() { return entries.length; },
  };
}

const urlFor = (view) => (view === 'home' ? 'http://app.local/gagyebu/' : `http://app.local/gagyebu/#${view}`);

function setup(start = 'home') {
  const history = fakeHistory();
  const stays = [];
  const nav = createNavHistory(history, urlFor, { onStay: () => stays.push(history.href) });
  nav.adopt(start);
  const back = (extra = {}) => {
    history.back();
    return nav.onPop({ exitReady: true, ...extra });
  };
  const flush = () => nav.onPop({ exitReady: true });
  return { history, nav, back, flush, stays };
}

describe('뒤로 가기 동선', () => {
  test('하위 화면의 부모', () => {
    expect(TAB_VIEWS).toEqual(['home', 'calendar', 'chart', 'budget']);
    expect(parentView('settings')).toBe('home');
    expect(parentView('search')).toBe('home');
    expect(parentView('import')).toBe('settings');
    expect(parentView('recurring')).toBe('settings');
    expect(parentView('assets')).toBe('settings');
    expect(parentView('tax')).toBe('assets');
  });

  test('설정에서 뒤로 가면 홈이고, 홈에서 한 번 더 누르면 종료 확인이다', () => {
    const { history, nav, back, flush } = setup();
    expect(nav.show('settings')).toBe('push');
    expect(history.href).toContain('#settings');
    history.back();
    expect(flush()).toEqual({ kind: 'view', view: 'home' });
    expect(history.state).toEqual({ gagyebuExit: 1 });
    history.back();
    expect(flush()).toEqual({ kind: 'exit' });
    expect(back).toBeTypeOf('function');
  });

  test('센티널이 없으면 홈에서 뒤로 가기를 막지 않는다', () => {
    const { history, nav } = setup();
    history.back();
    expect(nav.onPop({ exitReady: false })).toEqual({ kind: 'leave' });
  });

  test('달력·차트는 한 층이고 뒤로 가면 홈이다', () => {
    const { history, nav, flush } = setup();
    expect(nav.show('calendar')).toBe('tab');
    expect(nav.show('chart')).toBe('tab');
    expect(history.href).toContain('#chart');
    expect(nav.snapshot().stack).toEqual([{ type: 'tab', view: 'chart' }]);
    history.back();
    expect(flush()).toEqual({ kind: 'view', view: 'home' });
    history.back();
    expect(flush()).toEqual({ kind: 'exit' });
  });

  test('탭에서 홈 버튼을 누르면 그 층을 걷어 낸다', () => {
    const { history, nav, flush } = setup();
    nav.show('budget');
    expect(nav.show('home')).toBe('back');
    expect(flush().kind).toBe('ignore');
    expect(nav.snapshot().current).toBe('home');
    expect(history.href).toBe('http://app.local/gagyebu/');
    history.back();
    expect(flush()).toEqual({ kind: 'exit' });
  });

  test('설정 위에 올린 자산·세액공제는 한 칸씩 돌아온다', () => {
    const { history, nav, flush } = setup();
    nav.show('settings');
    nav.show('assets');
    nav.show('tax');
    history.back();
    expect(flush()).toEqual({ kind: 'view', view: 'assets' });
    history.back();
    expect(flush()).toEqual({ kind: 'view', view: 'settings' });
    expect(nav.show('home')).toBe('back');
    expect(flush().kind).toBe('ignore');
    expect(nav.snapshot().current).toBe('home');
    expect(history.state?.gagyebuExit).toBe(1);
  });

  test('검색을 설정에서 열어도 홈 버튼은 홈으로 간다', () => {
    const { nav, flush } = setup();
    nav.show('settings');
    nav.show('search');
    expect(nav.show('home')).toBe('back');
    expect(flush()).toMatchObject({ kind: 'ignore', view: 'home' });
    expect(nav.snapshot().stack).toEqual([]);
  });

  test('시트와 확인 창은 화면보다 먼저 닫힌다', () => {
    const { history, nav, flush } = setup();
    nav.show('settings');
    nav.pushModal('sheet');
    nav.pushModal('dialog');
    history.back();
    expect(flush({ dialog: true, sheet: true })).toEqual({ kind: 'dialog' });
    expect(nav.snapshot().stack.at(-1)).toEqual({ type: 'modal', kind: 'sheet' });
    history.back();
    expect(flush({ sheet: true })).toEqual({ kind: 'sheet' });
    history.back();
    expect(flush()).toEqual({ kind: 'view', view: 'home' });
  });

  test('버튼으로 시트를 닫으면 뒤로 가기 한 칸을 무시한다', () => {
    const { nav, flush } = setup();
    nav.pushModal('sheet');
    expect(nav.closeModal()).toBe(true);
    expect(flush()).toMatchObject({ kind: 'ignore' });
    expect(nav.snapshot().stack).toEqual([]);
  });

  test('가져오기 단계는 뒤로 가면 이전 단계, 처음 단계의 다음은 처음부터', () => {
    const { history, nav, flush } = setup();
    nav.show('settings');
    nav.show('import');
    nav.pushStep(2);
    nav.pushStep(3);
    history.back();
    expect(flush()).toEqual({ kind: 'import-step', step: 2 });
    history.back();
    expect(flush()).toEqual({ kind: 'import-reset' });
    expect(nav.snapshot().current).toBe('import');
  });

  test('가져오기에서 목록으로 가면 달력이 되고 그 아래는 설정이다', () => {
    const { history, nav, flush } = setup();
    nav.show('settings');
    nav.show('import');
    nav.pushStep(2);
    expect(nav.show('calendar')).toBe('back');
    expect(flush().kind).toBe('ignore');
    expect(history.href).toContain('#calendar');
    history.back();
    expect(flush()).toEqual({ kind: 'view', view: 'settings' });
  });

  test('설정 헤더에 홈으로 가는 버튼이 있다', () => {
    const html = topBar({
      offline: false, viewYm: '2026-10', curYm: '2026-10', sd: 1, dark: false,
    }, { month: false, back: { to: 'home', label: '홈으로' } });
    expect(html).toContain('data-nav="home"');
    expect(html).toContain('aria-label="홈으로"');
    expect(html).toContain('>홈<');
  });

  test('앱은 뒤로 가기를 시트·확인 창·하위 화면·종료 순으로 처리한다', () => {
    const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    const sheet = readFileSync(new URL('../ui/sheet.js', import.meta.url), 'utf8');
    expect(main).toContain('nav.onPop');
    expect(main).toContain("closeSheet({ fromPop: true })");
    expect(main).toContain('dismissTopModal');
    expect(main).toContain("label: '홈으로'");
    expect(main).not.toMatch(/history\.pushState/);
    expect(sheet).not.toContain('popstate');
    expect(sheet).toContain('onHistory');
  });
});
