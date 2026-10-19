// 로그인과 공용 상태. Firestore 관련 코드는 store.js로 나눠 로그인한 뒤에만 불러온다.
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, browserPopupRedirectResolver, getRedirectResult, signInWithCredential, signOut, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider, firebaseConfig } from './firebase.js';
import { pickLoginMode, isIOS, isStandalone, isSameOriginAuth, loginErrorMessage } from './lib/authEnv.js';

const listeners = new Set();
export const state = {
  ready: false, user: null, profile: null, categories: [], accounts: [], budget: null, txs: [], rules: [], recurring: [], goals: [], imports: [], kept: [],
  txWindow: null, txLoaded: false, pendingWrites: false,
};
const emit = () => listeners.forEach((fn) => fn(state));
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
let writeErrorHandler = null;
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
const loadStore = () => (storeP ??= import('./store.js').then((m) => {
  m.bind({ state, emit, onError: (e, retry) => writeErrorHandler?.(e, retry) });
  return (store = m);
}));

export function initAuth() {
  if (!auth) { state.ready = true; emit(); return; }
  if (localStorage.getItem(SIGNED_IN)) loadStore();
  // 팝업이 막혀 리다이렉트로 로그인한 경우에만 결과 처리기를 불러옴
  // 리다이렉트로 로그인하고 돌아왔을 때만 결과 처리기를 불러옴(아이폰 홈 화면 앱, 또는 팝업이 막힌 경우)
  if (sessionStorage.getItem('authRedirect') || loginMode() === 'redirect') {
    sessionStorage.removeItem('authRedirect');
    getRedirectResult(auth, browserPopupRedirectResolver).catch((e) => { console.error(e); loginErrorHandler?.(e); });
  }
  onAuthStateChanged(auth, async (user) => {
    store?.stopAll();
    if (user) {
      localStorage.setItem(SIGNED_IN, '1');
      try { await loadStore(); } catch (e) { console.error(e); }
      if (auth.currentUser?.uid !== user.uid) return; // 기다리는 사이 로그아웃·계정 전환됨
    } else localStorage.removeItem(SIGNED_IN);
    Object.assign(state, { user, profile: null, categories: [], accounts: [], budget: null, txs: [], rules: [], recurring: [], goals: [], imports: [], kept: [], txWindow: null, txLoaded: false, budgetYm: null, ready: true });
    if (user && store) store.startUser();
    emit();
  });
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
