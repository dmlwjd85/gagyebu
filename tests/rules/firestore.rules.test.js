import { readFileSync } from 'node:fs';
import { describe, test, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gagyebu',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { displayName: 'Alice' });
    await setDoc(doc(db, 'users/alice/transactions/t1'), { amount: 1000, kind: 'expense' });
    await setDoc(doc(db, 'publicStuff/x'), { a: 1 });
  });
});
const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('본인(owner)', () => {
  test('프로필 읽기/쓰기 허용', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), { displayName: 'A' }));
  });
  test('거래 읽기/정수 금액 쓰기 허용', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/transactions/t1')));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/transactions/t2'), { amount: 5000, kind: 'income' }));
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/transactions/t1'), { amount: 2000 }));
  });
  test('하위 컬렉션(categories) 읽기/쓰기 허용', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/categories/c1'), { name: '식비' }));
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/categories/c1')));
  });
});
describe('금액 검증', () => {
  test('소수 금액 거부', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/transactions/t3'), { amount: 10.5 }));
  });
  test('문자열 금액 거부', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/transactions/t3'), { amount: '1000' }));
  });
  test('금액 누락 거부', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/transactions/t3'), { kind: 'expense' }));
  });
  test('기존 거래를 비정수로 수정 거부', async () => {
    await assertFails(updateDoc(doc(alice(), 'users/alice/transactions/t1'), { amount: 1.1 }));
  });
});
describe('타인 uid', () => {
  test('읽기 거부', async () => {
    await assertFails(getDoc(doc(bob(), 'users/alice')));
    await assertFails(getDoc(doc(bob(), 'users/alice/transactions/t1')));
  });
  test('쓰기 거부', async () => {
    await assertFails(setDoc(doc(bob(), 'users/alice'), { displayName: 'hack' }));
    await assertFails(setDoc(doc(bob(), 'users/alice/transactions/t9'), { amount: 1 }));
    await assertFails(setDoc(doc(bob(), 'users/alice/categories/c9'), { name: 'x' }));
  });
});
describe('비로그인', () => {
  test('읽기/쓰기 거부', async () => {
    await assertFails(getDoc(doc(anon(), 'users/alice')));
    await assertFails(getDoc(doc(anon(), 'users/alice/transactions/t1')));
    await assertFails(setDoc(doc(anon(), 'users/alice/transactions/t9'), { amount: 1 }));
  });
});
describe('루트/기타 컬렉션', () => {
  test('로그인 사용자도 기타 컬렉션 읽기/쓰기 거부', async () => {
    await assertFails(getDoc(doc(alice(), 'publicStuff/x')));
    await assertFails(setDoc(doc(alice(), 'publicStuff/y'), { a: 1 }));
    await assertFails(setDoc(doc(alice(), 'households/h1'), { members: {} }));
  });
  test('비로그인 기타 컬렉션 거부', async () => {
    await assertFails(getDoc(doc(anon(), 'publicStuff/x')));
    await assertFails(setDoc(doc(anon(), 'publicStuff/z'), { a: 1 }));
  });
});
