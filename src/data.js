// 로그인과 공용 상태. Firestore 관련 코드는 store.js로 나눠 로그인한 뒤에만 불러온다.
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, browserPopupRedirectResolver, getRedirectResult, signInWithCredential, signOut, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider, firebaseConfig } from './firebase.js';
import { pickLoginMode, isIOS, isStandalone, isSameOriginAuth, loginErrorMessage } from './lib/authEnv.js';
import { LEGACY_FEATURES } from './lib/modes.js';

const listeners = new Set();
const freshMode = () => ({ settings: null, settingsLoaded: false, mode: null, legacyMode: true, askMode: false, features: { ...LEGACY_FEATURES } });
export const state = {
  ready: false, user: null, profile: null, categories: [], accounts: [], budget: null, txs: [], rules: [], recurring: [], goals: [], imports: [], kept: [],
  assetAccounts: [], holdings: [], contributions: [], assetPrefs: null,
  txWindow: null, txLoaded: false, pendingWrites: false,
  // 불러오기 상태(화면 안내용): storeFailed 앱 조각을 못 받음 · syncError 서버 읽기 거부·실패 · slow 오래 기다림 · accountEmpty 이 계정엔 기록이 하나도 없음
  storeFailed: false, syncError: null, slow: false, accountEmpty: false,
  ...freshMode(),
};
const emit = () => listeners.forEach((fn) => fn(state));
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
let writeErrorHandler = null;
// Google 리다이렉트 결과가 처리되기 전에는 히스토리 센티널을 넣지 않기 위한 신호
let redirectSettled = Promise.resolve();
export const whenAuthRedirectSettled = () => redirectSettled;
export const onWriteError = (fn) => (writeErrorHandler = fn);
let loginErrorHandler = null;
export const onLoginError = (fn) => (loginErrorHandler = fn);

// 아이폰 홈 화면 앱이면서 로그인 도우미가 같은 주소(dmlwjd85.github.io)에 있을 때만 리다이렉트로 로그인
const env = () => ({ authDomain: firebaseConfig.authDomain, host: location.host, nav: navigator, win: window });
const loginMode = () => pickLoginMode(env());
export function loginErrorText(e) {
  return loginErrorMessage(e?.code, { iosHomeApp: isIOS(navigator) && isStandalone(window, navigator), sameOrigin: isSameOriginAuth(firebaseConfig.authDomain, location.host) });
}

// Firestore 묶음은 한 번만 불러옴. 전에 로그인했던 기기면 인증 확인과 동시에 미리 받기 시작.
let store = null, storeP = null;
const SIGNED_IN = 'signedIn';
// 배포 직후 예전 화면이 새 조각을 못 받는 경우 등: 실패하면 다음에 다시 시도할 수 있게 비워 둠(조용히 빈 화면이 되지 않게 storeFailed 표시)
const loadStore = () => (storeP ??= import('./store.js').then((m) => {
  m.bind({ state, emit, onError: (e, retry) => writeErrorHandler?.(e, retry) });
  state.storeFailed = false;
  return (store = m);
}).catch((e) => { storeP = null; throw e; }));
// 첫 데이터가 이만큼 지나도 안 오면 '오래 걸려요' 안내(오프라인이면 바로 오프라인 안내)
export const SLOW_MS = 8000;
let slowTimer = null;
function armSlow() {
  clearTimeout(slowTimer);
  state.slow = false;
  slowTimer = setTimeout(() => { if (state.user && !(state.profileKnown && state.txLoaded)) { state.slow = true; emit(); } }, SLOW_MS);
}

export function initAuth() {
  if (!auth) { state.ready = true; emit(); return; }
  if (localStorage.getItem(SIGNED_IN)) loadStore();
  // 팝업이 막혀 리다이렉트로 로그인한 경우에만 결과 처리기를 불러옴
  // 리다이렉트로 로그인하고 돌아왔을 때만 결과 처리기를 불러옴(아이폰 홈 화면 앱, 또는 팝업이 막힌 경우)
  if (sessionStorage.getItem('authRedirect') || loginMode() === 'redirect') {
    sessionStorage.removeItem('authRedirect');
    redirectSettled = Promise.resolve()
      .then(() => getRedirectResult(auth, browserPopupRedirectResolver))
      .catch((e) => { console.error(e); loginErrorHandler?.(e); });
  }
  onAuthStateChanged(auth, async (user) => {
    store?.stopAll();
    let failed = false;
    if (user) {
      localStorage.setItem(SIGNED_IN, '1');
      try { await loadStore(); } catch (e) { console.error(e); failed = true; }
      if (auth.currentUser?.uid !== user.uid) return; // 기다리는 사이 로그아웃·계정 전환됨
    } else localStorage.removeItem(SIGNED_IN);
    Object.assign(state, { user, ...emptyData(), ready: true, storeFailed: failed, ...freshMode() });
    if (user && store) { store.startUser(); armSlow(); } else clearTimeout(slowTimer);
    emit();
  });
}

const emptyData = () => ({ profile: null, profileLoaded: false, profileKnown: false, categories: [], accounts: [], budget: null, txs: [], rules: [], recurring: [], goals: [], imports: [], kept: [], assetAccounts: [], holdings: [], contributions: [], assetPrefs: null, txWindow: null, txLoaded: false, budgetYm: null, syncError: null, slow: false, accountEmpty: false });

// '다시 불러오기': 서버 구독을 처음부터 다시(쓰기 없음). 앱 조각을 못 받았으면 다시 받아 보고, 그래도 안 되면 화면을 새로 엶.
export async function reloadData() {
  const user = auth?.currentUser;
  if (!user) return 'signed-out';
  if (!store) {
    try { await loadStore(); } catch (e) { console.error(e); location.reload(); return 'reload'; }
  }
  if (auth.currentUser?.uid !== user.uid) return 'changed';
  store.stopAll();
  Object.assign(state, { user, ...emptyData(), storeFailed: false, ...freshMode() });
  store.startUser(); armSlow();
  emit();
  return 'restarted';
}
// '다른 구글 계정으로 연결': 구글 계정 고르는 창(select_account)을 바로 띄움. 고르면 그 계정으로 바뀌고, 창을 닫으면 지금 계정 그대로.
// 같은 계정을 다시 고르면 계정 변경 알림이 오지 않으니 구독을 다시 시작.
export async function switchAccount() {
  const before = auth.currentUser?.uid;
  await login();
  if (before && auth.currentUser?.uid === before) await reloadData();
}

// 아래 함수들은 로그인한 화면에서만 불리므로 store가 이미 준비돼 있음
const call = (name) => (...a) => store?.[name](...a);
export const watchMonth = call('watchMonth');
export const saveTx = call('saveTx');
export const saveTxBatch = call('saveTxBatch');
export const restoreTx = call('restoreTx');
export const retryKept = call('retryKept');
export const deleteTx = call('deleteTx');
export const saveCategory = call('saveCategory');
export const deleteCategory = call('deleteCategory');
export const saveAccount = call('saveAccount');
export const deleteAccount = call('deleteAccount');
export const reorderCategories = call('reorderCategories');
export const setBudget = call('setBudget');
export const setProfile = call('setProfile');
export const saveSettings = call('saveSettings');
export const ensureStudentIncome = call('ensureStudentIncome');
export const restoreBackup = call('restoreBackup');
export const allTransactions = call('allTransactions');
export const deleteEverything = call('deleteEverything');
export const saveRule = call('saveRule');
export const deleteRule = call('deleteRule');
export const saveRecurring = call('saveRecurring');
export const deleteRecurring = call('deleteRecurring');
export const postRecurring = call('postRecurring');
export const saveGoal = call('saveGoal');
export const deleteGoal = call('deleteGoal');
export const txsInRange = call('txsInRange');
export const importTxs = call('importTxs');
export const undoImport = call('undoImport');
export const allBudgets = call('allBudgets');
export const saveAssetAccount = call('saveAssetAccount');
export const saveHolding = call('saveHolding');
export const saveContribution = call('saveContribution');
export const saveAssetPrefs = call('saveAssetPrefs');
export const deleteAssetAccount = call('deleteAssetAccount');
export const deleteHolding = call('deleteHolding');
export const deleteContribution = call('deleteContribution');
export const assetExport = call('assetExport');

export async function login() {
  if (loginMode() === 'redirect') {
    sessionStorage.setItem('authRedirect', '1');
    return signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
  }
  try { await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver); }
  catch (e) {
    // 팝업이 막힌 환경에서만 리다이렉트로 전환(이전엔 괄호가 빠져 모든 오류에서 리다이렉트되던 문제 수정)
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      sessionStorage.setItem('authRedirect', '1');
      return signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
    }
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    throw e;
  }
}
// 에뮬레이터 전용: 테스트 계정 로그인
export const loginTestUser = (name = '테스트') =>
  signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: 'test-user-1', email: 'test@example.com', email_verified: true, name })));
export const logout = () => signOut(auth);
