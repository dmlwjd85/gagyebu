import { describe, expect, test } from 'vitest';

if (!globalThis.localStorage) {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
}
import {
  ownerOf, ownerToWrite, ownerForSave, personTotals, jointNet, settleAmount, settleJoint, sanitizeOwnerRow, spouseLabel, splitMeOf,
} from './couple.js';
import { buildBackup, parseBackup } from './backup.js';
import { normalizeSettings, settingsForMode } from './modes.js';
import { homeView, calendarView, chartView, settingsView, ownerPickHtml } from '../ui/views.js';
import { smsTx } from '../ui/smsSheet.js';

const tx = (partial) => ({ amount: 1000, kind: 'expense', date: '2026-10-01', categoryId: 'food', ...partial });

describe('누구 돈 읽기·저장', () => {
  test('없는 필드는 나고, 원본은 그대로', () => {
    const row = tx({ id: 'old' });
    expect(ownerOf(row)).toBe('나');
    expect(ownerOf(null)).toBe('나');
    expect(ownerOf({ owner: '그외' })).toBe('나');
    expect(row.owner).toBeUndefined();
    expect(Object.keys(row)).toEqual(['amount', 'kind', 'date', 'categoryId', 'id']);
  });
  test('새 기록의 나는 필드를 만들지 않고, 있던 owner를 나로 바꿀 때는 나라고 적는다', () => {
    expect(ownerToWrite('나')).toBeUndefined();
    expect(ownerToWrite(undefined)).toBeUndefined();
    expect(ownerToWrite('배우자')).toBe('배우자');
    expect(ownerToWrite('공동')).toBe('공동');
    expect(ownerToWrite('friend')).toBeUndefined();
    expect(ownerForSave('나', {}, true)).toBeUndefined();
    expect(ownerForSave('나', { owner: '배우자' }, true)).toBe('나');
    expect(ownerForSave('공동', { owner: '배우자' }, true)).toBe('공동');
    expect(ownerForSave('나', { owner: '배우자' }, false)).toBe('배우자');
    expect(ownerForSave('공동', {}, false)).toBeUndefined();
  });
});

describe('사람별 합계', () => {
  test('없는 owner는 나, 배우자 입금은 배우자 수입', () => {
    const rows = [
      tx({ amount: 5000 }),
      tx({ amount: 2000000, kind: 'income', categoryId: 'salary' }),
      tx({ amount: 800000, kind: 'income', categoryId: 'salary', owner: '배우자' }),
      tx({ amount: 3000, owner: '배우자' }),
      tx({ amount: 10000, owner: '공동' }),
      tx({ amount: -2000, owner: '공동' }),
    ];
    const t = personTotals(rows);
    expect(t['나']).toEqual({ income: 2000000, expense: 5000, saved: 1995000 });
    expect(t['배우자']).toEqual({ income: 800000, expense: 3000, saved: 797000 });
    expect(t['공동']).toEqual({ income: 0, expense: 8000, saved: -8000 });
    expect(rows[0].owner).toBeUndefined();
  });
  test('소수 금액은 거절', () => {
    expect(() => personTotals([tx({ amount: 1.5 })])).toThrow(TypeError);
  });
});

describe('공동 지출 정산', () => {
  test('반올림은 0.5를 0에서 먼 정수로, 나머지는 배우자', () => {
    expect(settleAmount(100, 50)).toMatchObject({ me: 50, spouse: 50, owes: { from: '배우자', to: '나', amount: 50 } });
    expect(settleAmount(1, 50)).toMatchObject({ me: 1, spouse: 0, owes: null });
    expect(settleAmount(3, 50)).toMatchObject({ me: 2, spouse: 1, owes: { amount: 1 } });
    expect(settleAmount(101, 33)).toMatchObject({ me: 33, spouse: 68 });
    expect(settleAmount(100, 0)).toMatchObject({ me: 0, spouse: 100, owes: { from: '배우자', amount: 100 } });
    expect(settleAmount(100, 100)).toMatchObject({ me: 100, spouse: 0, owes: null });
    expect(settleAmount(-1, 50)).toMatchObject({ me: -1, spouse: 0, owes: null });
    expect(settleAmount(-3, 50)).toMatchObject({ me: -2, spouse: -1, owes: { from: '나', to: '배우자', amount: 1 } });
    expect(settleAmount(-100, 40)).toMatchObject({ me: -40, spouse: -60, owes: { from: '나', to: '배우자', amount: 60 } });
  });
  test('나의 부담과 배우자 부담의 합은 공동 순지출', () => {
    for (const joint of [-101, -3, -1, 0, 1, 2, 3, 50, 99, 100, 101, 10000]) {
      for (const pct of [0, 1, 33, 50, 60, 99, 100]) {
        const s = settleAmount(joint, pct);
        expect(s.me + s.spouse).toBe(joint);
        expect(Number.isInteger(s.me)).toBe(true);
        expect(Number.isInteger(s.spouse)).toBe(true);
        expect(s.splitSpouse).toBe(100 - pct);
      }
    }
  });
  test('공동 지출만 나누고 나·배우자·수입은 빼지 않는다', () => {
    const rows = [
      tx({ amount: 99999 }),
      tx({ amount: 5000, owner: '배우자' }),
      tx({ amount: 800000, kind: 'income', owner: '배우자' }),
      tx({ amount: 10000, owner: '공동' }),
      tx({ amount: -1000, owner: '공동' }),
      tx({ amount: 4000, kind: 'income', owner: '공동' }),
    ];
    const s = settleJoint(rows, 60);
    expect(jointNet(rows)).toBe(9000);
    expect(s.joint).toBe(9000);
    expect(s.me).toBe(5400);
    expect(s.spouse).toBe(3600);
    expect(s.owes).toEqual({ from: '배우자', to: '나', amount: 3600 });
  });
  test('비율이 정수가 아니면 거절', () => {
    expect(() => settleAmount(100, 50.5)).toThrow(TypeError);
    expect(() => settleAmount(100, -1)).toThrow(TypeError);
    expect(() => settleAmount(1.2, 50)).toThrow(TypeError);
  });
});

describe('백업의 owner', () => {
  test('새 백업은 owner·배우자 설정을 담고, 없는 거래는 필드를 만들지 않는다', () => {
    const b = buildBackup({
      transactions: [{ id: 'a', amount: 1, owner: '배우자' }, { id: 'b', amount: 2 }, { id: 'c', amount: 3, owner: 'friend' }],
      recurring: [{ id: 'r', name: '월세', owner: '공동' }],
      settings: { mode: 'couple', spouseName: '민지', splitMe: 60, theme: 'ocean' },
    }, new Date('2026-10-21T00:00:00Z'));
    expect(b.transactions[0].owner).toBe('배우자');
    expect(b.transactions[1].owner).toBeUndefined();
    expect(b.transactions[2].owner).toBeUndefined();
    expect(b.recurring[0].owner).toBe('공동');
    expect(b.settings).toMatchObject({ mode: 'couple', spouseName: '민지', splitMe: 60 });
    expect(b.settings.theme).toBeUndefined();
    const p = parseBackup(b);
    expect(p.transactions[0].owner).toBe('배우자');
    expect('owner' in p.transactions[1]).toBe(false);
    expect(p.recurring[0].owner).toBe('공동');
    expect(b.version).toBe(5);
    expect(p.settings.spouseName).toBe('민지');
    expect(p.settings.splitMe).toBe(60);
  });
  test('version 4 백업은 읽고, 이름·비율·없는 owner는 만들지 않는다', () => {
    const old = {
      app: 'gagyebu', version: 4, profile: { monthStartDay: 1 },
      settings: { mode: 'couple', features: { txOwner: true } },
      transactions: [{ id: 't1', amount: 12, createdAt: 'x' }, { id: 't2', amount: 9, owner: '배우자' }],
      recurring: [{ id: 'r', name: '월세', owner: '공동' }],
      categories: [],
    };
    const p = parseBackup(old);
    expect(p.version).toBe(4);
    expect(p.hasSettings).toBe(true);
    expect(p.settings.mode).toBe('couple');
    expect(p.settings.spouseName).toBeUndefined();
    expect(p.settings.splitMe).toBeUndefined();
    expect(p.transactions[0]).toEqual({ id: 't1', amount: 12 });
    expect(p.transactions[1].owner).toBe('배우자');
    expect(p.recurring[0].owner).toBe('공동');
    expect(() => parseBackup({ app: 'gagyebu', version: 6, transactions: [] })).toThrow(/버전/);
  });
  test('version 3 백업은 owner를 만들지 않고 거래를 그대로 읽는다', () => {
    const old = { app: 'gagyebu', version: 3, profile: { monthStartDay: 25 }, transactions: [{ id: 't1', amount: 12, createdAt: 'x' }], categories: [] };
    const p = parseBackup(old);
    expect(p.transactions[0]).toEqual({ id: 't1', amount: 12 });
    expect(p.hasSettings).toBe(false);
    expect(sanitizeOwnerRow({ id: 'z', owner: 'nope', amount: 1 })).toEqual({ id: 'z', amount: 1 });
    expect(sanitizeOwnerRow({ id: 'y', amount: 1 })).toEqual({ id: 'y', amount: 1 });
  });
  test('설정 정규화는 이름·비율만 남긴다', () => {
    expect(normalizeSettings({ mode: 'couple', spouseName: ' 민지 ', splitMe: 60, nickname: 'x' })).toEqual({ mode: 'couple', spouseName: '민지', splitMe: 60 });
    expect(normalizeSettings({ spouseName: '', splitMe: 101, features: {} })).toEqual({});
    expect(spouseLabel({ spouseName: '민지' })).toBe('민지');
    expect(spouseLabel({})).toBe('배우자');
    expect(splitMeOf({ splitMe: 70 })).toBe(70);
    expect(splitMeOf(null)).toBe(50);
  });
});

function coupleModel(extra = {}) {
  const txs = extra.txs ?? [
    tx({ id: 'old', amount: 5000, memo: '점심' }),
    tx({ id: 'pay', amount: 1800000, kind: 'income', categoryId: 'salary', owner: '배우자', memo: '월급' }),
    tx({ id: 'shop', amount: 10000, owner: '공동', memo: '장보기' }),
  ];
  const settings = { ...settingsForMode('couple'), spouseName: '민지', splitMe: 60, ...extra.settings };
  return {
    sd: 1, storedStart: 1, today: '2026-10-21', curYm: '2026-10', viewYm: '2026-10',
    p: { start: '2026-10-01', end: '2026-11-01', ym: '2026-10', days: 31 },
    periodTxs: txs, txs, tot: { expense: 15000, income: 1800000, saved: 1785000 },
    user: { displayName: '초', email: 'cho@example.com' },
    budget: { total: 0 }, txLoaded: true,
    categories: [{ id: 'food', name: '식비', emoji: '🍚', kind: 'expense' }, { id: 'salary', name: '월급', emoji: '💰', kind: 'income' }],
    accounts: [], rules: [], recurring: [], goals: [], imports: [],
    assetAccounts: [], holdings: [], contributions: [], assetPrefs: null,
    catMap: new Map([['food', { emoji: '🍚', name: '식비' }], ['salary', { emoji: '💰', name: '월급' }]]),
    accMap: new Map(),
    weather: { hasBudget: false }, trend: [{ ym: '2026-10', expense: 15000, income: 1800000, saved: 1785000 }],
    streak: 0, noSpend: 0, insight: null, wide: false, dark: false, themeMode: 'light', offline: false, contentScale: 1,
    mode: 'couple', legacyMode: false, features: settings.features, settings,
  };
}

describe('부부 화면', () => {
  test('홈에 사람별 합계·배우자 입금·정산이 있고 예전 기록은 나', () => {
    const html = homeView(coupleModel());
    expect(html).toContain('민지 입금');
    expect(html).toContain('누구 돈');
    expect(html).toContain('수입 +1,800,000원');
    expect(html).toContain('공동 지출 10,000원');
    expect(html).toContain('나 60%');
    expect(html).toContain('민지 40%');
    expect(html).toContain('나 부담');
    expect(html).toContain('6,000원');
    expect(html).toContain('4,000원');
    expect(html).toContain('민지가 나에게 4,000원');
    expect(html).toContain('민지 입금과 공동 수입은 정산에 넣지 않아요');
    expect(html).toContain('0.5원');
    expect(html).not.toContain('다음 업데이트');
  });
  test('목록·차트 필터는 고른 사람만, 합계 카드는 세 사람', () => {
    const m = coupleModel();
    const list = calendarView(m, { mode: 'list', ownerFilter: '배우자' });
    expect(list).toContain('data-owner-filter="배우자"');
    expect(list).toContain('aria-checked="true"');
    expect(list).toContain('민지 입금');
    expect(list).not.toContain('장보기');
    expect(list).toContain('누구 돈');
    const all = calendarView(m, { mode: 'list' });
    expect(all).toContain('장보기');
    expect(all).toContain('점심');
    const off = calendarView({ ...m, features: { ...m.features, txOwner: false }, mode: 'single' }, { mode: 'list' });
    expect(off).not.toContain('data-owner-filter');
    expect(off).not.toContain('민지 입금');
    const chart = chartView(m, { ownerFilter: '공동', chartKind: 'expense' });
    expect(chart).toContain('data-owner-filter="공동"');
    expect(chart).toContain('누구 돈');
  });
  test('설정에서 배우자 이름과 비율을 고친다', () => {
    const html = settingsView(coupleModel(), { catKind: 'expense' });
    expect(html).toContain('data-spouse-name');
    expect(html).toContain('value="민지"');
    expect(html).toContain('data-split-me');
    expect(html).toContain('value="60"');
    expect(html).not.toContain('다음 업데이트');
    const single = settingsView({ ...coupleModel(), mode: 'single', features: settingsForMode('single').features, settings: settingsForMode('single') }, { catKind: 'expense' });
    expect(single).not.toContain('data-spouse-name');
  });
  test('입력·문자 누구 돈 고르기는 배우자·공동만 저장', () => {
    const picks = ownerPickHtml('배우자', '민지');
    expect(picks).toContain('data-owner="배우자"');
    expect(picks).toContain('민지');
    expect(picks).toContain('aria-checked="true"');
    const sms = smsTx({ kind: 'income', amount: '800000', date: '2026-10-01', categoryId: 'salary', status: 'deposit', owner: '배우자', memo: '월급' });
    expect(sms.err).toBeNull();
    expect(sms.tx.owner).toBe('배우자');
    expect(sms.tx.kind).toBe('income');
    const mine = smsTx({ kind: 'expense', amount: '1000', date: '2026-10-01', categoryId: 'food', status: 'approval', owner: '나' });
    expect(mine.tx.owner).toBeUndefined();
  });
});
