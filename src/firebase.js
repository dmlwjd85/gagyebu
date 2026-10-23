import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';

import { useEmulator, firebaseConfig, isFirebaseConfigured, emu } from './config.js';
export { useEmulator, firebaseConfig, isFirebaseConfigured, emu };

let app = null, auth = null;
if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  // 팝업 처리기는 로그인 버튼을 누를 때만 불러옴(첫 화면에서 Google iframe 로딩 생략)
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  // Firestore는 store.js에서 로그인한 뒤에 시작(로그인 화면을 가볍게)
  if (useEmulator) {
    connectAuthEmulator(auth, `http://${emu.host}:${emu.authPort}`, { disableWarnings: true });
  }
} else {
  console.info('[콕 가계부] Firebase 설정값이 없어 설정 안내 화면을 보여 줍니다. (.env.example 참고)');
}
export { app, auth };
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
