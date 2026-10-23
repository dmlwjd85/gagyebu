import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  shouldArmExitGuard, planExitPop, viewChangeHistoryMode, leaveHistoryDelta, createExitGuard,
  isExitDismissGesture, EXIT_CONFIRM_TITLE,
} from './exitGuard.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fakeHistory(url = 'http://app.local/gagyebu/') {
  const entries = [{ url, state: null }];
  let index = 0;
  return {
    pushState(state, _title, next) {
      entries.splice(index + 1);
      entries.push({ state, url: next || entries[index].url });
      index += 1;
    },
    replaceState(state, _title, next) {
      entries[index] = { state, url: next || entries[index].url };
    },
    go(delta) {
      index = Math.max(0, Math.min(entries.length - 1, index + delta));
    },
    back() { this.go(-1); },
    get index() { return index; },
    get length() { return entries.length; },
    get href() { return entries[index].url; },
    get state() { return entries[index].state; },
  };
}

const click = (target) => ({ type: 'click', target });

describe('종료 확인 가드', () => {
  test('문구는 종료할까요?', () => {
    expect(EXIT_CONFIRM_TITLE).toBe('종료할까요?');
  });

  test('로그인 전·리다이렉트 처리 중·나가는 중에는 가드를 켜지 않는다', () => {
    expect(shouldArmExitGuard({ loggedIn: false })).toBe(false);
    expect(shouldArmExitGuard({ loggedIn: true, redirectPending: true })).toBe(false);
    expect(shouldArmExitGuard({ loggedIn: true, leaving: true })).toBe(false);
    expect(shouldArmExitGuard({ loggedIn: true })).toBe(true);
  });

  test('탭 이동은 replace 만 하고, 센티널이 없으면 뒤로가기를 막지 않으며, 모달은 닫지 않는다', () => {
    expect(viewChangeHistoryMode()).toBe('replace');
    expect(planExitPop({ armed: true, pushed: true, modalOpen: true }).closeModal).toBe(false);
    expect(planExitPop({ armed: true, pushed: true, confirming: true })).toEqual({ trap: true, confirm: false, closeModal: false });
    expect(planExitPop({ armed: true, pushed: false }).trap).toBe(false);
    expect(planExitPop({ armed: true, pushed: true, redirectPending: true }).trap).toBe(false);
    expect(planExitPop({ armed: false, pushed: true }).trap).toBe(false);
    expect(leaveHistoryDelta()).toBe(-1);
  });

  test('취소·배경·Escape 만 다시 깔고, 종료 버튼은 다시 깔지 않는다', () => {
    const cancel = { nodeType: 1, closest: (s) => (s === '[data-v="0"]' ? {} : null), classList: { contains: () => false } };
    const ok = { nodeType: 1, closest: () => null, classList: { contains: () => false } };
    const backdrop = { nodeType: 1, closest: () => null, classList: { contains: (c) => c === 'dlg-wrap' } };
    const title = { nodeType: 1, closest: () => null, classList: { contains: () => false } };
    expect(isExitDismissGesture(click(cancel))).toBe(true);
    expect(isExitDismissGesture(click(backdrop))).toBe(true);
    expect(isExitDismissGesture({ type: 'keydown', key: 'Escape' })).toBe(true);
    expect(isExitDismissGesture(click(ok))).toBe(false);
    expect(isExitDismissGesture(click(title))).toBe(false);
    expect(isExitDismissGesture({ type: 'keydown', key: 'Enter' })).toBe(false);
  });

  test('로그인 직후에는 히스토리를 넣지 않고, 첫 제스처에서만 센티널을 넣는다', () => {
    const history = fakeHistory();
    const guard = createExitGuard({ history, confirm: () => Promise.resolve(false) });
    guard.noteStay('http://app.local/gagyebu/#budget');
    guard.sync({ loggedIn: true });
    expect(history.length).toBe(1);
    expect(guard.onUserGesture()).toBe(true);
    expect(history.length).toBe(2);
    expect(history.state).toEqual({ gagyebuExit: 1 });
    expect(guard.onUserGesture()).toBe(false);
    expect(history.length).toBe(2);
  });

  test('제스처 없이 뒤로가면 확인을 열지 않는다', () => {
    const history = fakeHistory();
    let asks = 0;
    const guard = createExitGuard({
      history,
      confirm: () => { asks += 1; return Promise.resolve(false); },
    });
    guard.noteStay('http://app.local/gagyebu/');
    guard.sync({ loggedIn: true });
    history.back();
    expect(guard.onPopState()).toEqual({ trap: false, confirm: false, closeModal: false });
    expect(asks).toBe(0);
    expect(history.length).toBe(1);
  });

  test('제스처로 깐 센티널을 뒤로가면 확인을 한 번만 열고, 그 안에서 다시 넣지 않는다', async () => {
    const history = fakeHistory();
    let asks = 0;
    const guard = createExitGuard({
      history,
      confirm: () => { asks += 1; return new Promise(() => {}); },
      closeWindow() { throw new Error('취소했는데 닫음'); },
      schedule(fn) { fn(); },
    });
    guard.noteStay('http://app.local/gagyebu/#budget');
    guard.sync({ loggedIn: true });
    guard.onUserGesture();
    history.back();
    expect(guard.onPopState()).toMatchObject({ trap: true, confirm: true, closeModal: false });
    expect(history.index).toBe(0);
    expect(history.href).toBe('http://app.local/gagyebu/');
    expect(guard.onUserGesture()).toBe(false);
    expect(history.index).toBe(0);
    expect(history.state).toBe(null);
    history.back();
    expect(guard.onPopState().trap).toBe(false);
    await flush();
    expect(asks).toBe(1);
  });

  test('취소를 그 클릭 안에서 다시 깔면 같은 화면으로 돌아오고, 종료 클릭은 한 칸만 나간다', async () => {
    const history = fakeHistory('http://prev.example/a');
    history.pushState(null, '', 'http://prev.example/b');
    history.pushState(null, '', 'http://app.local/gagyebu/');
    let closed = 0;
    let decide = () => {};
    const guard = createExitGuard({
      history,
      confirm: () => new Promise((resolve) => { decide = resolve; }),
      closeWindow: () => { closed += 1; },
      isHidden: () => false,
      schedule(fn) { fn(); },
    });
    guard.noteStay('http://app.local/gagyebu/#home');
    guard.sync({ loggedIn: true });
    guard.onUserGesture();
    history.back();
    guard.onPopState();
    await flush();
    expect(guard.isConfirming()).toBe(true);
    expect(guard.rearm()).toBe(true);
    expect(history.href).toBe('http://app.local/gagyebu/#home');
    expect(history.length).toBe(4);
    decide(false);
    await flush();
    expect(guard.isConfirming()).toBe(false);
    expect(closed).toBe(0);
    expect(history.href).toBe('http://app.local/gagyebu/#home');

    history.back();
    guard.onPopState();
    await flush();
    expect(guard.onUserGesture()).toBe(false);
    decide(true);
    await flush();
    expect(history.href).toBe('http://prev.example/b');
    expect(closed).toBe(1);
    expect(guard.isLeaving()).toBe(true);
    expect(guard.onPopState().trap).toBe(false);
  });

  test('이전 페이지가 없으면 종료는 그 자리에 남고 창 닫기를 시도한다', async () => {
    const history = fakeHistory('http://app.local/gagyebu/');
    let closed = 0;
    const guard = createExitGuard({
      history,
      confirm: () => Promise.resolve(true),
      closeWindow: () => { closed += 1; },
      isHidden: () => false,
      schedule(fn) { fn(); },
    });
    guard.noteStay('http://app.local/gagyebu/');
    guard.sync({ loggedIn: true });
    guard.onUserGesture();
    history.back();
    guard.onPopState();
    await flush();
    expect(history.href).toBe('http://app.local/gagyebu/');
    expect(history.index).toBe(0);
    expect(closed).toBe(1);
  });

  test('Google 리다이렉트가 끝나기 전에는 제스처로도 히스토리를 넣지 않는다', () => {
    const history = fakeHistory();
    const guard = createExitGuard({ history, confirm: () => Promise.resolve(false) });
    guard.sync({ loggedIn: true, redirectPending: true });
    expect(guard.onUserGesture()).toBe(false);
    expect(history.length).toBe(1);
    expect(guard.onPopState().trap).toBe(false);
  });

  test('화면 주소만 바꿀 때는 센티널을 더 쌓지 않고, 바꿔 둔 칸도 뒤로가기에서 확인한다', async () => {
    const history = fakeHistory();
    let asks = 0;
    const guard = createExitGuard({
      history,
      confirm: () => { asks += 1; return new Promise(() => {}); },
    });
    guard.noteStay('http://app.local/gagyebu/');
    guard.sync({ loggedIn: true });
    guard.onUserGesture();
    guard.noteStay('http://app.local/gagyebu/#calendar');
    history.replaceState(null, '', 'http://app.local/gagyebu/#calendar');
    expect(history.length).toBe(2);
    expect(history.state).toBe(null);
    history.back();
    expect(guard.onPopState().trap).toBe(true);
    await flush();
    expect(asks).toBe(1);
    expect(viewChangeHistoryMode()).toBe('replace');
  });

  test('앱은 replaceState·인앱 대화상자만 쓰고, 제스처에서만 센티널을 깐다', () => {
    const main = readFileSync('src/main.js', 'utf8');
    const data = readFileSync('src/data.js', 'utf8');
    const guardSrc = readFileSync('src/lib/exitGuard.js', 'utf8');
    const syncFn = guardSrc.slice(guardSrc.indexOf('function sync'), guardSrc.indexOf('function onUserGesture'));
    const popFn = guardSrc.slice(guardSrc.indexOf('function onPopState'), guardSrc.indexOf('function leave'));
    expect(syncFn).not.toContain('pushSentinel');
    expect(popFn).not.toContain('pushSentinel');
    // 센티널 push 는 가드가 제스처에서만. 화면·시트 기록은 navBack 이 맡는다.
    expect(main).not.toMatch(/history\.pushState/);
    expect(main).toContain('nav.show');
    expect(readFileSync('src/lib/navBack.js', 'utf8')).toContain('history.pushState');
    expect(main).toContain('exitGuard.onUserGesture');
    expect(main).toContain('exitGuard.claimPushed');
    expect(main).toContain('exitGuard.forgetSentinel');
    expect(main).toContain('exitGuard.rearm');
    expect(main).toContain('isExitDismissGesture');
    expect(main).toContain("addEventListener('pointerdown', onNavGesture, true)");
    expect(main).toContain('nav.atExitRoot()');
    expect(main).toContain('confirmDialog({ title: EXIT_CONFIRM_TITLE');
    expect(main).toContain('whenAuthRedirectSettled');
    expect(main).not.toMatch(/window\.confirm\s*\(/);
    expect(data).toContain('whenAuthRedirectSettled');
    expect(data).toMatch(/getRedirectResult\(auth,\s*browserPopupRedirectResolver\)/);
    expect(readFileSync('src/ui/sheet.js', 'utf8')).not.toContain('popstate');
  });
});
