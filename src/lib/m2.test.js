import { describe, test, expect } from 'vitest';
import { classify, matchRule, merchantKey } from './classify.js';
import { dueOccurrences, dueDate, nextDue, monthlyFixed, detectSubscriptions, recTxId } from './recurring.js';
import { goalProgress, validateGoal } from './goals.js';
import { searchTxs, hasFilter } from './search.js';

describe('자동 분류 규칙', () => {
  const rules = [{ match: '스타벅스', categoryId: 'food' }, { match: '스타벅스 리저브', categoryId: 'gift' }];
  test('내 규칙이 키워드보다 우선, 긴 규칙 우선', () => {
    expect(classify({ desc: '스타벅스 강남R점', kind: 'expense' }, rules)).toEqual({ categoryId: 'food', by: 'rule' });
    expect(classify({ desc: '스타벅스리저브 광화문', kind: 'expense' }, rules).categoryId).toBe('gift');
    expect(classify({ desc: '스타벅스 강남R점', kind: 'expense' }, [])).toEqual({ categoryId: 'cafe', by: 'keyword' });
  });
  test('키워드 추정과 기타', () => {
    expect(classify({ desc: '카카오T 택시', kind: 'expense' }).categoryId).toBe('transit');
    expect(classify({ desc: 'GS25 역삼점', kind: 'expense' }).categoryId).toBe('living');
    expect(classify({ desc: '넷플릭스', kind: 'expense' }).categoryId).toBe('telecom');
    expect(classify({ desc: '메가박스 코엑스', kind: 'expense' }).categoryId).toBe('culture');
    expect(classify({ desc: '(주)쓱컴퍼니 급여', kind: 'income' }).categoryId).toBe('salary');
    expect(classify({ desc: '알 수 없는 곳', kind: 'expense' })).toEqual({ categoryId: 'etc', by: 'fallback' });
    expect(classify({ desc: '모름', kind: 'income' }).categoryId).toBe('etc-in');
  });
  test("짧은 영문 키워드는 낱말 단위('cu'가 'cucumber'에 걸리지 않음)", () => {
    expect(classify({ desc: 'CU 역삼점', kind: 'expense' }).categoryId).toBe('living');
    expect(classify({ desc: 'cucumber shop', kind: 'expense' }).categoryId).toBe('etc');
  });
  test('지워진 카테고리로는 분류하지 않음', () => {
    expect(classify({ desc: '스타벅스', kind: 'expense' }, rules, new Set(['cafe', 'etc'])).categoryId).toBe('cafe');
  });
  test('대소문자·띄어쓰기 무시', () => expect(matchRule('NETFLIX.COM', [{ match: 'netflix', categoryId: 'telecom' }])).toBe('telecom'));
  test('규칙 글자 만들기(지점 떼기)', () => {
    expect(merchantKey('스타벅스 강남R점')).toBe('스타벅스');
    expect(merchantKey('GS25 역삼점 · 메모')).toBe('GS25');
    expect(merchantKey('(주)쓱컴퍼니 급여')).toBe('쓱컴퍼니');
    expect(merchantKey('쿠팡')).toBe('쿠팡');
  });
});

describe('반복 거래', () => {
  const r = { id: 'rent', dayOfMonth: 25, active: true, startYm: '2026-08', amount: 650000, kind: 'expense' };
  test('시작 달부터 오늘까지 회차, 아직 안 온 날은 제외', () => {
    expect(dueOccurrences(r, '2026-10-19').map((x) => x.date)).toEqual(['2026-08-25', '2026-09-25']);
    expect(dueOccurrences(r, '2026-10-25').map((x) => x.ym)).toEqual(['2026-08', '2026-09', '2026-10']);
  });
  test('마지막 기록 다음 달부터, 꺼진 반복은 없음', () => {
    expect(dueOccurrences({ ...r, lastPosted: '2026-09' }, '2026-10-30').map((x) => x.ym)).toEqual(['2026-10']);
    expect(dueOccurrences({ ...r, lastPosted: '2026-10' }, '2026-10-30')).toEqual([]);
    expect(dueOccurrences({ ...r, active: false }, '2026-10-30')).toEqual([]);
  });
  test('31일 → 말일로, 윤년', () => {
    expect(dueDate('2026-02', 31)).toBe('2026-02-28'); expect(dueDate('2028-02', 31)).toBe('2028-02-29'); expect(dueDate('2026-04', 31)).toBe('2026-04-30');
  });
  test('오래 안 열어도 최대 12달만 채움', () => {
    expect(dueOccurrences({ ...r, startYm: '2020-01' }, '2026-10-30')).toHaveLength(12);
  });
  test('거래 id 고정(여러 기기 중복 방지)', () => expect(recTxId('rent', '2026-10')).toBe('rec-rent-2026-10'));
  test('다음 날짜·월 고정비', () => {
    expect(nextDue(r, '2026-10-19')).toBe('2026-10-25');
    expect(nextDue({ ...r, lastPosted: '2026-10' }, '2026-10-26')).toBe('2026-11-25');
    expect(monthlyFixed([r, { ...r, amount: 13500 }, { ...r, active: false }, { ...r, kind: 'income' }])).toBe(663500);
  });
  test('구독처럼 보이는 거래 찾기(매달 같은 날 즈음·같은 가맹점·같은 금액)', () => {
    const txs = [
      ...['2026-07-05', '2026-08-05', '2026-09-06'].map((date) => ({ kind: 'expense', memo: '넷플릭스', amount: 13500, date, categoryId: 'telecom' })),
      { kind: 'expense', memo: '스타벅스', amount: 5600, date: '2026-09-01', categoryId: 'cafe' }, { kind: 'expense', memo: '스타벅스', amount: 5600, date: '2026-09-02', categoryId: 'cafe' },
    ];
    expect(detectSubscriptions(txs)).toEqual([{ name: '넷플릭스', amount: 13500, months: 3, day: 5, categoryId: 'telecom' }]);
    expect(detectSubscriptions(txs, [{ name: '넷플릭스', amount: 13500 }])).toEqual([]);
    // 한 달에 여러 번(지하철 등)은 구독이 아님
    const subway = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-09-01', '2026-09-02'].map((date) => ({ date, amount: 1450, kind: 'expense', memo: '지하철' }));
    expect(detectSubscriptions(subway)).toEqual([]);
  });
});

describe('저축 목표', () => {
  test('진행률·한 달에 얼마', () => {
    expect(goalProgress({ target: 1_000_000, saved: 250_000, due: '2027-03-31' }, '2026-10-19')).toMatchObject({ pct: 25, left: 750_000, months: 6, perMonth: 125_000, done: false });
    expect(goalProgress({ target: 100, saved: 150 }, '2026-10-19')).toMatchObject({ pct: 100, done: true, left: 0 });
    expect(goalProgress({ target: 1000, saved: 0, due: '2026-01-01' }, '2026-10-19')).toMatchObject({ overdue: true, perMonth: 1000 });
  });
  test('입력 검증', () => {
    expect(validateGoal({ name: '', target: 1 })).toBeTruthy();
    expect(validateGoal({ name: '여행', target: 0 })).toBeTruthy();
    expect(validateGoal({ name: '여행', target: 1.5 })).toBeTruthy();
    expect(validateGoal({ name: '여행', target: 1_000_000, saved: 0 })).toBeNull();
  });
});

describe('검색·필터', () => {
  const cat = new Map([['cafe', { name: '카페·간식' }], ['food', { name: '식비' }]]);
  const txs = [
    { date: '2026-10-01', amount: 5600, kind: 'expense', categoryId: 'cafe', memo: '스타벅스 #친구', tags: ['친구'], accountId: 'card' },
    { date: '2026-10-03', amount: 9000, kind: 'expense', categoryId: 'food', memo: '점심', accountId: 'cash' },
    { date: '2026-10-05', amount: 3100000, kind: 'income', categoryId: 'salary', memo: '월급' },
  ];
  test('글자·태그·카테고리 이름, 최신순', () => {
    expect(searchTxs(txs, { q: '스타' }, cat)).toHaveLength(1);
    expect(searchTxs(txs, { q: '#친구' }, cat)).toHaveLength(1);
    expect(searchTxs(txs, { q: '식비' }, cat)[0].memo).toBe('점심');
    expect(searchTxs(txs, {}, cat).map((t) => t.date)).toEqual(['2026-10-05', '2026-10-03', '2026-10-01']);
  });
  test('구분·결제수단·금액·기간', () => {
    expect(searchTxs(txs, { kind: 'income' })).toHaveLength(1);
    expect(searchTxs(txs, { accountId: 'cash' })).toHaveLength(1);
    expect(searchTxs(txs, { min: 6000, max: 10000 })).toHaveLength(1);
    expect(searchTxs(txs, { from: '2026-10-02', to: '2026-10-04' })).toHaveLength(1);
    expect(hasFilter({ q: ' ' })).toBe(false); expect(hasFilter({ min: 0 })).toBe(true);
  });
});
