// Firebase 설정 여부만 판단 (SDK를 불러오지 않음 → 설정 안내 화면이 가벼움)
const env = import.meta.env;
export const useEmulator = env.VITE_USE_EMULATOR === 'true';
export const firebaseConfig = useEmulator
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-gagyebu', appId: 'demo-app' }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    };
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
