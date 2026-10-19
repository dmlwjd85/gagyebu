import { readFileSync } from 'node:fs';
import { describe, test, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

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
    await assertFails(deleteDoc(doc(bob(), p)));
    await assertFails(getDoc(doc(anon(), p)));
  });
});
