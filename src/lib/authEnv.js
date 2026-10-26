// 로그인 방식 고르기와 로그인 오류 안내 문구.
// 브라우저 객체(navigator, window)를 인자로 받아서 node 테스트에서도 확인할 수 있게 둡니다.

// 아이폰·아이패드인지(아이패드는 데스크톱 Safari처럼 Macintosh로 나오므로 터치 지원으로 구분)
export function isIOS(nav = {}) {
  const ua = nav.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
}

// 홈 화면에 설치한 앱(standalone)으로 열렸는지
export function isStandalone(win, nav = {}) {
  if (nav.standalone === true) return true;
  try { return Boolean(win?.matchMedia?.('(display-mode: standalone)').matches); } catch { return false; }
}

// 로그인 도우미(authDomain)가 앱과 같은 주소에서 돌고 있는지
export const isSameOriginAuth = (authDomain, host) => Boolean(authDomain) && authDomain === host;

// 아이폰 홈 화면 앱은 팝업이 Safari 쪽 저장소로 열려 결과를 앱으로 못 가져옵니다.
// 그래서 같은 주소의 로그인 도우미가 준비됐을 때만 이 경우에 리다이렉트로 로그인합니다.
// 데스크톱·안드로이드·아이폰 Safari 탭은 지금처럼 팝업을 씁니다.
export function pickLoginMode({ authDomain, host, nav, win }) {
  return isIOS(nav) && isStandalone(win, nav) && isSameOriginAuth(authDomain, host) ? 'redirect' : 'popup';
}

export function loginErrorMessage(code, { iosHomeApp = false, sameOrigin = false } = {}) {
  if (code === 'auth/network-request-failed') return '인터넷 연결이 불안정해요. 연결을 확인하고 다시 눌러 주세요.';
  if (iosHomeApp && !sameOrigin) return '아이폰 홈 화면 앱에서는 지금 Google 로그인이 잘 안 돼요. 고치고 있으니, 그동안은 Safari에서 쨈 가계부를 열어 로그인해 주세요.';
  return '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
