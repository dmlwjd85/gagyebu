// @vitest-environment jsdom
// 뒤로 가기(popstate)가 시트를 실제로 닫는지. 소스 문자열만 보면 import 누락을 놓친다.
import { beforeAll, describe, expect, test } from 'vitest';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './defaults.js';
import { initSheet, isSheetOpen, openSheet } from '../ui/sheet.js';

const sheetState = {
  categories: DEFAULT_CATEGORIES,
  accounts: DEFAULT_ACCOUNTS,
  features: { sms: false, txOwner: false, recurring: false },
  txs: [],
};

function installMatchMedia() {
  if (typeof window.matchMedia === 'function') return;
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() { return false; },
  });
}

async function boot() {
  installMatchMedia();
  document.body.innerHTML = '<div id="app"></div>';
  await import('../main.js');
  const { nav, exitGuard } = globalThis.__gagyebuNav;
  initSheet({
    getState: () => sheetState,
    onSave() {},
    onDelete() {},
    onHistory(ev) {
      if (ev === 'open') nav.pushModal('sheet');
      if (ev === 'close') nav.closeModal();
    },
  });
  exitGuard.noteStay(location.href);
  exitGuard.sync({ loggedIn: true });
  exitGuard.onUserGesture();
  return { nav, exitGuard };
}

function press(key) {
  document.querySelector(`.key[data-key="${key}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

async function goBack() {
  const popped = new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(true), { once: true });
  });
  history.back();
  const fired = await Promise.race([
    popped,
    new Promise((resolve) => setTimeout(() => resolve(false), 300)),
  ]);
  if (!fired) window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('시트 열린 채 뒤로 가기', () => {
  let nav;

  beforeAll(async () => {
    ({ nav } = await boot());
  });

  test('금액 입력 시트는 닫히고 종료 확인은 뜨지 않는다', async () => {
    openSheet();
    expect(isSheetOpen()).toBe(true);
    for (const key of ['5', '0', '0', '0']) press(key);
    expect(document.querySelector('.amount-display')?.textContent).toMatch(/5,?000/);
    expect(nav.snapshot().stack.at(-1)).toEqual({ type: 'modal', kind: 'sheet' });

    await goBack();

    expect(isSheetOpen()).toBe(false);
    expect(document.body.textContent).not.toContain('종료할까요?');
    expect(document.querySelector('[role=alertdialog]')).toBeNull();
    expect(nav.snapshot().stack.some((x) => x.type === 'modal')).toBe(false);
  });

  test('거래 행에서 연 시트도 뒤로 가면 닫힌다', async () => {
    openSheet({
      id: 't1', kind: 'expense', amount: 5000, categoryId: 'food', date: '2026-10-23',
      accountId: 'cash', memo: '', createdAt: 1,
    });
    expect(isSheetOpen()).toBe(true);
    expect(document.querySelector('[data-del]')).toBeTruthy();

    await goBack();

    expect(isSheetOpen()).toBe(false);
    expect(document.body.textContent).not.toContain('종료할까요?');
    expect(document.querySelector('[role=alertdialog]')).toBeNull();
  });
});
