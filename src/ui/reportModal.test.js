// @vitest-environment jsdom
// 리포트 창·기록 시트·대화상자가 겹칠 때(QA 4차 정식 R1)와 리포트 창 버튼(공유 실패 알림·닫으면 다시 그리기 멈춤, R4)을 실제 DOM 으로 확인
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '../lib/defaults.js';
import { initSheet, openSheet, closeSheet, isSheetOpen } from './sheet.js';
import { lockApp, confirmDialog, dismissTopModal, hasModal } from './util.js';
import { reportRunner, openAfterLoad } from './reportRun.js';
import { openReport } from './report.js';

const state = { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, features: { sms: false, txOwner: false, recurring: false }, txs: [] };
const m = { periodTxs: [], catMap: new Map(), trend: [], tot: { income: 0, expense: 0, saved: 0 }, viewYm: '2026-10', noSpend: 0, streak: 0, dark: false };
let painted = 0, arrive = 0;
const app = () => document.getElementById('app');
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeAll(() => {
  window.matchMedia ??= (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  document.body.innerHTML = '<div id="app"><button data-action="report"><span data-report-icon>📤</span><span data-report-label>10월 리포트 카드 만들기</span></button></div>';
  initSheet({ getState: () => state, onSave() {}, onDelete() {} });
  // 가짜 캔버스(그린 횟수를 셈)·가짜 글꼴(arrive ms 에 다 옴)
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'measureText' ? (t) => ({ width: String(t).length * 20 }) : /^create.*Gradient$/.test(k) ? () => ({ addColorStop() {} }) : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  HTMLCanvasElement.prototype.getContext = () => ctx;
  HTMLCanvasElement.prototype.toBlob = (cb) => { painted += 1; cb(new Blob([`png${painted}`], { type: 'image/png' })); };
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: () => new Promise((r) => setTimeout(r, Math.max(0, arrive - Date.now()))), check: () => Date.now() >= arrive } });
  URL.createObjectURL = () => 'blob:x'; URL.revokeObjectURL = () => {};
});
beforeEach(() => { vi.useFakeTimers({ now: 0 }); painted = 0; });
afterEach(() => {
  if (isSheetOpen()) closeSheet();
  while (hasModal()) dismissTopModal();
  document.querySelectorAll('.dlg-wrap').forEach((w) => w.querySelector('[data-rp="close"]')?.click());
  vi.useRealTimers(); delete navigator.share; delete navigator.canShare;
});

describe('뒤 화면 잠금은 센다(QA 4차 정식 R1)', () => {
  test('둘을 잠그고 하나만 풀면 그대로 잠김, 마지막을 풀어야 풀림. 같은 푸는 함수를 두 번 불러도 한 번만 셈', () => {
    const a = lockApp('dialog'), b = lockApp('report');
    a(); a();
    expect(app().inert).toBe(true);
    b();
    expect(app().inert).toBe(false);
  });
  test('기록 시트 위 대화상자(삭제 확인 등)를 닫아도 시트가 열려 있으면 잠김 유지', async () => {
    openSheet(); expect(app().inert).toBe(true);
    const unlock = lockApp('dialog'); unlock();
    expect(app().inert).toBe(true);
    closeSheet(); expect(app().inert).toBe(false);
  });
});

describe('리포트를 만드는 중 다른 창이 열리면 취소(QA 4차 정식 R1)', () => {
  const runner = () => reportRunner({ root: document, open: openAfterLoad(async () => ({ openReport }), { toast() {} }) });
  test('글꼴 기다리는 중 기록 시트를 열면 리포트 창이 뜨지 않고, 시트를 닫으면 뒤 화면이 풀린다', async () => {
    arrive = 6000; const r = runner();
    const job = r.run(m, 'chart'); await flush();
    expect(r.busy()).toBe(true);
    await vi.advanceTimersByTimeAsync(800);
    openSheet();
    await vi.advanceTimersByTimeAsync(7000); await job;
    expect(document.querySelector('.dlg-wrap')).toBe(null);
    expect(r.busy()).toBe(false);
    expect(app().inert).toBe(true); // 시트가 열려 있는 동안 잠김
    closeSheet();
    expect(app().inert).toBe(false);
  });
  test('확인 대화상자가 열려도 취소. 아무 창도 안 열리면 리포트 창이 뜨고 닫으면 풀린다', async () => {
    arrive = 6000; const r = runner();
    const job = r.run(m, 'chart'); await vi.advanceTimersByTimeAsync(500);
    confirmDialog({ title: '지울까요?' });
    await vi.advanceTimersByTimeAsync(7000); await job;
    expect(document.querySelector('.dlg-wrap [data-rp]')).toBe(null);
    dismissTopModal(); expect(app().inert).toBe(false);
    const j2 = r.run(m, 'chart'); await vi.advanceTimersByTimeAsync(7000); await j2;
    expect(document.querySelector('[data-rp="close"]')).not.toBe(null);
    expect(app().inert).toBe(true);
    document.querySelector('[data-rp="close"]').click();
    expect(app().inert).toBe(false);
  });
  test('report.js 를 받는 동안 취소되면 받은 뒤에도 열지 않는다', async () => {
    let loaded; const opened = [];
    const open = openAfterLoad(() => new Promise((r) => { loaded = () => r({ openReport: (...a) => opened.push(a) }); }), { toast: 't' });
    const ctl = new AbortController();
    const p = open(m, { signal: ctl.signal });
    ctl.abort(); loaded(); await p;
    expect(opened).toEqual([]);
    const ctl2 = new AbortController(); const p2 = open(m, { signal: ctl2.signal }); loaded(); await p2;
    expect(opened).toHaveLength(1); expect(opened[0][1]).toMatchObject({ toast: 't', signal: ctl2.signal });
  });
});

describe('리포트 창 버튼(QA 4차 정식 R4)', () => {
  const show = async (share) => {
    arrive = 0; const toasts = [];
    navigator.canShare = () => true; navigator.share = share;
    const p = openReport(m, { toast: (t) => toasts.push(t) }); await vi.advanceTimersByTimeAsync(10); await p;
    return toasts;
  };
  test('공유가 거절되면 "공유하지 못했어요. 이미지 저장을 써 보세요." 를 알린다', async () => {
    const toasts = await show(() => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })));
    document.querySelector('[data-rp="share"]').click(); await vi.advanceTimersByTimeAsync(10);
    expect(toasts).toEqual(['공유하지 못했어요. 이미지 저장을 써 보세요.']);
  });
  test('공유 창을 사용자가 닫은 것(AbortError)은 알리지 않는다', async () => {
    const toasts = await show(() => Promise.reject(new DOMException('cancel', 'AbortError')));
    document.querySelector('[data-rp="share"]').click(); await vi.advanceTimersByTimeAsync(10);
    expect(toasts).toEqual([]);
  });
  test('글꼴이 늦을 때 3초 그림으로 연 창을 닫으면, 글꼴이 와도 다시 그리지 않는다(stop)', async () => {
    arrive = 5000;
    const p = openReport(m, { toast() {} }); await vi.advanceTimersByTimeAsync(3000); await p;
    expect(painted).toBe(1);
    document.querySelector('[data-rp="close"]').click();
    await vi.advanceTimersByTimeAsync(3000);
    expect(painted).toBe(1);
  });
});

test('리포트 이미지는 보통(400)·굵게(700) 두 굵기만 쓴다(500 같은 없는 굵기 금지, QA 4차 정식 R5). #app.inert 는 lockApp 만 바꾼다', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (f) => readFileSync(`${process.cwd()}/src/${f}`, 'utf8'); // jsdom 에서는 import.meta.url 이 file: 이 아님
  const rep = read('ui/report.js');
  const weights = [...rep.matchAll(/ctx\.font = `(\d+) /g)].map((x) => x[1]);
  expect(weights.length).toBeGreaterThan(3);
  expect(new Set(weights)).toEqual(new Set(['400', '700']));
  for (const f of ['ui/report.js', 'ui/sheet.js', 'ui/util.js', 'main.js']) {
    const src = read(f);
    expect(src.match(/\.inert = (true|false)/g) ?? []).toEqual(f === 'ui/util.js' ? ['.inert = true', '.inert = false'] : []);
  }
});
