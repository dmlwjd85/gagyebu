// Firestore 데이터 계층(로그인한 뒤에만 불러옴). 모든 경로는 users/{uid} 아래.
// 로그인 화면에서는 이 파일과 Firestore SDK(약 150kB, 압축 기준)를 받지 않아 첫 화면이 빠름.
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator, doc, collection, onSnapshot, query, where, orderBy, setDoc, deleteDoc, writeBatch, serverTimestamp, getDocs } from 'firebase/firestore';
import { signOut, deleteUser } from 'firebase/auth';
import { app, auth, useEmulator } from './firebase.js';
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, FALLBACK_CATEGORY } from './lib/defaults.js';
import { period, shiftYm } from './lib/dates.js';

// 오프라인 캐시: 인터넷이 끊겨도 기록하고, 연결되면 자동 업로드
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
if (useEmulator) connectFirestoreEmulator(db, location.hostname || '127.0.0.1', 8080);

// data.js가 넘겨주는 공용 상태·알림 함수
let state, emit, writeErrorHandler;
export function bind(ctx) { state = ctx.state; emit = ctx.emit; writeErrorHandler = (e) => ctx.onError?.(e); }

let unsubs = [], txUnsub = null, budgetUnsub = null;
export function stopAll() {
  unsubs.forEach((f) => f()); unsubs = []; txUnsub?.(); txUnsub = null; budgetUnsub?.(); budgetUnsub = null;
}
const u = (...p) => doc(db, 'users', state.user.uid, ...p);
const col = (name) => collection(db, 'users', state.user.uid, name);

// 쓰기는 오프라인에서도 즉시 로컬 반영되고, 서버 응답은 기다리지 않는다.
function fire(promise, onError) {
  promise.catch((e) => { console.error(e); onError?.(e); });
}

export function startUser() {
  unsubs.push(onSnapshot(u(), { includeMetadataChanges: true }, (snap) => {
    state.profile = snap.exists() ? snap.data() : { monthStartDay: 1 };
    state.profileLoaded = true;
    if (!snap.exists() && !snap.metadata.fromCache) seedDefaults();
    emit();
  }));
  unsubs.push(onSnapshot(col('categories'), (s) => {
    state.categories = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    emit();
  }));
  unsubs.push(onSnapshot(col('accounts'), (s) => {
    state.accounts = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    emit();
  }));
}

// 첫 로그인: 기본 카테고리·결제수단 생성
async function seedDefaults() {
  const b = writeBatch(db);
  for (const { id, ...c } of DEFAULT_CATEGORIES) b.set(u('categories', id), c);
  DEFAULT_ACCOUNTS.forEach(({ id, ...a }, order) => b.set(u('accounts', id), { ...a, order }));
  b.set(u(), { displayName: state.user.displayName ?? '', currency: 'KRW', monthStartDay: 1, seeded: true, createdAt: serverTimestamp() });
  fire(b.commit(), writeErrorHandler);
}

// 보고 있는 달 기준 6개 기간 거래 구독(차트 추이용)
export function watchMonth(ym) {
  if (!state.user) return;
  const sd = state.profile?.monthStartDay ?? 1;
  const start = period(shiftYm(ym, -5), sd).start, end = period(ym, sd).end;
  const key = `${start}~${end}`;
  if (state.txWindow !== key) {
    txUnsub?.();
    state.txWindow = key; state.txLoaded = false;
    const q = query(col('transactions'), where('date', '>=', start), where('date', '<', end), orderBy('date', 'desc'));
    txUnsub = onSnapshot(q, { includeMetadataChanges: true }, (s) => {
      state.txs = s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
      state.txLoaded = true;
      state.pendingWrites = s.metadata.hasPendingWrites;
      emit();
    });
  }
  if (state.budgetYm !== ym) {
    budgetUnsub?.();
    state.budgetYm = ym; state.budget = null;
    budgetUnsub = onSnapshot(u('budgets', ym), (s) => { state.budget = s.exists() ? s.data() : { total: 0 }; emit(); });
  }
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
const txFields = ({ date, amount, kind, categoryId, accountId, memo, tags }) => clean({ date, amount, kind, categoryId, accountId, memo, tags: tags?.length ? tags : undefined });
export const tagsOf = (memo = '') => [...new Set((memo.match(/#[^\s#]{1,20}/g) || []).map((t) => t.slice(1)))].slice(0, 20);

export function saveTx(tx) {
  const ref = tx.id ? u('transactions', tx.id) : doc(col('transactions'));
  const data = { ...txFields({ ...tx, tags: tagsOf(tx.memo) }), updatedAt: serverTimestamp(), ...(tx.id ? {} : { createdAt: serverTimestamp() }) };
  if (tx.id && tx.createdAt) data.createdAt = tx.createdAt;
  fire(setDoc(ref, data), writeErrorHandler);
  return ref.id;
}
// 여러 건 한 번에 저장 (400건씩 묶음)
export async function saveTxBatch(list) {
  for (let i = 0; i < list.length; i += 400) {
    const b = writeBatch(db);
    list.slice(i, i + 400).forEach((tx) => b.set(doc(col('transactions')), { ...txFields({ ...tx, tags: tagsOf(tx.memo) }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await b.commit();
  }
}
export function restoreTx(tx) { // 되돌리기: 같은 id로 되살림
  const { id, ...rest } = tx;
  fire(setDoc(u('transactions', id), { ...txFields(rest), ...(rest.createdAt ? { createdAt: rest.createdAt } : {}), updatedAt: serverTimestamp() }), writeErrorHandler);
}
export const deleteTx = (id) => fire(deleteDoc(u('transactions', id)), writeErrorHandler);

export function saveCategory(c) {
  const ref = c.id ? u('categories', c.id) : doc(col('categories'));
  fire(setDoc(ref, clean({ name: c.name.trim(), emoji: c.emoji, kind: c.kind, order: c.order ?? 0, archived: c.archived || undefined, budget: c.budget })), writeErrorHandler);
  return ref.id;
}
// 카테고리 삭제: 그 카테고리 거래는 '기타'로 옮겨 보존
export async function deleteCategory(c) {
  const fallback = FALLBACK_CATEGORY[c.kind];
  if (c.id === fallback) throw new Error('기본 기타 카테고리는 지울 수 없어요.');
  const snap = await getDocs(query(col('transactions'), where('categoryId', '==', c.id)));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const b = writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => b.update(d.ref, { categoryId: fallback, updatedAt: serverTimestamp() }));
    if (i + 400 >= docs.length) b.delete(u('categories', c.id));
    await b.commit();
  }
  if (!docs.length) await deleteDoc(u('categories', c.id));
  return docs.length;
}
export function saveAccount(a) {
  const ref = a.id ? u('accounts', a.id) : doc(col('accounts'));
  fire(setDoc(ref, clean({ name: a.name.trim(), type: a.type ?? 'card', emoji: a.emoji, order: a.order ?? 0, archived: a.archived || undefined })), writeErrorHandler);
  return ref.id;
}
// 결제수단 삭제: 기존 기록은 그대로 두고(이름만 사라짐) 문서만 지움
export const deleteAccount = (id) => fire(deleteDoc(u('accounts', id)), writeErrorHandler);
export function reorderCategories(list) {
  const b = writeBatch(db);
  list.forEach((c, i) => b.update(u('categories', c.id), { order: i }));
  fire(b.commit(), writeErrorHandler);
}
export function setBudget(ym, total, byCategory) {
  fire(setDoc(u('budgets', ym), clean({ total, byCategory, updatedAt: serverTimestamp() })), writeErrorHandler);
}
export function setProfile(patch) {
  fire(setDoc(u(), { ...patch, updatedAt: serverTimestamp() }, { merge: true }), writeErrorHandler);
}
export async function allTransactions() {
  const s = await getDocs(query(col('transactions'), orderBy('date')));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
// 모든 기록 삭제(계정 삭제 포함)
export async function deleteEverything() {
  for (const name of ['transactions', 'categories', 'accounts', 'budgets']) {
    const s = await getDocs(col(name));
    for (let i = 0; i < s.docs.length; i += 400) {
      const b = writeBatch(db);
      s.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  }
  await deleteDoc(u());
  try { await deleteUser(auth.currentUser); } catch (e) { await signOut(auth); return 'signed-out'; }
  return 'deleted';
}

