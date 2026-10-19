// Firestore 데이터 계층(로그인한 뒤에만 불러옴). 모든 경로는 users/{uid} 아래.
// 로그인 화면에서는 이 파일과 Firestore SDK(약 150kB, 압축 기준)를 받지 않아 첫 화면이 빠름.
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator, doc, collection, onSnapshot, query, where, orderBy, setDoc, deleteDoc, writeBatch, serverTimestamp, getDocs, getDocsFromCache, Timestamp } from 'firebase/firestore';
import { signOut, deleteUser } from 'firebase/auth';
import { app, auth, useEmulator } from './firebase.js';
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, FALLBACK_CATEGORY } from './lib/defaults.js';
import { period, shiftYm, ymd, addDays } from './lib/dates.js';
import { dueOccurrences } from './lib/recurring.js';
import { safeRef, isRuleId, fixedRecId } from './lib/ids.js';
import { restorePlans, keptList, keepTx, unkeep } from './lib/restore.js';

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
// 새 자동 id: 규칙이 거부하는 카드번호 모양(숫자 13개 이상)이면 다시 뽑음(QA R5)
const newRef = (name) => safeRef(() => doc(col(name)));

// 쓰기는 오프라인에서도 즉시 로컬 반영되고, 서버 응답은 기다리지 않는다.
function fire(promise, onError) {
  promise.catch((e) => { console.error(e); onError?.(e); });
}

export function startUser() {
  state.kept = keptList(state.user.uid);
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
  // M2: 자동 분류 규칙·반복 거래·저축 목표 (모두 개수가 적어 전체 구독)
  // 가져오기 묶음 기록(되돌리기용): 묶음 id·건수·기간·형식 이름만(파일 이름·원본 없음)
  unsubs.push(onSnapshot(col('imports'), (s) => {
    // at(서버 시각) → 이 기기 시간 기준 'YYYY-MM-DDTHH:mm' 글자
    const local = (t) => { const x = t?.toDate?.(); return x ? `${ymd(x)}T${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}` : ''; };
    state.imports = s.docs.map((d) => { const v = d.data({ serverTimestamps: 'estimate' }); return { id: d.id, ...v, at: local(v.at) }; })
      .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
    emit();
  }));
  unsubs.push(onSnapshot(col('rules'), (s) => { state.rules = s.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }));
  unsubs.push(onSnapshot(col('goals'), (s) => {
    state.goals = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    emit();
  }));
  let posted = false;
  unsubs.push(onSnapshot(col('recurring'), { includeMetadataChanges: true }, (s) => {
    state.recurring = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.dayOfMonth - b.dayOfMonth);
    // 서버 기준 목록을 받은 뒤 한 번만 밀린 회차 기록(캐시만 보고 쓰면 다른 기기 기록을 모름)
    if (!posted && !s.metadata.fromCache) { posted = true; postRecurring(ymd(new Date())); retryKept({ quiet: true }); }
    emit();
  }));
}

// 반복 거래: 오늘까지 밀린 회차를 거래로 기록. 거래 id 고정 → 여러 기기에서 동시에 돌아도 한 번만
// 반복마다 따로 씀(QA R5): 한 반복이 거부돼도 다른 반복의 기록은 막히지 않음.
// 규칙에 맞지 않는 예전 반복 id(숫자 13개 이상)는 같은 묶음에서 늘 같은 새 id로 옮긴 뒤 기록.
const recFields = (r) => clean({ name: r.name, amount: r.amount, kind: r.kind, categoryId: r.categoryId, accountId: r.accountId, dayOfMonth: r.dayOfMonth,
  active: Boolean(r.active), startYm: r.startYm, lastPosted: r.lastPosted, createdAt: r.createdAt });
export function postRecurring(today) {
  let n = 0;
  for (const r of state.recurring) {
    const rid = isRuleId(r.id) ? r.id : fixedRecId(r.id);
    const due = dueOccurrences({ ...r, id: rid }, today);
    if (!due.length && rid === r.id) continue;
    const b = writeBatch(db);
    for (const o of due) {
      b.set(u('transactions', o.id), clean({ date: o.date, amount: r.amount, kind: r.kind, categoryId: r.categoryId, accountId: r.accountId, memo: r.name, recurringId: rid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    }
    const lastPosted = due.length ? due[due.length - 1].ym : r.lastPosted;
    if (rid === r.id) b.update(u('recurring', rid), { lastPosted, updatedAt: serverTimestamp() });
    else { b.set(u('recurring', rid), { ...recFields({ ...r, lastPosted }), updatedAt: serverTimestamp() }); b.delete(u('recurring', r.id)); }
    fire(b.commit(), writeErrorHandler);
    n += due.length;
  }
  return n;
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
const txFields = ({ date, amount, kind, categoryId, accountId, memo, tags, importHash, importBatch, recurringId, card4 }) =>
  clean({ date, amount, kind, categoryId, accountId, memo, tags: tags?.length ? tags : undefined, importHash, importBatch, recurringId, card4 });
export const tagsOf = (memo = '') => [...new Set((memo.match(/#[^\s#]{1,20}/g) || []).map((t) => t.slice(1)))].slice(0, 20);

export function saveTx(tx) {
  const ref = tx.id ? u('transactions', tx.id) : newRef('transactions');
  const data = { ...txFields({ ...tx, tags: tagsOf(tx.memo) }), updatedAt: serverTimestamp(), ...(tx.id ? {} : { createdAt: serverTimestamp() }) };
  if (tx.id && tx.createdAt) data.createdAt = tx.createdAt;
  fire(setDoc(ref, data), writeErrorHandler);
  return ref.id;
}
// 여러 건 한 번에 저장 (400건씩 묶음)
export async function saveTxBatch(list) {
  for (let i = 0; i < list.length; i += 400) {
    const b = writeBatch(db);
    list.slice(i, i + 400).forEach((tx) => b.set(newRef('transactions'), { ...txFields({ ...tx, tags: tagsOf(tx.memo) }), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await b.commit();
  }
}
// 되돌리기: 같은 id로 되살림. 거부되면 새 자동 id로, 그래도 거부되면 반복·묶음 연결을 뺀 내용으로 살림(QA R5).
// 끝내 저장하지 못하면 이 기기에 보관하고 안내(설정 › 데이터에서 다시 저장하거나 CSV로 받기).
export function restoreTx(tx, { fromKeep = false, quiet = false } = {}) {
  const uid = state.user.uid;
  const createdAt = tx.createdAt || (tx.createdAtMs ? Timestamp.fromMillis(tx.createdAtMs) : undefined);
  const plans = restorePlans(tx);
  const run = async () => {
    for (const [i, p] of plans.entries()) {
      if (!p.newId && !tx.id) continue;
      const ref = p.newId ? newRef('transactions') : u('transactions', tx.id);
      try {
        await setDoc(ref, { ...p.data, createdAt: createdAt || serverTimestamp(), updatedAt: serverTimestamp() });
        if (fromKeep) { state.kept = unkeep(uid, tx.keepKey); emit(); }
        if (i > 0 && !quiet) writeErrorHandler?.({ code: 'restored-as-new', message: '같은 칸에 되돌리지 못해 새 기록으로 살렸어요.' });
        return true;
      } catch (e) {
        console.error(e);
        if (e?.code !== 'permission-denied') break; // 거부가 아닌 오류(일시 장애 등)는 더 바꿔 보지 않고 보관
      }
    }
    if (!fromKeep) { keepTx(uid, tx); state.kept = keptList(uid); emit(); }
    if (!quiet) writeErrorHandler?.({ code: 'kept-locally', message: '서버에 저장하지 못해 이 기기에 따로 보관해 두었어요. 설정 › 데이터에서 다시 저장하거나 CSV로 받을 수 있어요.' });
    return false;
  };
  const p = run();
  p.catch((e) => console.error(e));
  return p;
}
// 이 기기에 보관해 둔 기록 다시 저장(앱을 열 때 조용히 한 번, 설정에서 버튼으로)
export async function retryKept({ quiet = false } = {}) {
  state.kept = keptList(state.user.uid);
  const list = [...state.kept];
  if (!list.length) return { saved: 0, left: 0 };
  let saved = 0;
  for (const t of list) if (await restoreTx(t, { fromKeep: true, quiet: true })) saved++;
  return { saved, left: list.length - saved };
}
export const deleteTx = (id) => fire(deleteDoc(u('transactions', id)), writeErrorHandler);

export function saveCategory(c) {
  const ref = c.id ? u('categories', c.id) : newRef('categories');
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
  const ref = a.id ? u('accounts', a.id) : newRef('accounts');
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
// ── M2 ──
export function saveRule(r) {
  const ref = r.id ? u('rules', r.id) : newRef('rules');
  fire(setDoc(ref, { match: r.match.trim().slice(0, 40), field: 'memo', categoryId: r.categoryId, updatedAt: serverTimestamp() }), writeErrorHandler);
  return ref.id;
}
export const deleteRule = (id) => fire(deleteDoc(u('rules', id)), writeErrorHandler);

export function saveRecurring(r) {
  const data = clean({ name: r.name.trim(), amount: r.amount, kind: r.kind, categoryId: r.categoryId, accountId: r.accountId, dayOfMonth: r.dayOfMonth,
    active: Boolean(r.active), startYm: r.startYm, lastPosted: r.lastPosted, updatedAt: serverTimestamp(), ...(r.id ? {} : { createdAt: serverTimestamp() }) });
  // 규칙에 맞지 않는 예전 id면 늘 같은 새 id로 옮김: 새 문서 쓰기와 예전 문서 지우기를 한 묶음으로(둘 다 되거나 둘 다 안 됨, QA R5)
  if (r.id && !isRuleId(r.id)) {
    const id = fixedRecId(r.id), b = writeBatch(db);
    b.set(u('recurring', id), data); b.delete(u('recurring', r.id));
    fire(b.commit(), writeErrorHandler);
    return id;
  }
  const ref = r.id ? u('recurring', r.id) : newRef('recurring');
  fire(setDoc(ref, data), writeErrorHandler);
  return ref.id;
}
export const deleteRecurring = (id) => fire(deleteDoc(u('recurring', id)), writeErrorHandler);

export function saveGoal(g) {
  const ref = g.id ? u('goals', g.id) : newRef('goals');
  fire(setDoc(ref, clean({ name: g.name.trim(), emoji: g.emoji, target: g.target, saved: g.saved ?? 0, due: g.due, order: g.order ?? 0, updatedAt: serverTimestamp() })), writeErrorHandler);
  return ref.id;
}
export const deleteGoal = (id) => fire(deleteDoc(u('goals', id)), writeErrorHandler);

// 오프라인이면 서버를 기다리지 않고 이 기기 캐시에서 읽음(가져오기가 멈추지 않게)
const read = (q) => (navigator.onLine ? getDocs(q) : getDocsFromCache(q));
// 가져오기: 겹치는 기간의 기존 거래(중복 검사용). 날짜 ±1일 근접 중복도 보므로 앞뒤 하루씩 넓혀 읽음
export async function txsInRange(from, to) {
  const s = await read(query(col('transactions'), where('date', '>=', addDays(from, -1)), where('date', '<=', addDays(to, 1))));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
// 가져오기 저장: 원본 줄은 저장하지 않고 앱 형식 칸 + 지문·묶음 id·카드 끝 4자리만.
// 쓰기는 이 기기에 바로 반영되고 서버 응답은 기다리지 않음(오프라인이면 연결될 때 올라감)
export function importTxs(items, batchId, meta = {}) {
  for (let i = 0; i < items.length; i += 400) {
    const b = writeBatch(db);
    items.slice(i, i + 400).forEach((x) => b.set(newRef('transactions'), {
      ...txFields({ date: x.date, amount: x.amount, kind: x.kind, categoryId: x.categoryId, accountId: x.accountId, memo: x.memo,
        tags: tagsOf(x.memo), importHash: x.importHash, importBatch: batchId, card4: x.card4 ?? undefined }),
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    if (i === 0) b.set(u('imports', batchId), clean({ count: items.length, from: meta.from, to: meta.to, label: meta.label?.slice(0, 20), at: serverTimestamp() }));
    fire(b.commit(), writeErrorHandler);
  }
  return { count: items.length, pending: !navigator.onLine };
}
// 가져오기 묶음 전체 되돌리기(고친 거래도 묶음 id가 남아 있어 함께 지워짐)
export async function undoImport(batchId) {
  const s = await read(query(col('transactions'), where('importBatch', '==', batchId)));
  for (let i = 0; i < s.docs.length || i === 0; i += 400) {
    const b = writeBatch(db);
    s.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
    if (i === 0) b.delete(u('imports', batchId));
    fire(b.commit(), writeErrorHandler);
  }
  return s.docs.length;
}
// JSON 백업용: 모든 달 예산
export async function allBudgets() {
  const s = await read(col('budgets'));
  return s.docs.map((d) => ({ ym: d.id, ...d.data() }));
}

export async function allTransactions() {
  const s = await getDocs(query(col('transactions'), orderBy('date')));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
// 모든 기록 삭제(계정 삭제 포함)
export async function deleteEverything() {
  for (const name of ['transactions', 'categories', 'accounts', 'budgets', 'rules', 'recurring', 'goals', 'imports']) {
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

