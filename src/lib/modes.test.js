import { describe, expect, test } from 'vitest';
import { period, periodOf } from './dates.js';
import { dailyShares, weekDailyLeft, spentByDateFrom } from './pace.js';
import { allowanceBounds, allowanceStatus, dailyAllowance, daysBetween } from './allowance.js';
import { limitWarnings } from './budget.js';
import { buildBackup, parseBackup, BACKUP_VERSION } from './backup.js';
import {
  resolveMode, settingsForMode, normalizeSettings, coupleOwnerHook, COUPLE_OWNER_IMPLEMENTED, LEGACY_FEATURES, STUDENT_INCOME,
} from './modes.js';
import { monthSummaryText, shareSummary } from './shareSummary.js';
import { dueOccurrences, recTxId } from './recurring.js';

describe('모드', () => {
  test('모드가 없으면 지금 메뉴를 유지하고 새 카드는 숨긴다', () => {
    const r = resolveMode(null);
    expect(r.legacy).toBe(true);
    expect(r.mode).toBeNull();
    expect(r.features).toEqual(LEGACY_FEATURES);
    expect(r.features.recurring).toBe(true);
    expect(r.features.sms).toBe(true);
    expect(r.features.piggy).toBe(true);
    expect(r.features.categoryLimits).toBe(true);
    expect(r.features.monthShare).toBe(true);
    expect(r.features.weekDaily).toBe(false);
    expect(r.features.allowance).toBe(false);
    expect(r.features.studentIncome).toBe(false);
    expect(r.features.txOwner).toBe(false);
  });
  test('모드를 고르기 전에는 켜진 메뉴를 끄지 못하고, 새 기능만 켤 수 있다', () => {
    const r = resolveMode({ features: { recurring: false, weekDaily: true, allowance: true } });
    expect(r.legacy).toBe(true);
    expect(r.features.recurring).toBe(true);
    expect(r.features.weekDaily).toBe(true);
    expect(r.features.allowance).toBe(true);
    expect(r.features.sms).toBe(true);
  });
  test('1인 가구·학생 기본 메뉴, 섞기', () => {
    expect(resolveMode(settingsForMode('single')).features).toMatchObject({ recurring: true, monthStart: true, weekDaily: true, sms: true, allowance: false, piggy: false, txOwner: false });
    expect(resolveMode(settingsForMode('student')).features).toMatchObject({ allowance: true, piggy: true, categoryLimits: true, studentIncome: true, monthShare: true, recurring: false, sms: false });
    const mixed = resolveMode({ mode: 'student', features: { ...settingsForMode('student').features, sms: true, recurring: true } });
    expect(mixed.features.sms).toBe(true);
    expect(mixed.features.recurring).toBe(true);
    expect(mixed.features.allowance).toBe(true);
  });
  test('부부 모드는 거래 주인 자리만 켜고 구현하지 않는다', () => {
    expect(resolveMode(settingsForMode('couple')).features.txOwner).toBe(true);
    expect(COUPLE_OWNER_IMPLEMENTED).toBe(false);
    const tx = { id: 't', amount: 1000, kind: 'expense' };
    const hook = coupleOwnerHook(tx);
    expect(hook).toMatchObject({ field: 'owner', implemented: false, tx });
    expect(tx.owner).toBeUndefined();
    expect(Object.keys(tx)).toEqual(['id', 'amount', 'kind']);
  });
  test('설정 정규화는 모르는 키·테마를 버린다', () => {
    expect(normalizeSettings({ mode: 'student', theme: 'ocean', features: { allowance: true, nope: true }, allowanceAmount: 200000, allowanceCycle: 'week', allowanceWeekday: 1, allowanceDay: 5 })).toEqual({
      mode: 'student', features: { allowance: true }, allowanceAmount: 200000, allowanceCycle: 'week', allowanceWeekday: 1, allowanceDay: 5,
    });
    expect(normalizeSettings({ mode: 'family', allowanceAmount: 1.5, allowanceDay: 31 })).toEqual({});
    expect(normalizeSettings(null)).toBeNull();
  });
  test('알바·심부름 카테고리 id', () => {
    expect(STUDENT_INCOME.map((c) => c.id)).toEqual(['part-time', 'errand']);
    expect(STUDENT_INCOME.every((c) => c.kind === 'income')).toBe(true);
  });
});

describe('월급날 기간·윤년·하루 몫', () => {
  test('시작일 경계', () => {
    expect(period('2026-10', 25)).toMatchObject({ start: '2026-10-25', end: '2026-11-25', days: 31 });
    expect(periodOf('2026-10-24', 25)).toBe('2026-09');
    expect(periodOf('2026-10-25', 25)).toBe('2026-10');
    expect(periodOf('2026-11-24', 25)).toBe('2026-10');
    expect(periodOf('2026-11-25', 25)).toBe('2026-11');
  });
  test('윤년 2월과 평년, 100으로 나누어떨어지는 해', () => {
    expect(period('2024-02', 1)).toMatchObject({ start: '2024-02-01', end: '2024-03-01', days: 29 });
    expect(period('2023-02', 1)).toMatchObject({ days: 28 });
    expect(period('1900-02', 1).days).toBe(28);
    expect(period('2000-02', 1).days).toBe(29);
    expect(period('2024-02', 15)).toMatchObject({ start: '2024-02-15', end: '2024-03-15', days: 29 });
    expect(period('2023-02', 15).days).toBe(28);
    expect(periodOf('2024-02-29', 1)).toBe('2024-02');
    // 29일은 28일로 맞추고, 3월 1일은 아직 다음 월급날 전
    expect(periodOf('2024-03-01', 29)).toBe('2024-02');
    expect(period('2024-02', 28)).toMatchObject({ start: '2024-02-28', end: '2024-03-28', days: 29 });
  });
  test('하루 몫의 합은 예산과 같고 나머지는 앞날에 1원', () => {
    const shares = dailyShares(100, 29);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(shares.every(Number.isInteger)).toBe(true);
    expect(shares.slice(0, 13).every((n) => n === 4)).toBe(true);
    expect(shares.slice(13).every((n) => n === 3)).toBe(true);
    expect(dailyShares(310000, 31).every((n) => n === 10000)).toBe(true);
    expect(dailyShares(0, 28).every((n) => n === 0)).toBe(true);
  });
  test('이번 주·오늘 남은 돈, 기간 밖으로 넘어간 주는 기간 안만', () => {
    const p = period('2026-10', 1);
    const budget = 310000;
    const spent = { '2026-10-20': 5000, '2026-10-21': 1000 };
    const w = weekDailyLeft({ budget, p, today: '2026-10-21', spentByDate: spent });
    expect(w.inPeriod).toBe(true);
    expect(w.todayShare).toBe(10000);
    expect(w.todayLeft).toBe(9000);
    expect(w.weekStart).toBe('2026-10-19');
    expect(w.weekEnd).toBe('2026-10-26');
    expect(w.weekShare).toBe(70000);
    expect(w.weekLeft).toBe(64000);
    // 월급날 25일: 10월 21일은 아직 이전 기간
    expect(weekDailyLeft({ budget, p: period('2026-10', 25), today: '2026-10-21', spentByDate: {} }).inPeriod).toBe(false);
    const cross = weekDailyLeft({ budget: 310000, p: period('2026-10', 25), today: '2026-11-24', spentByDate: { '2026-11-24': 100 } });
    expect(cross.inPeriod).toBe(true);
    expect(cross.todayLeft).toBe(cross.todayShare - 100);
    expect(Number.isInteger(cross.weekLeft)).toBe(true);
    expect(Number.isInteger(cross.todayLeft)).toBe(true);
  });
  test('환불(음수 지출)은 남은 돈을 늘린다', () => {
    const p = period('2026-10', 1);
    const w = weekDailyLeft({ budget: 310000, p, today: '2026-10-21', spentByDate: spentByDateFrom([{ date: '2026-10-21', amount: -3000, kind: 'expense' }]) });
    expect(w.todayLeft).toBe(13000);
  });
});

describe('용돈 하루 몫', () => {
  test('내림과 나머지', () => {
    expect(dailyAllowance({ amount: 10000, leftSpent: 0, days: 3 })).toEqual({ left: 10000, perDay: 3333, remainder: 1 });
    expect(dailyAllowance({ amount: 100, leftSpent: 0, days: 7 })).toEqual({ left: 100, perDay: 14, remainder: 2 });
    expect(dailyAllowance({ amount: 10000, leftSpent: 1, days: 3 })).toEqual({ left: 9999, perDay: 3333, remainder: 0 });
    expect(dailyAllowance({ amount: 10000, leftSpent: 15000, days: 5 })).toEqual({ left: -5000, perDay: 0, remainder: 0 });
    expect(dailyAllowance({ amount: 5000, leftSpent: 0, days: 0 })).toEqual({ left: 5000, perDay: 0, remainder: 5000 });
  });
  test('월 용돈, 윤년 2월 29일', () => {
    const leapToday = allowanceBounds({ cycle: 'month', day: 28, today: '2024-02-29' });
    expect(leapToday).toEqual({ prev: '2024-02-28', next: '2024-03-28' });
    expect(daysBetween('2024-02-29', '2024-03-28')).toBe(28);
    expect(daysBetween('2024-02-28', '2024-03-28')).toBe(29);
    expect(daysBetween('2023-02-28', '2023-03-28')).toBe(28);
    const st = allowanceStatus({ amount: 290000, cycle: 'month', day: 28, today: '2024-02-29', txs: [{ date: '2024-02-28', amount: 1000, kind: 'expense' }, { date: '2024-02-29', amount: 500, kind: 'expense' }, { date: '2024-03-28', amount: 99999, kind: 'expense' }] });
    expect(st.days).toBe(28);
    expect(st.spent).toBe(1500);
    expect(st.left).toBe(288500);
    expect(st.perDay).toBe(Math.floor(288500 / 28));
    expect(st.perDay * st.days + st.remainder).toBe(288500);
  });
  test('주 용돈: 오늘이 용돈날이면 7일', () => {
    const b = allowanceBounds({ cycle: 'week', weekday: 3, today: '2026-10-21' });
    expect(b).toEqual({ prev: '2026-10-21', next: '2026-10-28' });
    const st = allowanceStatus({
      amount: 70000, cycle: 'week', weekday: 1, today: '2026-10-21',
      txs: [{ date: '2026-10-18', amount: 99999, kind: 'expense' }, { date: '2026-10-21', amount: 3000, kind: 'expense' }, { date: '2026-10-21', amount: 50000, kind: 'income' }],
    });
    expect(st.prev).toBe('2026-10-19');
    expect(st.next).toBe('2026-10-26');
    expect(st.spent).toBe(3000);
    expect(st.days).toBe(5);
    expect(st.perDay).toBe(Math.floor(67000 / 5));
    expect(st.remainder).toBe(67000 - st.perDay * 5);
  });
  test('소수 금액은 거절', () => {
    expect(() => dailyAllowance({ amount: 10.5, leftSpent: 0, days: 1 })).toThrow(TypeError);
  });
});

describe('카테고리 한도 경고', () => {
  const cats = [{ id: 'food', name: '식비', emoji: '🍚' }];
  test('90% 직전은 조용, 90%·100%는 가까움, 초과는 넘침', () => {
    expect(limitWarnings({ food: 10000 }, { food: 8999 }, cats)).toEqual([]);
    expect(limitWarnings({ food: 10000 }, { food: 9000 }, cats)[0].level).toBe('near');
    expect(limitWarnings({ food: 10000 }, { food: 10000 }, cats)[0].level).toBe('near');
    const over = limitWarnings({ food: 10000 }, { food: 10001 }, cats)[0];
    expect(over).toMatchObject({ level: 'over', used: 10001, limit: 10000, name: '식비' });
  });
  test('한도 없음·0원·환불로 음수면 경고 없음', () => {
    expect(limitWarnings({ food: 0 }, { food: 100 }, cats)).toEqual([]);
    expect(limitWarnings({}, { food: 100 }, cats)).toEqual([]);
    expect(limitWarnings({ food: 10000 }, { food: -500 }, cats)).toEqual([]);
  });
});

describe('백업 version 4', () => {
  test('설정이 없으면 null, 예전 키는 그대로', () => {
    const b = buildBackup({ transactions: [{ id: 't', amount: 1, createdAt: 'x' }], profile: { monthStartDay: 25 } }, new Date('2026-10-21T00:00:00Z'));
    expect(b.version).toBe(BACKUP_VERSION);
    expect(b.version).toBe(4);
    expect(b.settings).toBeNull();
    expect(b.profile).toEqual({ monthStartDay: 25 });
    expect(b.transactions[0]).toEqual({ id: 't', amount: 1 });
    expect(b.assetAccounts).toEqual([]);
  });
  test('설정을 담고 서버 시각·테마는 뺀다', () => {
    const b = buildBackup({ settings: { mode: 'single', features: { sms: true }, allowanceAmount: 1000, updatedAt: 'x', theme: 'dark' } }, new Date('2026-10-21T00:00:00Z'));
    expect(b.settings).toEqual({ mode: 'single', features: { sms: true }, allowanceAmount: 1000 });
    expect(JSON.stringify(b.settings)).not.toMatch(/updatedAt|theme/);
  });
  test('version 3 백업은 설정을 건드리지 않고 거래는 읽는다', () => {
    const old = { app: 'gagyebu', version: 3, profile: { monthStartDay: 25 }, transactions: [{ id: 't1', amount: 12, createdAt: 'x' }], categories: [], assetAccounts: [{ id: 'a', name: '연금' }], holdings: [], contributions: [], assetPrefs: null };
    const p = parseBackup(old);
    expect(p.version).toBe(3);
    expect(p.hasSettings).toBe(false);
    expect(p.settings).toBeNull();
    expect(p.hasAssets).toBe(true);
    expect(p.transactions[0]).toEqual({ id: 't1', amount: 12 });
    expect(p.profile.monthStartDay).toBe(25);
    expect(p.assetAccounts[0].name).toBe('연금');
  });
  test('version 2 는 자산 키가 없으면 자산을 건드리지 않는다', () => {
    const p = parseBackup({ app: 'gagyebu', version: 2, transactions: [{ id: 't', amount: 3 }], goals: [{ id: 'g', name: '여행', createdAt: 'x' }] });
    expect(p.hasAssets).toBe(false);
    expect(p.hasSettings).toBe(false);
    expect(p.goals[0]).toEqual({ id: 'g', name: '여행' });
  });
  test('version 4 설정 복원, 깨진 파일은 거절', () => {
    const raw = buildBackup({ settings: { mode: 'student', allowanceAmount: 200000, allowanceCycle: 'month', allowanceDay: 1 } });
    const p = parseBackup(raw);
    expect(p.hasSettings).toBe(true);
    expect(p.settings.mode).toBe('student');
    expect(p.settings.allowanceAmount).toBe(200000);
    expect(() => parseBackup({ app: 'other', version: 4 })).toThrow(/쓱 가계부/);
    expect(() => parseBackup({ app: 'gagyebu', version: 99 })).toThrow(/버전/);
    expect(() => parseBackup(null)).toThrow();
  });
});

describe('월간 요약 공유', () => {
  const d = { ym: '2026-10', month: 10, saved: 120000, income: 300000, expense: 180000, top: [{ emoji: '🍚', name: '식비', amount: 80000 }] };
  test('글 요약은 정수 원', () => {
    const text = monthSummaryText(d);
    expect(text).toContain('2026년 10월');
    expect(text).toContain('120,000원');
    expect(text).toContain('식비 80,000원');
    expect(text).not.toMatch(/\d+\.\d+원/);
  });
  test('공유 API가 되면 shared, 닫으면 abort, 없으면 복사와 저장', async () => {
    const file = { name: 'a.png' };
    const nav = { share: async () => {}, canShare: () => true };
    expect(await shareSummary({ text: '안녕', file, title: 't', nav, doc: {} })).toBe('shared');
    expect(await shareSummary({ text: '안녕', title: 't', nav: { share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } }, doc: {} })).toBe('abort');
    let copied = '';
    const clicks = [];
    const doc = { createElement: () => ({ click() { clicks.push('dl'); }, remove() {} }), body: { append() {} } };
    const prevCreate = URL.createObjectURL;
    const prevRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:shot';
    URL.revokeObjectURL = () => {};
    const fallback = { clipboard: { writeText: async (s) => { copied = s; } }, canShare: () => false };
    try {
    expect(await shareSummary({ text: '글', file, title: 't', nav: fallback, doc })).toBe('copied');
    expect(copied).toBe('글');
    expect(clicks).toEqual(['dl']);
    } finally {
      URL.createObjectURL = prevCreate;
      URL.revokeObjectURL = prevRevoke;
    }
  });
});

describe('반복 기록은 다시 열어도 같은 id', () => {
  test('두 번 계산해도 회차 id가 같다', () => {
    const r = { id: 'rent', dayOfMonth: 25, active: true, startYm: '2026-08', amount: 650000, kind: 'expense' };
    const a = dueOccurrences(r, '2026-10-25');
    const b = dueOccurrences(r, '2026-10-25');
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    expect(a[0].id).toBe(recTxId('rent', '2026-08'));
  });
});
