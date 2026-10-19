// Firebase 설정 여부만 판단 (SDK를 불러오지 않음 → 설정 안내 화면이 가벼움)
const env = import.meta.env;
export const useEmulator = env.VITE_USE_EMULATOR === 'true';
// 에뮬레이터 빌드에서만: 주소 뒤 ?emuProject=demo-…&emuHost=&emuAuthPort=&emuFsPort= 로 QA 도구가 따로 쓸 프로젝트·포트를 지정
// (여러 QA가 동시에 돌아도 서로 데이터를 지우지 않게, tools/qa/emu.py). 한 번 받으면 이 탭이 열려 있는 동안 기억. 실제 서비스 빌드는 읽지 않음
export function emulatorTarget(search = globalThis.location?.search ?? '', store = globalThis.sessionStorage, fallbackProject = env.VITE_FIREBASE_PROJECT_ID || 'demo-gagyebu') {
  const q = new URLSearchParams(search);
  const get = (k, ok) => {
    let v = q.get(k);
    try { if (v && ok(v)) store?.setItem(k, v); else v = store?.getItem(k); } catch { /* 저장소를 못 써도 주소 값은 씀 */ }
    return v && ok(v) ? v : null;
  };
  const isPort = (v) => /^\d{2,5}$/.test(v);
  return {
    projectId: get('emuProject', (v) => /^demo-[a-z0-9-]{1,40}$/.test(v)) || fallbackProject,
    host: get('emuHost', (v) => /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.test(v)) || globalThis.location?.hostname || '127.0.0.1',
    authPort: Number(get('emuAuthPort', isPort) || 9099),
    fsPort: Number(get('emuFsPort', isPort) || 8080),
  };
}
export const emu = useEmulator ? emulatorTarget() : null;
export const firebaseConfig = useEmulator
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: emu.projectId, appId: 'demo-app' }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    };
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
