// 앱으로 설치: 상태 고르기, 처음 몇 번만 보이는 작은 안내, beforeinstallprompt 붙잡아 두기.
// 브라우저 객체(window, navigator, localStorage)를 인자로 받아서 node 테스트에서도 확인할 수 있게 둡니다.
import { isIOS, isStandalone } from './authEnv.js';

export const HINT_KEY = 'installHint'; // 'off' 면 작은 안내를 닫은 것(다시 안 띄움)
export const VISIT_KEY = 'installVisits'; // 이 기기에서 앱을 연 횟수(설치 안내용, 계정 데이터 아님)
export const HINT_FROM = 2; // 첫 방문은 쓰는 방식 고르기가 먼저라 두 번째부터
export const HINT_UNTIL = 5; // 다섯 번째 방문까지만

// 아이폰에서 사파리가 아닌 브라우저(크롬·파이어폭스·엣지·웨일·카카오톡·네이버 등 앱 안 브라우저)
const IOS_OTHER = /CriOS|FxiOS|EdgiOS|OPiOS|Whale|KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//;
export const isIOSSafari = (nav = {}) => isIOS(nav) && /Safari/.test(nav.userAgent || '') && !IOS_OTHER.test(nav.userAgent || '');

/**
 * 설정의 '앱 설치' 칸에 무엇을 보여 줄지.
 * standalone: 이미 앱으로 실행 중(칸 숨김) · thanks: 방금 설치함 · prompt: 설치 창을 띄울 수 있음
 * ios-safari: 공유 → 홈 화면에 추가 안내 · ios-other: 사파리에서 열어 달라는 안내
 * manual: 설치 창이 오지 않음(이미 설치됐거나 옛 바로가기가 남았거나, 설치를 지원하지 않는 브라우저)
 */
export function installState({ win, nav = {}, hasPrompt = false, installed = false } = {}) {
  if (isStandalone(win, nav)) return 'standalone';
  if (installed) return 'thanks';
  if (isIOS(nav)) return isIOSSafari(nav) ? 'ios-safari' : 'ios-other';
  return hasPrompt ? 'prompt' : 'manual';
}

// 처음 몇 번 쓴 방문자에게만, 닫지 않았고, 실제로 설치할 수 있을 때만.
// manual(설치 창이 안 옴)은 이미 설치한 사람일 수 있어 띄우지 않음.
export function shouldShowHint({ state, visits = 0, dismissed = false }) {
  return !dismissed && visits >= HINT_FROM && visits <= HINT_UNTIL && (state === 'prompt' || state === 'ios-safari' || state === 'ios-other');
}

export function hintDismissed(storage = globalThis.localStorage) {
  try { return storage?.getItem(HINT_KEY) === 'off'; } catch { return false; }
}
export function dismissHint(storage = globalThis.localStorage) {
  try { storage?.setItem(HINT_KEY, 'off'); } catch { /* 저장 불가면 이번 화면만 */ }
}

/** 앱을 열 때 한 번 부름. 늘어난 방문 횟수를 돌려줌(HINT_UNTIL+1 에서 멈춰 계속 쓰지 않음). */
export function bumpVisits(storage = globalThis.localStorage) {
  try {
    const n = Math.max(0, Number.parseInt(storage?.getItem(VISIT_KEY), 10) || 0);
    if (n > HINT_UNTIL) return n;
    storage?.setItem(VISIT_KEY, String(n + 1));
    return n + 1;
  } catch { return 0; }
}

/**
 * beforeinstallprompt 를 붙잡아 두었다가 버튼을 누르면 prompt() 를 띄움. appinstalled 뒤에는 installed() 가 true.
 * onChange('prompt' | 'installed') 로 화면을 다시 그리게 알림.
 */
export function createInstaller({ win = globalThis, onChange = () => {} } = {}) {
  let deferred = null;
  let installed = false;
  win.addEventListener?.('beforeinstallprompt', (e) => {
    e.preventDefault(); // 크롬 기본 띠(미니 인포바) 대신 앱 안 버튼으로
    deferred = e;
    onChange('prompt');
  });
  win.addEventListener?.('appinstalled', () => {
    deferred = null;
    installed = true;
    onChange('installed');
  });
  return {
    hasPrompt: () => !!deferred,
    installed: () => installed,
    /** 'accepted' | 'dismissed' | 'unavailable'. 한 번 쓴 이벤트는 다시 못 쓰므로 비움. */
    async prompt() {
      const e = deferred;
      if (!e) return 'unavailable';
      deferred = null;
      try {
        await e.prompt();
        const choice = await e.userChoice;
        return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
      } catch { return 'unavailable'; }
    },
  };
}
