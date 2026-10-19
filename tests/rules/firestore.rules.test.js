import { readFileSync } from 'node:fs';
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { recTxId } from '../../src/lib/recurring.js';
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS } from '../../src/lib/defaults.js';
import { safeRef, fixedRecId, looksLikeCard } from '../../src/lib/ids.js';
import { restorePlans } from '../../src/lib/restore.js';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-gagyebu', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { displayName: 'Alice', currency: 'KRW', monthStartDay: 1 });
    await setDoc(doc(db, 'users/alice/transactions/t1'), { date: '2026-10-19', amount: 1000, kind: 'expense', categoryId: 'food' });
    await setDoc(doc(db, 'users/alice/categories/food'), { name: '식비', emoji: '🍚', kind: 'expense', order: 0 });
    await setDoc(doc(db, 'users/alice/budgets/2026-10'), { total: 1000000 });
    await setDoc(doc(db, 'publicStuff/x'), { a: 1 });
  });
});
const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const anon = () => env.unauthenticatedContext().firestore();
const TX = { date: '2026-10-20', amount: 12000, kind: 'expense', categoryId: 'food' };

describe('본인(owner)', () => {
  test('프로필 읽기/쓰기', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), { displayName: 'A', currency: 'KRW', monthStartDay: 25, seeded: true, createdAt: serverTimestamp() }));
  });
  test('거래 읽기·목록·쓰기·수정·삭제', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/transactions/t1')));
    await assertSucceeds(getDocs(collection(alice(), 'users/alice/transactions')));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/transactions/t2'), { ...TX, kind: 'income', categoryId: 'salary', accountId: 'bank', memo: '10월 월급', tags: ['월급'], createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/transactions/t1'), { amount: 2000 }));
    await assertSucceeds(deleteDoc(doc(alice(), 'users/alice/transactions/t1')));
  });
  test('카테고리·결제수단·예산 쓰기', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/categories/c1'), { name: '반려동물', emoji: '🐶', kind: 'expense', order: 12, archived: false }));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/accounts/card'), { name: '카드', type: 'card', emoji: '💳' }));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/budgets/2026-11'), { total: 1500000, byCategory: { food: 400000 } }));
    await assertSucceeds(deleteDoc(doc(alice(), 'users/alice/categories/food')));
  });
});

describe('거래 필드 검증', () => {
  const bad = (data) => assertFails(setDoc(doc(alice(), 'users/alice/transactions/t3'), data));
  test('소수 금액', () => bad({ ...TX, amount: 10.5 }));
  test('문자열 금액', () => bad({ ...TX, amount: '1000' }));
  test('0원·음수', async () => { await bad({ ...TX, amount: 0 }); await bad({ ...TX, amount: -100 }); });
  test('10억 초과', () => bad({ ...TX, amount: 1000000001 }));
  test('금액 누락', () => { const { amount, ...rest } = TX; return bad(rest); });
  test('기존 거래를 비정수로 수정', () => assertFails(updateDoc(doc(alice(), 'users/alice/transactions/t1'), { amount: 1.1 })));
  test('잘못된 구분', () => bad({ ...TX, kind: 'transfer' }));
  test('날짜 형식', () => bad({ ...TX, date: '2026/10/20' }));
  test('긴 메모(201자)', () => bad({ ...TX, memo: 'x'.repeat(201) }));
  test('허용되지 않은 필드(카드번호 등)', () => bad({ ...TX, cardNumber: '1234-5678-9012-3456' }));
});

describe('기타 컬렉션 필드 검증', () => {
  test('카테고리 이름 21자·잘못된 구분 거부', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/categories/c2'), { name: 'x'.repeat(21), emoji: '🍚', kind: 'expense' }));
    await assertFails(setDoc(doc(alice(), 'users/alice/categories/c2'), { name: '식비', emoji: '🍚', kind: 'other' }));
  });
  test('결제수단 잘못된 종류·추가 필드 거부', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/accounts/a1'), { name: '카드', type: 'crypto' }));
    await assertFails(setDoc(doc(alice(), 'users/alice/accounts/a1'), { name: '카드', type: 'card', number: '1234' }));
  });
  test('예산: 잘못된 문서 id·비정수 거부', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/budgets/2026-13'), { total: 1 }));
    await assertFails(setDoc(doc(alice(), 'users/alice/budgets/2026-11'), { total: 1.5 }));
  });
  test('프로필: 잘못된 통화·월 시작일·추가 필드 거부', async () => {
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { currency: 'USD' }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { monthStartDay: 31 }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { role: 'admin' }));
  });
  test('정의되지 않은 하위 컬렉션 거부', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/importMaps/m1'), { a: 1 }));
    await assertFails(getDoc(doc(alice(), 'users/alice/secrets/s1')));
  });
});

describe('결제수단', () => {
  test('본인: 추가·이모지 변경·삭제', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/accounts/a2'), { name: '생활비 카드', type: 'card', emoji: '💳', order: 3 }));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/accounts/a2'), { name: '생활비 카드', type: 'card', emoji: '👛', order: 3 }));
    await assertSucceeds(deleteDoc(doc(alice(), 'users/alice/accounts/a2')));
  });
  test('이름 21자·빈 이름·긴 이모지 거부', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/accounts/a3'), { name: 'x'.repeat(21), type: 'card' }));
    await assertFails(setDoc(doc(alice(), 'users/alice/accounts/a3'), { name: '', type: 'card' }));
    await assertFails(setDoc(doc(alice(), 'users/alice/accounts/a3'), { name: '카드', type: 'card', emoji: '💳'.repeat(9) }));
  });
  test('타인·비로그인: 읽기·추가·삭제 거부', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users/alice/accounts/card'), { name: '카드', type: 'card' }));
    await assertFails(getDoc(doc(bob(), 'users/alice/accounts/card')));
    await assertFails(getDocs(collection(bob(), 'users/alice/accounts')));
    await assertFails(setDoc(doc(bob(), 'users/alice/accounts/x'), { name: '카드', type: 'card' }));
    await assertFails(deleteDoc(doc(bob(), 'users/alice/accounts/card')));
    await assertFails(deleteDoc(doc(anon(), 'users/alice/accounts/card')));
  });
});

describe('타인 uid', () => {
  test('읽기 거부(문서·목록)', async () => {
    await assertFails(getDoc(doc(bob(), 'users/alice')));
    await assertFails(getDoc(doc(bob(), 'users/alice/transactions/t1')));
    await assertFails(getDocs(collection(bob(), 'users/alice/transactions')));
    await assertFails(getDoc(doc(bob(), 'users/alice/budgets/2026-10')));
    await assertFails(getDoc(doc(bob(), 'users/alice/categories/food')));
  });
  test('쓰기·삭제 거부', async () => {
    await assertFails(setDoc(doc(bob(), 'users/alice'), { displayName: 'hack' }));
    await assertFails(setDoc(doc(bob(), 'users/alice/transactions/t9'), TX));
    await assertFails(deleteDoc(doc(bob(), 'users/alice/transactions/t1')));
    await assertFails(setDoc(doc(bob(), 'users/alice/categories/c9'), { name: 'x', emoji: '🍚', kind: 'expense' }));
    await assertFails(setDoc(doc(bob(), 'users/alice/budgets/2026-10'), { total: 0 }));
  });
});

describe('비로그인', () => {
  test('읽기/쓰기 거부', async () => {
    await assertFails(getDoc(doc(anon(), 'users/alice')));
    await assertFails(getDocs(collection(anon(), 'users/alice/transactions')));
    await assertFails(setDoc(doc(anon(), 'users/alice/transactions/t9'), TX));
  });
});

describe('루트/기타 컬렉션', () => {
  test('로그인 사용자도 거부', async () => {
    await assertFails(getDoc(doc(alice(), 'publicStuff/x')));
    await assertFails(setDoc(doc(alice(), 'publicStuff/y'), { a: 1 }));
    await assertFails(setDoc(doc(alice(), 'households/h1'), { members: {} }));
    await assertFails(getDocs(collection(alice(), 'users')));
  });
  test('비로그인 거부', async () => {
    await assertFails(getDoc(doc(anon(), 'publicStuff/x')));
    await assertFails(setDoc(doc(anon(), 'publicStuff/z'), { a: 1 }));
  });
});

// ── M2: 가져오기 필드·자동 분류 규칙·반복 거래·저축 목표 ──
const RULE = { match: '스타벅스', field: 'memo', categoryId: 'cafe' };
const REC = { name: '월세', amount: 650000, kind: 'expense', categoryId: 'housing', dayOfMonth: 25, active: true, startYm: '2026-10' };
const GOAL = { name: '여행 자금', emoji: '✈️', target: 1000000, saved: 0 };

describe('M2 거래 가져오기 필드', () => {
  const tx = (data) => setDoc(doc(alice(), 'users/alice/transactions/i1'), { ...TX, ...data });
  test('지문·묶음·카드 끝 4자리·반복 id 허용', () =>
    assertSucceeds(tx({ importHash: '0123456789abcdef', importBatch: 'imp-20261019', card4: '5678', recurringId: 'rent' })));
  test('카드번호 전체·5자리·글자 거부', async () => {
    await assertFails(tx({ card4: '1234-5678-9012-3456' }));
    await assertFails(tx({ card4: '12345' }));
    await assertFails(tx({ card4: 'abcd' }));
  });
  test('지문 형식(16자리 hex)·묶음 id 길이', async () => {
    await assertFails(tx({ importHash: '스타벅스 강남점 5600' }));
    await assertFails(tx({ importHash: '0123456789ABCDEF' }));
    await assertFails(tx({ importBatch: 'x'.repeat(41) }));
  });
  test('원본 줄 통째로 저장 거부', () => assertFails(tx({ raw: ['2026.10.03', '1234-****', '스타벅스'] })));
});

describe('M2 자동 분류 규칙', () => {
  const p = 'users/alice/rules/r1';
  test('본인: 추가·수정·삭제·목록', async () => {
    await assertSucceeds(setDoc(doc(alice(), p), { ...RULE, createdAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(alice(), p), { categoryId: 'food' }));
    await assertSucceeds(getDocs(collection(alice(), 'users/alice/rules')));
    await assertSucceeds(deleteDoc(doc(alice(), p)));
  });
  test('빈 글자·41자·다른 field·추가 필드·카테고리 누락 거부', async () => {
    await assertFails(setDoc(doc(alice(), p), { ...RULE, match: '' }));
    await assertFails(setDoc(doc(alice(), p), { ...RULE, match: 'x'.repeat(41) }));
    await assertFails(setDoc(doc(alice(), p), { ...RULE, field: 'amount' }));
    await assertFails(setDoc(doc(alice(), p), { ...RULE, regex: '.*' }));
    await assertFails(setDoc(doc(alice(), p), { match: '스타벅스' }));
  });
  test('타인·비로그인 거부', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), p), RULE));
    await assertFails(getDoc(doc(bob(), p)));
    await assertFails(getDocs(collection(bob(), 'users/alice/rules')));
    await assertFails(setDoc(doc(bob(), 'users/alice/rules/r2'), RULE));
    await assertFails(deleteDoc(doc(bob(), p)));
    await assertFails(getDoc(doc(anon(), p)));
  });
});

describe('M2 반복 거래', () => {
  const p = 'users/alice/recurring/rent';
  test('본인: 추가·끄기·마지막 기록 달·삭제', async () => {
    await assertSucceeds(setDoc(doc(alice(), p), { ...REC, accountId: 'bank', createdAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(alice(), p), { active: false, lastPosted: '2026-10' }));
    await assertSucceeds(deleteDoc(doc(alice(), p)));
  });
  test('금액·날짜·형식 검증', async () => {
    const bad = (x) => assertFails(setDoc(doc(alice(), p), { ...REC, ...x }));
    await bad({ amount: 1.5 }); await bad({ amount: 0 }); await bad({ amount: '650000' }); await bad({ amount: 1000000001 });
    await bad({ dayOfMonth: 0 }); await bad({ dayOfMonth: 32 }); await bad({ dayOfMonth: 1.5 });
    await bad({ startYm: '2026-13' }); await bad({ lastPosted: '2026/10' }); await bad({ active: 'yes' });
    await bad({ kind: 'transfer' }); await bad({ name: 'x'.repeat(31) }); await bad({ cardNumber: '1234' });
    const { startYm, ...noStart } = REC; await assertFails(setDoc(doc(alice(), p), noStart));
  });
  test('타인·비로그인 거부', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), p), REC));
    await assertFails(getDoc(doc(bob(), p)));
    await assertFails(getDocs(collection(bob(), 'users/alice/recurring'))); // QA L11: 타인 목록
    await assertFails(getDocs(collection(anon(), 'users/alice/recurring')));
    await assertFails(setDoc(doc(bob(), p), REC));
    await assertFails(updateDoc(doc(bob(), p), { amount: 1 }));
    await assertFails(deleteDoc(doc(bob(), p)));
    await assertFails(setDoc(doc(anon(), 'users/alice/recurring/x'), REC));
  });
});

describe('M2 저축 목표', () => {
  const p = 'users/alice/goals/trip';
  test('본인: 추가·모으기·삭제', async () => {
    await assertSucceeds(setDoc(doc(alice(), p), { ...GOAL, due: '2027-03-31', order: 0, createdAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(alice(), p), { saved: 250000 }));
    await assertSucceeds(deleteDoc(doc(alice(), p)));
  });
  test('금액·날짜 검증', async () => {
    const bad = (x) => assertFails(setDoc(doc(alice(), p), { ...GOAL, ...x }));
    await bad({ target: 0 }); await bad({ target: 1.5 }); await bad({ target: 10000000001 });
    await bad({ saved: -1 }); await bad({ saved: 0.5 }); await bad({ due: '2027/03/31' }); await bad({ name: '' }); await bad({ owner: 'bob' });
  });
  test('타인·비로그인 거부', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), p), GOAL));
    await assertFails(getDoc(doc(bob(), p)));
    await assertFails(getDocs(collection(bob(), 'users/alice/goals')));
    await assertFails(updateDoc(doc(bob(), p), { saved: 999 }));
    await assertFails(setDoc(doc(bob(), 'users/alice/goals/new'), GOAL));
    await assertFails(deleteDoc(doc(bob(), p)));
    await assertFails(getDoc(doc(anon(), p)));
  });
});

// ── QA M2 재검수: 필드 검증 빈틈(M5)·환불(H3)·가져오기 묶음 기록(M6) ──
describe('M5 실제 날짜·형식 검증', () => {
  const tx = (data) => setDoc(doc(alice(), 'users/alice/transactions/v1'), { ...TX, ...data });
  test('없는 날짜 거부(13월·45일·2월 30일·평년 2월 29일), 윤년 2월 29일 허용', async () => {
    await assertFails(tx({ date: '2026-13-45' }));
    await assertFails(tx({ date: '2026-02-30' }));
    await assertFails(tx({ date: '2026-02-29' }));
    await assertFails(tx({ date: '2026-04-31' }));
    await assertFails(tx({ date: '2026-00-10' }));
    await assertSucceeds(tx({ date: '2028-02-29' }));
    await assertSucceeds(tx({ date: '2026-12-31' }));
  });
  test('목표일·반복 시작 달도 실제 날짜만', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/goals/g9'), { ...GOAL, due: '2027-99-99' }));
    await assertFails(setDoc(doc(alice(), 'users/alice/goals/g9'), { ...GOAL, due: '2027-02-30' }));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/goals/g9'), { ...GOAL, due: '2027-02-28' }));
    await assertFails(setDoc(doc(alice(), 'users/alice/recurring/r9'), { ...REC, startYm: '2026-00' }));
  });
  test('importBatch는 imp-영숫자만(카드번호 같은 글 거부)', async () => {
    await assertSucceeds(tx({ importHash: '0123456789abcdef', importBatch: 'imp-mgx1abc' }));
    await assertFails(tx({ importBatch: '1234-5678-9012-3456' }));
    await assertFails(tx({ importBatch: 'imp-' }));
    await assertFails(tx({ importBatch: 'imp-ABC' }));
    await assertFails(tx({ importBatch: 'imp-' + 'a'.repeat(13) }));
    await assertFails(tx({ importBatch: 'imp-1234567890123456' }));
  });
  test('recurringId·categoryId·accountId는 id 형식만', async () => {
    await assertFails(tx({ recurringId: '월세 4049-4700-0662-7012' }));
    await assertFails(tx({ recurringId: 'x'.repeat(65) }));
    await assertFails(tx({ categoryId: '식비 카테고리' }));
    await assertFails(tx({ accountId: '신한 1234-5678' }));
    await assertFails(setDoc(doc(alice(), 'users/alice/rules/r9'), { ...RULE, categoryId: '아무 글자나' }));
    await assertFails(setDoc(doc(alice(), 'users/alice/recurring/r9'), { ...REC, categoryId: 'a b' }));
  });
  test('태그: 20개·각 20자까지', async () => {
    await assertSucceeds(tx({ tags: ['여행', 'x'.repeat(20)] }));
    // 최대치(20개·각 20자)+가져오기 필드 전부도 규칙 식 한도 안에서 통과
    await assertSucceeds(tx({ tags: Array.from({ length: 20 }, (_, i) => `${i}`.padEnd(20, 'x')), importHash: '0123456789abcdef', importBatch: 'imp-mgx1ab', card4: '7012', recurringId: 'r1', accountId: 'card', memo: 'm'.repeat(200) }));
    await assertFails(tx({ tags: ['x'.repeat(50000)] }));
    await assertFails(tx({ tags: ['a', 'x'.repeat(21)] }));
    await assertFails(tx({ tags: ['a', 3] }));
    await assertFails(tx({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }));
  });
});

describe('M5 카테고리별 예산 값 검증', () => {
  const b = (byCategory) => setDoc(doc(alice(), 'users/alice/budgets/2026-12'), { total: 1000000, byCategory });
  test('정수·0 이상·키 형식만 허용', async () => {
    await assertSucceeds(b({ food: 400000, cafe: 0, 'etc-in': 1 }));
    await assertFails(b({ food: 1.5 }));
    await assertFails(b({ food: '많이' }));
    await assertFails(b({ food: -500 }));
    await assertFails(b({ food: 10000000001 }));
    await assertFails(b({ '식비 칸': 1000 }));
    await assertFails(b({ a: 1, b: 2, c: -3 })); // 뒤쪽 원소도 검사
  });
  test('30개까지(31개 거부), 30개째 값도 검사', async () => {
    const many = (n, last = 1) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${String(i).padStart(2, '0')}`, i === n - 1 ? last : 1]));
    await assertSucceeds(b(many(30)));
    await assertFails(b(many(30, -1)));
    await assertFails(b(many(31)));
  });
  test('총예산 정수·양수', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/budgets/2026-12'), { total: -1 }));
    await assertFails(setDoc(doc(alice(), 'users/alice/budgets/2026-12'), { total: 100.5 }));
  });
});

describe('H3 카드 환불(지출 차감)', () => {
  const tx = (data) => setDoc(doc(alice(), 'users/alice/transactions/rf'), { ...TX, ...data });
  test('가져온 지출(지문 있음)만 음수 허용', async () => {
    await assertSucceeds(tx({ amount: -12000, importHash: '0123456789abcdef', importBatch: 'imp-mgx1ab' }));
    await assertFails(tx({ amount: -12000 })); // 직접 기록은 음수 불가
    await assertFails(tx({ amount: -12000, kind: 'income', importHash: '0123456789abcdef' }));
    await assertFails(tx({ amount: -1000000001, importHash: '0123456789abcdef' }));
    await assertFails(tx({ amount: -1.5, importHash: '0123456789abcdef' }));
  });
});

describe('M6 가져오기 묶음 기록', () => {
  const p = 'users/alice/imports/imp-mgx1abc';
  const IMP = { count: 8, from: '2026-10-03', to: '2026-10-09', label: '현대카드', at: serverTimestamp() };
  test('본인: 추가·목록·삭제', async () => {
    await assertSucceeds(setDoc(doc(alice(), p), IMP));
    await assertSucceeds(getDocs(collection(alice(), 'users/alice/imports')));
    await assertSucceeds(deleteDoc(doc(alice(), p)));
  });
  test('형식 검증: 문서 id·건수·날짜·추가 필드(파일 이름 등) 거부', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/imports/my-file'), IMP));
    await assertFails(setDoc(doc(alice(), p), { ...IMP, count: 1.5 }));
    await assertFails(setDoc(doc(alice(), p), { ...IMP, from: '2026-02-30' }));
    await assertFails(setDoc(doc(alice(), p), { ...IMP, fileName: '홍길동_현대카드_202610.xlsx' }));
    await assertFails(setDoc(doc(alice(), p), { ...IMP, label: 'x'.repeat(21) }));
  });
  test('타인·비로그인 거부', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), p), { count: 1, at: new Date() }));
    await assertFails(getDoc(doc(bob(), p)));
    await assertFails(getDocs(collection(bob(), 'users/alice/imports')));
    await assertFails(setDoc(doc(bob(), 'users/alice/imports/imp-mgx1bb'), IMP));
    await assertFails(deleteDoc(doc(bob(), p)));
    await assertFails(getDocs(collection(anon(), 'users/alice/imports')));
  });
});

// ── QA 재검수 N8: id 칸에 카드번호 모양 글자 금지, 기존 id 형식은 그대로 허용 ──
describe('N8 id 형식', () => {
  const tx = (data) => setDoc(doc(alice(), 'users/alice/transactions/n8'), { ...TX, ...data });
  test('카드번호 모양(하이픈·숫자 13자리 이상) 거부', async () => {
    await assertFails(tx({ recurringId: '1234-5678-9012-3456' }));
    await assertFails(tx({ categoryId: '1234-5678-9012-3456' }));
    await assertFails(tx({ accountId: '4049470006627012' }));
    await assertFails(tx({ recurringId: 'r1234567890123' }));
    await assertFails(tx({ categoryId: 'food-1234' }));
    await assertFails(setDoc(doc(alice(), 'users/alice/rules/n8'), { ...RULE, categoryId: '1234-5678-9012-3456' }));
    await assertFails(setDoc(doc(alice(), 'users/alice/budgets/2026-12'), { total: 1, byCategory: { '4049470006627012': 1 } }));
    await assertFails(setDoc(doc(alice(), 'users/alice/budgets/2026-12'), { total: 1, byCategory: { food: 1, '1234-5678-9012-3456': 1 } }));
  });
  test('기존 id 형식 호환: 기본 카테고리·결제수단 id, 하이픈 기본 id, Firestore 자동 id', async () => {
    for (const c of ['food', 'cafe', 'etc', 'etc-in', 'salary', 'refund', 'Xk3J9aZ0qLm2nB7cD4eF']) await assertSucceeds(tx({ categoryId: c }));
    for (const a of ['card', 'cash', 'bank', 'Xk3J9aZ0qLm2nB7cD4eF']) await assertSucceeds(tx({ accountId: a }));
    await assertSucceeds(tx({ recurringId: 'Xk3J9aZ0qLm2nB7cD4eF' }));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/budgets/2026-12'), { total: 1, byCategory: { food: 1, 'etc-in': 2, Xk3J9aZ0qLm2nB7cD4eF: 3 } }));
    await assertSucceeds(tx({ importHash: '0123456789abcdef', importBatch: `imp-${Date.now().toString(36)}` }));
  });
});

// ── QA 3차 N8 잔여: 밑줄 등 모든 구분자로 이은 카드번호 모양 거부(필드 값·예산 키·문서 id·태그) ──
describe('N8 잔여 구분자 전수', () => {
  const tx = (data) => setDoc(doc(alice(), 'users/alice/transactions/n8b'), { ...TX, ...data });
  const CARD = ['1234_5678_9012_3456', '1234__5678__9012__3456', '1_2_3_4_5_6_7_8_9_0_1_2_3', 'a1234_5678_9012_3', '1234-5678-9012-3456', '1234 5678 9012 3456',
    '1234.5678.9012.3456', '1234/5678/9012/3456', '1234,5678,9012,3456', '1234:5678:9012:3456', '1234|5678|9012|3456', '1234＿5678＿9012＿3456', '1234\n5678\n9012\n3456', '4049470006627012'];
  test('필드 값(categoryId·accountId·recurringId)에 모든 구분자 거부', async () => {
    for (const v of CARD) {
      await assertFails(tx({ categoryId: v }));
      await assertFails(tx({ accountId: v }));
      await assertFails(tx({ recurringId: v }));
    }
  });
  test('예산 키: 밑줄·쉼표·영문으로 이은 카드번호 거부(쉼표 키가 여러 키처럼 통과하던 틈 포함)', async () => {
    const b = (byCategory) => setDoc(doc(alice(), 'users/alice/budgets/2026-12'), { total: 1, byCategory });
    for (const v of CARD) await assertFails(b({ food: 1, [v]: 1 }));
    await assertFails(b({ 'food,cafe': 1 }));
    await assertFails(b({ '1234a5678b9012c3456': 1 }));
    await assertSucceeds(b({ food: 1, cafe: 2, 'etc-in': 3, a_b: 4, Xk3J9aZ0qLm2nB7cD4eF: 5, n1234567890: 6 }));
  });
  test('문서 id(경로)도 같은 형식: 카드번호 모양 문서 거부, 정상 id 허용', async () => {
    for (const v of CARD.filter((x) => !/[/\n]/.test(x))) {
      await assertFails(setDoc(doc(alice(), `users/alice/transactions/${v}`), TX));
      await assertFails(setDoc(doc(alice(), `users/alice/categories/${v}`), { name: '카드', emoji: '💳', kind: 'expense' }));
      await assertFails(setDoc(doc(alice(), `users/alice/accounts/${v}`), { name: '카드', type: 'card' }));
      await assertFails(setDoc(doc(alice(), `users/alice/goals/${v}`), { name: '여행', target: 1000, saved: 0 }));
    }
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/transactions/Xk3J9aZ0qLm2nB7cD4eF'), TX));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/categories/etc-in'), { name: '기타', emoji: '🧾', kind: 'income' }));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/accounts/card'), { name: '카드', type: 'card' }));
    // 예전 형식 문서는 읽기·삭제 가능(쓰기만 검사)
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users/alice/transactions/1234_5678_9012_3456'), TX));
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/transactions/1234_5678_9012_3456')));
    await assertSucceeds(deleteDoc(doc(alice(), 'users/alice/transactions/1234_5678_9012_3456')));
  });
  test('태그 안 줄바꿈(한 태그가 여러 태그처럼 통과하던 틈) 거부', async () => {
    await assertFails(tx({ tags: ['ab\ncd'] }));
    await assertSucceeds(tx({ tags: ['여행', '제주'] }));
  });
  test('카드 끝 4자리·자동 id·하이픈 기본 id는 그대로 허용', async () => {
    await assertSucceeds(tx({ importHash: '0123456789abcdef', card4: '7012', categoryId: 'etc-in', accountId: 'Xk3J9aZ0qLm2nB7cD4eF', recurringId: 'r1_2' }));
  });
});

// ── QA 4차 R1: 앱이 실제로 만드는 문서 id로 생성·수정·삭제·복구 한 번씩 성공 ──
// 하드코딩 문자열만으로 끝내지 않음 → 앱 생성 함수·기본값에서 id를 가져와 씀
describe('R1 앱이 만드는 문서 id (생성 함수로 만든 id)', () => {
  const TXB = { date: '2026-11-30', amount: 550000, kind: 'expense', categoryId: 'housing', memo: '월세', recurringId: 'r31' };

  test('recTxId(반복id, ym)로 만든 거래: 생성·수정·삭제·복구', async () => {
    // 짧은 영문 id·자동 id 모양·하이픈 기본 id를 반복 id로 씀(앱 saveRecurring은 Firestore 자동 id)
    const rids = ['r31', 'r29', 'Xk3J9aZ0qLm2nB7cD4eF', 'rent_home'];
    for (const rid of rids) {
      const id = recTxId(rid, '2026-11');
      expect(id).toBe(`rec-${rid}-2026-11`);
      const ref = doc(alice(), `users/alice/transactions/${id}`);
      await assertSucceeds(setDoc(ref, { ...TXB, recurringId: rid }));
      await assertSucceeds(updateDoc(ref, { amount: 560000, memo: '월세 조정' }));
      await assertSucceeds(deleteDoc(ref));
      // 삭제 후 같은 id로 되살리기(restoreTx)
      await assertSucceeds(setDoc(ref, { ...TXB, recurringId: rid, amount: 550000 }));
      await assertSucceeds(deleteDoc(ref));
    }
    // 월말·윤년 경계 ym
    for (const ym of ['2026-02', '2027-02', '2026-12']) {
      const id = recTxId('r31', ym);
      await assertSucceeds(setDoc(doc(alice(), `users/alice/transactions/${id}`), { ...TXB, date: `${ym}-28`, recurringId: 'r31' }));
    }
  });

  test('기본 카테고리·결제수단 id(defaults.js)로 문서·필드 쓰기', async () => {
    for (const c of DEFAULT_CATEGORIES) {
      await assertSucceeds(setDoc(doc(alice(), `users/alice/categories/${c.id}`), { name: c.name, emoji: c.emoji, kind: c.kind, order: c.order ?? 0 }));
      await assertSucceeds(setDoc(doc(alice(), 'users/alice/transactions/tDef'), { ...TX, categoryId: c.id, kind: c.kind === 'income' ? 'income' : 'expense', amount: 1000 }));
    }
    for (const a of DEFAULT_ACCOUNTS) {
      await assertSucceeds(setDoc(doc(alice(), `users/alice/accounts/${a.id}`), { name: a.name, type: a.type, emoji: a.emoji, order: 0 }));
      await assertSucceeds(setDoc(doc(alice(), 'users/alice/transactions/tAcc'), { ...TX, accountId: a.id }));
    }
  });

  test('Firestore 자동 id(doc)로 만든 거래·규칙·반복·목표: 생성·수정·삭제', async () => {
    const txRef = doc(collection(alice(), 'users/alice/transactions'));
    await assertSucceeds(setDoc(txRef, TX));
    await assertSucceeds(updateDoc(txRef, { amount: 2000 }));
    await assertSucceeds(deleteDoc(txRef));
    await assertSucceeds(setDoc(txRef, TX)); // 복구

    const ruleRef = doc(collection(alice(), 'users/alice/rules'));
    await assertSucceeds(setDoc(ruleRef, { match: '스타벅스', categoryId: 'cafe', field: 'memo' }));
    await assertSucceeds(updateDoc(ruleRef, { match: '스타벅스 리저브' }));
    await assertSucceeds(deleteDoc(ruleRef));

    const recRef = doc(collection(alice(), 'users/alice/recurring'));
    await assertSucceeds(setDoc(recRef, { name: '넷플릭스', amount: 17000, kind: 'expense', categoryId: 'telecom', dayOfMonth: 15, active: true, startYm: '2026-10' }));
    // 그 반복 id로 자동 기록 문서
    const auto = recTxId(recRef.id, '2026-10');
    await assertSucceeds(setDoc(doc(alice(), `users/alice/transactions/${auto}`), { ...TX, date: '2026-10-15', categoryId: 'telecom', recurringId: recRef.id, memo: '넷플릭스' }));
    await assertSucceeds(updateDoc(doc(alice(), `users/alice/transactions/${auto}`), { amount: 18000 }));
    await assertSucceeds(deleteDoc(doc(alice(), `users/alice/transactions/${auto}`)));
    await assertSucceeds(setDoc(doc(alice(), `users/alice/transactions/${auto}`), { ...TX, date: '2026-10-15', categoryId: 'telecom', recurringId: recRef.id, memo: '넷플릭스' }));

    const goalRef = doc(collection(alice(), 'users/alice/goals'));
    await assertSucceeds(setDoc(goalRef, { name: '여행', target: 1000000, saved: 0, emoji: '✈️' }));
    await assertSucceeds(updateDoc(goalRef, { saved: 10000 }));
    await assertSucceeds(deleteDoc(goalRef));
  });

  test('가져오기 묶음 id(imp- + Date.now().toString(36)) 생성·거래 연결·삭제', async () => {
    // src/ui/importer.js:105 와 같은 방식
    const batchId = `imp-${Date.now().toString(36)}`;
    expect(batchId).toMatch(/^imp-[0-9a-z]{6,12}$/);
    await assertSucceeds(setDoc(doc(alice(), `users/alice/imports/${batchId}`), { count: 2, at: serverTimestamp(), from: '2026-10-01', to: '2026-10-05', label: '현대카드' }));
    const t1 = doc(collection(alice(), 'users/alice/transactions'));
    await assertSucceeds(setDoc(t1, { ...TX, importHash: '0123456789abcdef', importBatch: batchId, card4: '7012' }));
    await assertSucceeds(deleteDoc(t1));
    await assertSucceeds(deleteDoc(doc(alice(), `users/alice/imports/${batchId}`)));
  });

  test('예산 ym 문서·카테고리 키(기본 id), 잘못된 rec- 형식은 거부', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/budgets/2026-11'), { total: 1500000, byCategory: { food: 400000, 'etc-in': 0, housing: 550000 } }));
    // 가운데가 카드번호 모양·빈 구간·잘못된 달
    await assertFails(setDoc(doc(alice(), 'users/alice/transactions/rec-1234_5678_9012_3456-2026-11'), TXB));
    await assertFails(setDoc(doc(alice(), 'users/alice/transactions/rec--2026-11'), TXB));
    await assertFails(setDoc(doc(alice(), 'users/alice/transactions/rec-r31-2026-13'), TXB));
    await assertFails(setDoc(doc(alice(), 'users/alice/transactions/rec-r31-202611'), TXB));
    // 카테고리 문서에는 rec- 형식 불가(txDocId가 아님)
    await assertFails(setDoc(doc(alice(), 'users/alice/categories/rec-r31-2026-11'), { name: 'x', emoji: '💳', kind: 'expense' }));
  });
});

describe('R2 N8 잔여: 영문자 끼운 카드번호 모양', () => {
  const tx = (data) => setDoc(doc(alice(), 'users/alice/transactions/n8c'), { ...TX, ...data });
  test('recurringId·예산 키에서 영문자 구분 카드번호 거부', async () => {
    for (const v of ['1234a5678b9012c3456', '4049x4700x0662x7012', '1234A5678B9012C3456']) {
      await assertFails(tx({ recurringId: v }));
      await assertFails(tx({ categoryId: v }));
      await assertFails(setDoc(doc(alice(), 'users/alice/budgets/2026-12'), { total: 1, byCategory: { [v]: 1 } }));
    }
  });
  test('정상 자동 id·짧은 id는 그대로 허용', async () => {
    await assertSucceeds(tx({ recurringId: 'Xk3J9aZ0qLm2nB7cD4eF', categoryId: 'food', accountId: 'card' }));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/budgets/2026-12'), { total: 1, byCategory: { food: 1, Xk3J9aZ0qLm2nB7cD4eF: 2, n1234567890: 3 } }));
  });
});

// ── QA 5차 R6: 예산 키에 영문·밑줄을 섞은 카드번호 모양 ──
describe('R6 예산 키: 영문·밑줄 섞인 카드번호 모양 거부', () => {
  const b = (byCategory) => setDoc(doc(alice(), 'users/alice/budgets/2026-12'), { total: 1, byCategory });
  test('섞은 구분자 거부(한 키·여러 키 사이)', async () => {
    for (const v of ['1234a5678_9012b3456', '1234_5678x9012_3456', '1234_a5678_B9012_c3456', 'a1_2b3_4c5_6d7_8e9_0f1_2g3', '1234567890123']) {
      await assertFails(b({ [v]: 1 }));
      await assertFails(b({ food: 1, [v]: 2, cafe: 3 }));
    }
  });
  test('앱이 만드는 키는 통과: 기본 카테고리 id·자동 id(생성 함수)·하이픈 기본 id', async () => {
    const auto = Array.from({ length: 10 }, () => safeRef(() => doc(collection(alice(), 'users/alice/categories'))).id);
    const keys = [...DEFAULT_CATEGORIES.map((c) => c.id), ...auto].slice(0, 30);
    await assertSucceeds(b(Object.fromEntries(keys.map((k, i) => [k, i]))));
    await assertSucceeds(b({ 'etc-in': 1, a_b: 2, n1234567890: 3, Xk3J9aZ0qLm2nB7cD4eF: 4 }));
  });
});

// ── QA 5차 R5: 형식 밖 반복 id(숫자 13개 이상) ──
describe('R5 형식 밖 반복 id: 새 id 만들기·옮기기·되돌리기', () => {
  const BAD = 'q1w2e3r4t5y6u7i8o9p0a1s2d3';
  const REC = { name: '월세', amount: 550000, kind: 'expense', categoryId: 'housing', dayOfMonth: 1, active: true, startYm: '2026-10', lastPosted: '2026-10' };
  test('safeRef: 카드번호 모양 id는 다시 뽑아 규칙을 통과', async () => {
    const ids = ['1a2b3c4d5e6f7g8h9i0j1k2l3', 'Xk3J9aZ0qLm2nB7cD4eF']; let i = 0;
    const ref = safeRef(() => doc(alice(), `users/alice/recurring/${ids[i++]}`));
    expect(ref.id).toBe('Xk3J9aZ0qLm2nB7cD4eF');
    await assertSucceeds(setDoc(ref, REC));
    // 자동 id 100개: 모두 규칙 통과
    for (let k = 0; k < 100; k++) expect(looksLikeCard(safeRef(() => doc(collection(alice(), 'users/alice/recurring'))).id)).toBe(false);
  });
  test('예전 반복을 같은 새 id로 옮기는 묶음(새 문서 쓰기+예전 문서 지우기)과 그 rec- 기록이 허용됨', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `users/alice/recurring/${BAD}`), REC));
    await assertFails(setDoc(doc(alice(), `users/alice/recurring/${BAD}`), REC)); // 예전 id로는 못 씀
    const nid = fixedRecId(BAD);
    await assertSucceeds(setDoc(doc(alice(), `users/alice/recurring/${nid}`), { ...REC, lastPosted: '2026-11' }));
    await assertSucceeds(deleteDoc(doc(alice(), `users/alice/recurring/${BAD}`)));
    await assertSucceeds(setDoc(doc(alice(), `users/alice/transactions/${recTxId(nid, '2026-11')}`), { ...TX, date: '2026-11-01', categoryId: 'housing', recurringId: nid, memo: '월세' }));
  });
  test('되돌리기 시도 순서: 같은 id·새 id는 거부, 마지막(반복 id 뺌)은 새 id로 허용', async () => {
    const tx = { id: `rec-${BAD}-2026-10`, date: '2026-10-01', amount: 550000, kind: 'expense', categoryId: 'housing', memo: '월세', recurringId: BAD };
    const plans = restorePlans(tx);
    expect(plans).toHaveLength(3);
    await assertFails(setDoc(doc(alice(), `users/alice/transactions/${tx.id}`), plans[0].data));
    await assertFails(setDoc(doc(collection(alice(), 'users/alice/transactions')), plans[1].data));
    await assertSucceeds(setDoc(doc(collection(alice(), 'users/alice/transactions')), { ...plans[2].data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });
});
