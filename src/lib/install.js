// 앱으로 설치: 상태 고르기, 처음 몇 번만 보이는 작은 안내, beforeinstallprompt 붙잡아 두기.
// 브라우저 객체(window, navigator, localStorage)를 인자로 받아서 node 테스트에서도 확인할 수 있게 둡니다.
import { isIOS, isStandalone } from './authEnv.js';

export const HINT_KEY = 'installHint'; // 'off' 면 작은 안내를 닫은 것(다시 안 띄움)
// 이 기기에서 앱을 쓴 날 수(설치 안내용). 계정 데이터가 아니라 기기 저장소라서, 같은 기기를 여러 계정이 쓰면 함께 세고
// 다른 기기에서는 처음부터 다시 셉니다. 설치 여부도 기기마다 다르니 일부러 기기 단위로 둠.
export const VISIT_KEY = 'installVisits';
export const VISIT_DAY_KEY = 'installVisitDay'; // 마지막으로 센 날(YYYY-MM-DD). 같은 날 여러 번 열어도 한 번만
export const HINT_FROM = 2; // 첫 방문은 쓰는 방식 고르기가 먼저라 두 번째부터
export const HINT_UNTIL = 5; // 다섯 번째 방문까지만

// 앱 안 브라우저(카카오톡·네이버·인스타그램·페이스북·라인 등): 설치 메뉴가 없어 다른 브라우저로 열어야 함
const IN_APP = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp/;
// 아이폰의 다른 브라우저. iOS 16.4부터 공유 메뉴에 '홈 화면에 추가'가 생김
// (Google Chrome 고객센터 '웹 앱 사용 - iPhone·iPad': 주소창 오른쪽 공유 → 홈 화면에 추가, 2023-07 크롬 업데이트)
const IOS_BROWSER = /CriOS|FxiOS|EdgiOS/;
const IOS_OTHER = /CriOS|FxiOS|EdgiOS|OPiOS|Whale/;
export const isInApp = (nav = {}) => IN_APP.test(nav.userAgent || '');
export const isIOSSafari = (nav = {}) => isIOS(nav) && /Safari/.test(nav.userAgent || '') && !IOS_OTHER.test(nav.userAgent || '') && !isInApp(nav);
/** 'CPU iPhone OS 17_5' → [17, 5]. 아이패드(맥 UA)처럼 버전이 안 보이면 null */
export function iosVersion(nav = {}) {
  const m = /OS (\d+)_(\d+)/.exec(nav.userAgent || '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}
const iosAtLeast164 = (nav) => { const v = iosVersion(nav); return !v || v[0] > 16 || (v[0] === 16 && v[1] >= 4); };
// 맥 사파리 17(macOS Sonoma)부터 파일 → 'Dock에 추가'
export function isMacSafariDock(nav = {}) {
  const ua = nav.userAgent || '';
  if (!/Macintosh/.test(ua) || (nav.maxTouchPoints || 0) > 1 || /Chrome|Chromium|Edg\/|Firefox|OPR\//.test(ua)) return false;
  const v = /Version\/(\d+)/.exec(ua);
  return /Safari/.test(ua) && !!v && Number(v[1]) >= 17;
}

/**
 * 설정의 '앱 설치' 칸에 무엇을 보여 줄지.
 * standalone: 이미 앱으로 실행 중(칸 숨김) · thanks: 방금 설치함 · prompt: 설치 창을 띄울 수 있음
 * ios-safari: 공유 → 홈 화면에 추가 안내 · ios-browser: 아이폰 크롬·엣지·파이어폭스(iOS 16.4+)의 공유 → 홈 화면에 추가
 * ios-other: 사파리에서 열어 달라는 안내(앱 안 브라우저, 16.4 전 iOS) · in-app: 안드로이드 앱 안 브라우저(다른 브라우저로 열기)
 * prompt-used: 설치 창을 띄웠다가 닫음(브라우저 메뉴로 다시 설치 가능) · mac-safari: 맥 사파리 17+ 'Dock에 추가'
 * manual: 설치 창이 오지 않음(이미 설치됐거나 옛 바로가기가 남았거나, 설치를 지원하지 않는 브라우저)
 */
export function installState({ win, nav = {}, hasPrompt = false, installed = false, promptUsed = false } = {}) {
  if (isStandalone(win, nav)) return 'standalone';
  if (installed) return 'thanks';
  if (isIOS(nav)) {
    if (isIOSSafari(nav)) return 'ios-safari';
    return IOS_BROWSER.test(nav.userAgent || '') && !isInApp(nav) && iosAtLeast164(nav) ? 'ios-browser' : 'ios-other';
  }
  if (hasPrompt) return 'prompt';
  if (isInApp(nav)) return 'in-app';
  if (promptUsed) return 'prompt-used';
  return isMacSafariDock(nav) ? 'mac-safari' : 'manual';
}

// 처음 몇 번 쓴 방문자에게만, 닫지 않았고, 실제로 설치할 수 있을 때만.
// manual(설치 창이 안 옴)은 이미 설치한 사람일 수 있어 띄우지 않음.
const HINT_STATES = new Set(['prompt', 'ios-safari', 'ios-browser', 'ios-other']);
export function shouldShowHint({ state, visits = 0, dismissed = false }) {
  return !dismissed && visits >= HINT_FROM && visits <= HINT_UNTIL && HINT_STATES.has(state);
}

export function hintDismissed(storage = globalThis.localStorage) {
  try { return storage?.getItem(HINT_KEY) === 'off'; } catch { return false; }
}
export function dismissHint(storage = globalThis.localStorage) {
  try { storage?.setItem(HINT_KEY, 'off'); } catch { /* 저장 불가면 이번 화면만 */ }
}

/**
 * 로그인 뒤 홈을 처음 그릴 때 부름. 쓴 날 수를 돌려줌: 같은 날은 몇 번 열어도(새로 고침·로그인 화면 포함) 한 번만 셈.
 * HINT_UNTIL+1 에서 멈춰 계속 쓰지 않음.
 */
export function bumpVisits(storage = globalThis.localStorage, day = '') {
  try {
    const n = Math.max(0, Number.parseInt(storage?.getItem(VISIT_KEY), 10) || 0);
    if (n > HINT_UNTIL) return n;
    if (day && storage?.getItem(VISIT_DAY_KEY) === day) return n;
    storage?.setItem(VISIT_KEY, String(n + 1));
    if (day) storage?.setItem(VISIT_DAY_KEY, day);
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
  let used = false; // 설치 창을 띄웠다가 닫음
  let busy = false; // 설치 창이 떠 있는 동안(두 번 눌러도 한 번만)
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
    promptUsed: () => used && !deferred,
    busy: () => busy,
    /** 'accepted' | 'dismissed' | 'unavailable' | 'busy'. 한 번 쓴 이벤트는 다시 못 쓰므로 비움. */
    async prompt() {
      if (busy) return 'busy';
      const e = deferred;
      if (!e) return 'unavailable';
      deferred = null;
      busy = true;
      try {
        await e.prompt();
        const choice = await e.userChoice;
        const r = choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
        if (r === 'dismissed') used = true;
        return r;
      } catch { return 'unavailable'; } finally { busy = false; }
    },
  };
}
