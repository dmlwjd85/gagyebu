// Firestore 데이터 계층(로그인한 뒤에만 불러옴). 모든 경로는 users/{uid} 아래.
// 로그인 화면에서는 이 파일과 Firestore SDK(약 150kB, 압축 기준)를 받지 않아 첫 화면이 빠름.
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator, doc, collection, onSnapshot, query, where, orderBy, setDoc, deleteDoc, deleteField, writeBatch, serverTimestamp, getDocs, getDocsFromCache, getDoc, getDocFromCache } from 'firebase/firestore';
import { signOut, deleteUser } from 'firebase/auth';
import { app, auth, useEmulator, emu } from './firebase.js';
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, FALLBACK_CATEGORY } from './lib/defaults.js';
import { period, shiftYm, ymd, addDays } from './lib/dates.js';
import { dueOccurrences, recTxId } from './lib/recurring.js';
import { resolveMode, STUDENT_INCOME, activeStartDay } from './lib/modes.js';
import { ownerToWrite } from './lib/couple.js';
import { ackOrTimeout, RESTORE_ACK_MS } from './lib/restoreWait.js';

// 오프라인 캐시: 인터넷이 끊겨도 기록하고, 연결되면 자동 업로드
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
if (useEmulator) connectFirestoreEmulator(db, emu.host, emu.fsPort);

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
  unsubs.push(onSnapshot(u('settings', 'prefs'), (s) => {
    state.settings = s.exists() ? { id: s.id, ...s.data() } : null;
    state.settingsLoaded = true;
    applyMode(state.settings);
    emit();
  }));
  let posted = false;
  const byOrder = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
  unsubs.push(onSnapshot(col('assetAccounts'), (s) => { state.assetAccounts = byOrder(s); emit(); }));
  unsubs.push(onSnapshot(col('holdings'), (s) => {
    state.holdings = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
    emit();
  }));
  unsubs.push(onSnapshot(col('contributions'), (s) => {
    state.contributions = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    emit();
  }));
  unsubs.push(onSnapshot(u('assetPrefs', 'tax'), (s) => { state.assetPrefs = s.exists() ? { id: s.id, ...s.data() } : null; emit(); }));
  unsubs.push(onSnapshot(col('recurring'), { includeMetadataChanges: true }, (s) => {
    state.recurring = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.dayOfMonth - b.dayOfMonth);
    // 서버 기준 목록을 받은 뒤 한 번만 밀린 회차 기록(캐시만 보고 쓰면 다른 기기 기록을 모름)
    if (!posted && !s.metadata.fromCache) { posted = true; postRecurring(ymd(new Date())); }
    emit();
  }));
}

// 반복 거래: 오늘까지 밀린 회차를 거래로 기록. 거래 id 고정 → 여러 기기에서 동시에 돌아도 한 번만
function applyMode(settings) {
  const info = resolveMode(settings);
  state.mode = info.mode;
  state.legacyMode = info.legacy;
  state.features = info.features;
  state.askMode = info.askMode;
}

export function postRecurring(today) {
  // 설정을 받기 전에는 기존과 같이 기록(모드 없는 사용자). 기능을 끄면 새 기록만 멈춘다. 이미 있는 거래는 그대로.
  if (state.settingsLoaded && state.features && !state.features.recurring) return 0;
  const b = writeBatch(db); let n = 0;
  for (const r of state.recurring) {
    const due = dueOccurrences(r, today);
    if (!due.length) continue;
    for (const o of due) {
      b.set(u('transactions', o.id), clean({ date: o.date, amount: r.amount, kind: r.kind, categoryId: r.categoryId, accountId: r.accountId, memo: r.name, recurringId: r.id, owner: ownerToWrite(r.owner), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }), { merge: true });
      n++;
    }
    b.update(u('recurring', r.id), { lastPosted: due[due.length - 1].ym, updatedAt: serverTimestamp() });
  }
  if (n) fire(b.commit(), writeErrorHandler);
  return n;
}

// 첫 로그인: 기본 카테고리·결제수단 생성
async function seedDefaults() {
  const b = writeBatch(db);
  for (const { id, ...c } of DEFAULT_CATEGORIES) b.set(u('categories', id), c);
  DEFAULT_ACCOUNTS.forEach(({ id, ...a }, order) => b.set(u('accounts', id), { ...a, order }));
  b.set(u(), { displayName: state.user.displayName ?? '', currency: 'KRW', monthStartDay: 1, seeded: true, createdAt: serverTimestamp() });
  fire(b.commit(), writeErrorHandler);
  // 첫 시작 안내. 규칙이 아직 없으면 실패해도 기본 데이터는 남고, 메뉴는 지금과 같이 모두 보인다.
  fire(setDoc(u('settings', 'prefs'), { askMode: true, updatedAt: serverTimestamp() }), () => {});
}

// 보고 있는 달 기준 6개 기간 거래 구독(차트 추이용)
export function watchMonth(ym) {
  if (!state.user) return;
  const sd = activeStartDay(state.settings, state.profile, state.features);
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
const txFields = ({ date, amount, kind, categoryId, accountId, memo, tags, importHash, importBatch, recurringId, card4, owner }) =>
  clean({ date, amount, kind, categoryId, accountId, memo, tags: tags?.length ? tags : undefined, importHash, importBatch, recurringId, card4, owner: owner === '나' ? '나' : ownerToWrite(owner) });
// 고칠 때 비울 수 있는 칸. owner는 넣지 않는다(없으면 서버 값을 남김).
const TX_CLEAR = ['accountId', 'memo', 'tags', 'importHash', 'importBatch', 'recurringId', 'card4'];
const cleared = (data, keys) => {
  const out = { ...data };
  for (const k of keys) if (!(k in out)) out[k] = deleteField();
  return out;
};
export const tagsOf = (memo = '') => [...new Set((memo.match(/#[^\s#]{1,20}/g) || []).map((t) => t.slice(1)))].slice(0, 20);

export function saveTx(tx) {
  const ref = tx.id ? u('transactions', tx.id) : doc(col('transactions'));
  const data = { ...txFields({ ...tx, tags: tagsOf(tx.memo) }), updatedAt: serverTimestamp(), ...(tx.id ? {} : { createdAt: serverTimestamp() }) };
  if (tx.id && tx.createdAt) data.createdAt = tx.createdAt;
  // 고치기: 아는 칸만 합친다. 이 버전이 모르는 칸과, 빠뜨린 owner는 서버에 남는다.
  // 비운 메모·결제수단 등은 지운다. 새 기록은 통째로 만든다.
  if (tx.id) fire(setDoc(ref, cleared(data, TX_CLEAR), { merge: true }), writeErrorHandler);
  else fire(setDoc(ref, data), writeErrorHandler);
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
// 되돌리기: 같은 id로 되살림. 규칙이 그 id 쓰기를 거부하면(예전 형식·일시 오류) 새 자동 id로 살려 유실을 막음.
export function restoreTx(tx) {
  const { id, ...rest } = tx;
  const data = { ...txFields(rest), ...(rest.createdAt ? { createdAt: rest.createdAt } : {}), updatedAt: serverTimestamp() };
  // 스냅샷에 owner가 없으면 '나'. 필드를 빼면 규칙이 덮어쓰기를 거부한다. 읽는 값은 나와 같다.
  if (!data.owner) data.owner = '나';
  const p = setDoc(u('transactions', id), data).catch(async (e) => {
    if (e?.code !== 'permission-denied') throw e;
    const ref = doc(col('transactions'));
    await setDoc(ref, { ...data, createdAt: rest.createdAt || serverTimestamp() });
    writeErrorHandler?.({ code: 'restored-as-new', message: '같은 칸에 되돌리지 못해 새 기록으로 살렸어요.' });
  });
  fire(p, writeErrorHandler);
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
export function saveSettings(patch) {
  const data = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) data[k] = deleteField();
    else if (v !== undefined && v !== '') data[k] = v;
  }
  fire(setDoc(u('settings', 'prefs'), data, { merge: true }), writeErrorHandler);
}
// 알바·심부름. 이미 있는 카테고리는 이름·이모지를 덮지 않는다.
export async function ensureStudentIncome() {
  for (const c of STUDENT_INCOME) {
    const ref = u('categories', c.id);
    let exists = state.categories?.some((x) => x.id === c.id);
    if (!exists) {
      try { exists = (await readDoc(ref)).exists(); } catch { exists = false; }
    }
    if (!exists) fire(setDoc(ref, { name: c.name, emoji: c.emoji, kind: c.kind, order: c.order }), writeErrorHandler);
  }
}
// ── M2 ──
export function saveRule(r) {
  const ref = r.id ? u('rules', r.id) : doc(col('rules'));
  fire(setDoc(ref, { match: r.match.trim().slice(0, 40), field: 'memo', categoryId: r.categoryId, updatedAt: serverTimestamp() }), writeErrorHandler);
  return ref.id;
}
export const deleteRule = (id) => fire(deleteDoc(u('rules', id)), writeErrorHandler);

export function saveRecurring(r) {
  const ref = r.id ? u('recurring', r.id) : doc(col('recurring'));
  const data = clean({ name: r.name.trim(), amount: r.amount, kind: r.kind, categoryId: r.categoryId, accountId: r.accountId, dayOfMonth: r.dayOfMonth,
    active: Boolean(r.active), startYm: r.startYm, lastPosted: r.lastPosted, owner: r.owner === '나' ? '나' : ownerToWrite(r.owner),
    updatedAt: serverTimestamp(), ...(r.id ? {} : { createdAt: serverTimestamp() }) });
  if (r.id) {
    if (!('accountId' in data)) data.accountId = deleteField();
    fire(setDoc(ref, data, { merge: true }), writeErrorHandler);
  } else fire(setDoc(ref, data), writeErrorHandler);
  return ref.id;
}
export const deleteRecurring = (id) => fire(deleteDoc(u('recurring', id)), writeErrorHandler);

export function saveGoal(g) {
  const ref = g.id ? u('goals', g.id) : doc(col('goals'));
  fire(setDoc(ref, clean({ name: g.name.trim(), emoji: g.emoji, target: g.target, saved: g.saved ?? 0, due: g.due, order: g.order ?? 0, updatedAt: serverTimestamp() })), writeErrorHandler);
  return ref.id;
}
export const deleteGoal = (id) => fire(deleteDoc(u('goals', id)), writeErrorHandler);

const stamp = (id, createdAt) => ({ updatedAt: serverTimestamp(), ...(createdAt ? { createdAt } : id ? {} : { createdAt: serverTimestamp() }) });
export function saveAssetAccount(a) {
  const ref = a.id ? u('assetAccounts', a.id) : doc(col('assetAccounts'));
  fire(setDoc(ref, clean({
    type: a.type, institution: a.institution.trim(), name: a.name.trim(), opened: a.opened,
    maturity: a.type === 'isa' ? a.maturity : undefined,
    expectedPension: a.type === 'civil' ? a.expectedPension : undefined,
    order: a.order ?? 0, archived: a.archived || undefined, ...stamp(a.id, a.createdAt),
  })), writeErrorHandler);
  return ref.id;
}
export function saveHolding(h) {
  const ref = h.id ? u('holdings', h.id) : doc(col('holdings'));
  const priced = Number.isInteger(h.lastPrice);
  fire(setDoc(ref, clean({
    assetAccountId: h.assetAccountId, code: h.code || undefined, name: h.name.trim(), kind: h.kind,
    qtyE4: h.qtyE4, avgPrice: h.avgPrice,
    lastPrice: priced ? h.lastPrice : undefined,
    priceDate: priced ? h.priceDate : undefined,
    priceSource: priced ? (h.priceSource === 'dataGoKr' ? 'dataGoKr' : 'manual') : undefined,
    ...stamp(h.id, h.createdAt),
  })), writeErrorHandler);
  return ref.id;
}
export function saveContribution(c) {
  const ref = c.id ? u('contributions', c.id) : doc(col('contributions'));
  fire(setDoc(ref, clean({
    assetAccountId: c.assetAccountId, date: c.date, amount: c.amount, deductible: Boolean(c.deductible),
    ...stamp(c.id, c.createdAt),
  })), writeErrorHandler);
  return ref.id;
}
export function saveAssetPrefs(p) {
  fire(setDoc(u('assetPrefs', 'tax'), clean({
    pensionLimit: p.pensionLimit, combinedLimit: p.combinedLimit, rateHigh: p.rateHigh, rateLow: p.rateLow,
    rateChoice: p.rateChoice === 'low' ? 'low' : 'high', updatedAt: serverTimestamp(),
  })), writeErrorHandler);
}
export async function deleteAssetAccount(id) {
  const refs = [
    ...state.holdings.filter((h) => h.assetAccountId === id).map((h) => u('holdings', h.id)),
    ...state.contributions.filter((c) => c.assetAccountId === id).map((c) => u('contributions', c.id)),
    u('assetAccounts', id),
  ];
  for (let i = 0; i < refs.length; i += 400) {
    const b = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => b.delete(ref));
    await b.commit();
  }
}
export const deleteHolding = (id) => fire(deleteDoc(u('holdings', id)), writeErrorHandler);
export const deleteContribution = (id) => fire(deleteDoc(u('contributions', id)), writeErrorHandler);

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
    items.slice(i, i + 400).forEach((x) => b.set(doc(col('transactions')), {
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
const readDoc = (ref) => (navigator.onLine ? getDoc(ref) : getDocFromCache(ref));
export async function assetExport() {
  try {
    const [accounts, holdings, contributions, prefs] = await Promise.all([
      read(col('assetAccounts')), read(col('holdings')), read(col('contributions')), readDoc(u('assetPrefs', 'tax')),
    ]);
    return {
      assetAccounts: accounts.docs.map((d) => ({ id: d.id, ...d.data() })),
      holdings: holdings.docs.map((d) => ({ id: d.id, ...d.data() })),
      contributions: contributions.docs.map((d) => ({ id: d.id, ...d.data() })),
      assetPrefs: prefs.exists() ? { id: prefs.id, ...prefs.data() } : null,
    };
  } catch {
    return { assetAccounts: state.assetAccounts ?? [], holdings: state.holdings ?? [], contributions: state.contributions ?? [], assetPrefs: state.assetPrefs ?? null };
  }
}

export async function allTransactions() {
  const s = await getDocs(query(col('transactions'), orderBy('date')));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
// 모든 기록 삭제(계정 삭제 포함)
const dropStamp = (row) => { const { id, ym, createdAt, updatedAt, at, ...rest } = row ?? {}; return rest; };
// 오프라인이거나 서버 답이 없으면 기다리지 않고 로컬에 넣는다. 한 번 막히면 나머지는 바로 큐에 넣는다.
async function commitTracked(promise, flags) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (flags.queued || offline) {
    fire(promise);
    flags.queued = true;
    return;
  }
  const result = await ackOrTimeout(promise, RESTORE_ACK_MS);
  if (result === 'timeout') flags.queued = true;
}
// 백업에 있는 문서만 같은 id로 합친다. 파일에 없는 기록·예전 백업에 없는 컬렉션은 지우지 않는다.
export async function restoreBackup(parsed) {
  const flags = { queued: false };
  const writeList = async (name, items, idOf) => {
    const rows = (items ?? []).filter((x) => idOf(x));
    for (let i = 0; i < rows.length; i += 400) {
      const b = writeBatch(db);
      rows.slice(i, i + 400).forEach((x) => {
        const data = clean(dropStamp(x));
        if (name === 'imports' && !data.at) data.at = serverTimestamp();
        b.set(u(name, idOf(x)), data, { merge: true });
      });
      await commitTracked(b.commit(), flags);
    }
  };
  if (Number.isInteger(parsed.profile?.monthStartDay)) {
    await commitTracked(setDoc(u(), { monthStartDay: parsed.profile.monthStartDay, updatedAt: serverTimestamp() }, { merge: true }), flags);
  }
  await writeList('categories', parsed.categories, (x) => x.id);
  await writeList('accounts', parsed.accounts, (x) => x.id);
  await writeList('transactions', parsed.transactions, (x) => x.id);
  await writeList('budgets', parsed.budgets, (x) => x.ym || x.id);
  await writeList('rules', parsed.rules, (x) => x.id);
  await writeList('recurring', parsed.recurring, (x) => x.id);
  await writeList('goals', parsed.goals, (x) => x.id);
  await writeList('imports', parsed.imports, (x) => x.id);
  if (parsed.hasAssets) {
    await writeList('assetAccounts', parsed.assetAccounts, (x) => x.id);
    await writeList('holdings', parsed.holdings, (x) => x.id);
    await writeList('contributions', parsed.contributions, (x) => x.id);
    if (parsed.assetPrefs) await commitTracked(setDoc(u('assetPrefs', 'tax'), clean(dropStamp(parsed.assetPrefs)), { merge: true }), flags);
  }
  if (parsed.hasSettings && parsed.settings && Object.keys(parsed.settings).length) {
    await commitTracked(setDoc(u('settings', 'prefs'), { ...parsed.settings, updatedAt: serverTimestamp() }, { merge: true }), flags);
  }
  return { queued: flags.queued, online: typeof navigator === 'undefined' || navigator.onLine !== false };
}

export async function deleteEverything() {
  for (const name of ['transactions', 'categories', 'accounts', 'budgets', 'rules', 'recurring', 'goals', 'imports', 'assetAccounts', 'holdings', 'contributions', 'assetPrefs', 'settings']) {
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

