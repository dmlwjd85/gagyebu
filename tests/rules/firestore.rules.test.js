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
    await assertFails(setDoc(doc(alice(), 'users/alice/recurring/r1'), { amount: 1 }));
    await assertFails(getDoc(doc(alice(), 'users/alice/secrets/s1')));
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
