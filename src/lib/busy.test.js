// @vitest-environment happy-dom
// QA 4차 4-1: 로그인 뒤 늘 DOM에 있는 빈 입력 시트(role="dialog") 때문에 '입력 중'이 늘 참이던 문제.
// 실제 화면 구조(initSheet가 넣는 빈 시트, confirmDialog가 만드는 대화상자)로 판단을 확인해요.
// BUSY_TEST_OLD=1 이면 수정 전 main.js의 판단식으로 같은 검사를 돌려요 → 빈 시트·열었다 닫은 시트·닫힌 대화상자·빈 입력 칸 4개가 실패(수정 전 코드에서 실패하는 검사).
import { describe, it, expect, beforeEach } from 'vitest';
import { initSheet, openSheet, closeSheet, isSheetOpen } from '../ui/sheet.js';
import { confirmDialog } from '../ui/util.js';
import { isBusyNow } from './busy.js';

const OLD = process.env.BUSY_TEST_OLD === '1';
// 수정 전(6fdfed9) main.js:593-594 그대로
const oldBusy = ({ signedIn, sheetOpen, importing }) => signedIn && (sheetOpen || !!document.querySelector('[role=alertdialog],[role=dialog]')
  || importing || !!(document.activeElement?.matches?.('input,textarea') && document.activeElement.value));
const busy = (o = {}) => (OLD ? oldBusy : isBusyNow)({ doc: document, signedIn: true, sheetOpen: isSheetOpen(), importing: false, ...o });

const STATE = { categories: [{ id: 'food', name: '식비', emoji: '🍚', kind: 'expense' }], accounts: [{ id: 'cash', name: '현금', type: 'cash' }], txs: [], rules: [], user: { uid: 'u' } };
let inited = false;
beforeEach(() => {
  closeSheet();
  document.querySelectorAll('[role=alertdialog]').forEach((d) => d.parentElement.remove());
  if (!document.getElementById('app')) { const app = document.createElement('div'); app.id = 'app'; document.body.append(app); }
  document.getElementById('app').innerHTML = '<main><input id="search" type="search" /></main>';
  if (!inited) { initSheet({ getState: () => STATE, onSave: () => {}, onDelete: () => {} }); inited = true; }
});

describe('isBusyNow: 실제 화면 구조', () => {
  it('로그인 뒤 빈 입력 시트(role=dialog)가 DOM에 있어도 닫혀 있으면 입력 중이 아님', () => {
    expect(document.querySelector('#sheet-root .sheet[role=dialog]')).not.toBeNull();
    expect(isSheetOpen()).toBe(false);
    expect(busy()).toBe(false);
  });
  it('시트를 열었다 닫은 뒤에도 입력 중이 아님', () => {
    openSheet(); expect(busy()).toBe(true);
    closeSheet(); expect(busy()).toBe(false);
  });
  it('시트가 열려 있으면 입력 중', () => {
    openSheet(); expect(busy()).toBe(true);
  });
  it('확인 대화상자가 떠 있으면 입력 중, 닫히면 아님', async () => {
    const p = confirmDialog({ title: '지울까요?' });
    expect(busy()).toBe(true);
    document.querySelector('[role=alertdialog] [data-v="0"]').click(); await p;
    expect(busy()).toBe(false);
  });
  it('값이 있는 입력 칸에 커서가 있으면 입력 중, 비어 있으면 아님', () => {
    const i = document.getElementById('search'); i.focus();
    expect(busy()).toBe(false);
    i.value = '점심'; expect(busy()).toBe(true);
  });
  it('가져오기 진행 중이면 입력 중, 로그인 전 화면은 늘 아님', () => {
    expect(busy({ importing: true })).toBe(true);
    openSheet(); expect(busy({ signedIn: false })).toBe(false);
  });
});
