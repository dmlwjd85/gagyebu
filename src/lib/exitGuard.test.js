import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  shouldArmExitGuard, planExitPop, viewChangeHistoryMode, leaveHistoryDelta, createExitGuard, EXIT_CONFIRM_TITLE,
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

  test('탭 이동은 replace 만 하고, 모달은 이 가드가 닫지 않는다', () => {
    expect(viewChangeHistoryMode()).toBe('replace');
    expect(planExitPop({ armed: true, modalOpen: true }).closeModal).toBe(false);
    expect(planExitPop({ armed: true, confirming: true })).toEqual({ trap: true, confirm: false, closeModal: false });
    expect(planExitPop({ armed: true, redirectPending: true }).trap).toBe(false);
    expect(planExitPop({ armed: false }).trap).toBe(false);
    expect(leaveHistoryDelta({ repushedSentinel: true })).toBe(-2);
  });

  test('뒤로가기면 센티널을 다시 쌓고 확인을 한 번만 연다', async () => {
    const history = fakeHistory();
    let asks = 0;
    const guard = createExitGuard({
      history,
      confirm: () => { asks += 1; return Promise.resolve(false); },
      closeWindow() { throw new Error('취소했는데 닫음'); },
      schedule(fn) { fn(); },
    });
    guard.noteStay('http://app.local/gagyebu/#budget');
    guard.sync({ loggedIn: true });
    expect(history.length).toBe(2);
    history.back();
    expect(guard.onPopState()).toMatchObject({ trap: true, confirm: true, closeModal: false });
    expect(history.href).toBe('http://app.local/gagyebu/#budget');
    expect(history.length).toBe(2);
    history.back();
    guard.onPopState();
    await flush();
    expect(asks).toBe(1);
    expect(history.href).toBe('http://app.local/gagyebu/#budget');
  });

  test('종료를 고르면 두 칸 뒤로 가고, 아직 보이면 창 닫기를 시도한다', async () => {
    const history = fakeHistory('http://prev.example/');
    history.pushState(null, '', 'http://app.local/gagyebu/');
    let closed = 0;
    const guard = createExitGuard({
      history,
      confirm: () => Promise.resolve(true),
      closeWindow: () => { closed += 1; },
      isHidden: () => false,
      schedule(fn) { fn(); },
    });
    guard.noteStay('http://app.local/gagyebu/#home');
    guard.sync({ loggedIn: true });
    history.back();
    guard.onPopState();
    await flush();
    expect(history.href).toBe('http://prev.example/');
    expect(closed).toBe(1);
    expect(guard.isLeaving()).toBe(true);
    expect(guard.onPopState().trap).toBe(false);
  });

  test('Google 리다이렉트가 끝나기 전에는 히스토리를 넣지 않는다', () => {
    const history = fakeHistory();
    const guard = createExitGuard({ history, confirm: () => Promise.resolve(false) });
    guard.sync({ loggedIn: true, redirectPending: true });
    expect(history.length).toBe(1);
    expect(guard.onPopState().trap).toBe(false);
  });

  test('화면 주소만 바꿀 때는 센티널을 더 쌓지 않는다', () => {
    const history = fakeHistory();
    const guard = createExitGuard({ history, confirm: () => Promise.resolve(false) });
    guard.noteStay('http://app.local/gagyebu/');
    guard.sync({ loggedIn: true });
    const n = history.length;
    guard.noteStay('http://app.local/gagyebu/#calendar');
    history.replaceState(null, '', 'http://app.local/gagyebu/#calendar');
    expect(history.length).toBe(n);
    expect(viewChangeHistoryMode()).toBe('replace');
  });

  test('앱은 replaceState·인앱 대화상자만 쓰고, 로그인 리다이렉트 뒤에 가드를 켠다', () => {
    const main = readFileSync('src/main.js', 'utf8');
    const data = readFileSync('src/data.js', 'utf8');
    expect(main).toContain('history.replaceState');
    expect(main).not.toMatch(/history\.pushState/);
    expect(main).toContain('confirmDialog({ title: EXIT_CONFIRM_TITLE');
    expect(main).toContain('whenAuthRedirectSettled');
    expect(main).not.toMatch(/window\.confirm\s*\(/);
    expect(data).toContain('whenAuthRedirectSettled');
    expect(data).toMatch(/getRedirectResult\(auth,\s*browserPopupRedirectResolver\)/);
    expect(readFileSync('src/ui/sheet.js', 'utf8')).not.toContain('popstate');
  });
});
