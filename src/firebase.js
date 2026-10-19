import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from 'firebase/firestore';

import { useEmulator, firebaseConfig, isFirebaseConfigured } from './config.js';
export { useEmulator, firebaseConfig, isFirebaseConfigured };

let app = null, auth = null, db = null;
if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  // 팝업 처리기는 로그인 버튼을 누를 때만 불러옴(첫 화면에서 Google iframe 로딩 생략)
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  // 오프라인 캐시: 인터넷이 끊겨도 기록하고, 연결되면 자동 업로드
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  if (useEmulator) {
    const host = location.hostname || '127.0.0.1';
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
  }
} else {
  console.info('[쓱 가계부] Firebase 설정값이 없어 설정 안내 화면을 보여 줍니다. (.env.example 참고)');
}
export { app, auth, db };
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
