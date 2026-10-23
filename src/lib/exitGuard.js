// 휴대폰·브라우저 뒤로가기로 앱을 나가기 직전에 '종료할까요?'를 묻는다.
// 탭 이동은 주소만 바꾸고(replace), 모달은 이 가드가 닫지 않는다.
// Google 리다이렉트 로그인이 끝날 때까지는 히스토리를 건드리지 않는다.
//
// Chrome(Android 포함)은 사용자 제스처 없이 pushState 한 같은 문서 기록을
// 뒤로가기 버튼이 건너뛴다. 전부 건너뛰면 Android 는 앱을 바로 닫고 popstate 가
// 오지 않는다. 그래서 센티널은 로그인 직후가 아니라 첫 제스처에서만 넣고,
// 뒤로가기로 그 칸이 사라진 뒤에는 취소 제스처에서만 다시 넣는다.
// popstate 안에서 다시 pushState 하면 직전 제스처를 인정하지 않아 다시 건너뛰게 된다.

export const EXIT_MARK = 'gagyebuExit';
export const EXIT_CONFIRM_TITLE = '종료할까요?';

export function shouldArmExitGuard({ loggedIn = false, redirectPending = false, leaving = false } = {}) {
  return Boolean(loggedIn) && !redirectPending && !leaving;
}

/**
 * popstate 한 번의 계획.
 * trap: 센티널이 실제로 깔려 있을 때만. 없으면 브라우저 기본 뒤로가기(앱 종료)를 막지 않는다.
 * confirm: 종료 대화상자를 연다(이미 떠 있으면 다시 열지 않음)
 * closeModal: 항상 false — 시트·대화상자 닫기는 기존 버튼·Escape 그대로
 */
export function planExitPop({
  armed = false, leaving = false, redirectPending = false, confirming = false, pushed = false,
} = {}) {
  if (!armed || !pushed || leaving || redirectPending) return { trap: false, confirm: false, closeModal: false };
  return { trap: true, confirm: !confirming, closeModal: false };
}

/** 탭·설정 이동은 히스토리를 쌓지 않는다. push 하면 뒤로가기가 탭을 바꾸게 된다. */
export function viewChangeHistoryMode() {
  return 'replace';
}

/** 뒤로가기는 센티널 한 칸만 소비하므로, 종료는 그 아래(이전 페이지·PWA 루트)로 한 걸음이다. */
export function leaveHistoryDelta() {
  return -1;
}

/** 종료 확인을 닫는 제스처(취소 버튼, 배경, Escape). 종료 버튼은 포함하지 않는다. */
export function isExitDismissGesture(event) {
  if (!event) return false;
  if (event.type === 'keydown') return event.key === 'Escape';
  if (event.type !== 'click' || !event.target) return false;
  const el = event.target.nodeType === 1 ? event.target : event.target.parentElement;
  if (!el?.closest) return false;
  if (el.closest('[data-v="0"]')) return true;
  return Boolean(el.classList?.contains('dlg-wrap'));
}

export function createExitGuard({
  history,
  confirm,
  closeWindow,
  isHidden = () => false,
  schedule = (fn, ms) => setTimeout(fn, ms),
} = {}) {
  let armed = false;
  let pushed = false;
  let leaving = false;
  let confirming = false;
  let redirectPending = false;
  let stayUrl = '';

  function noteStay(url) {
    if (url) stayUrl = url;
  }

  function pushSentinel() {
    const state = { [EXIT_MARK]: 1 };
    try {
      if (stayUrl) history.pushState(state, '', stayUrl);
      else history.pushState(state, '');
    } catch {
      pushed = false;
      return false;
    }
    pushed = true;
    return true;
  }

  function canPush() {
    return armed && !pushed && !leaving && !redirectPending;
  }

  function sync({ loggedIn = false, redirectPending: rp = false } = {}) {
    redirectPending = !!rp;
    if (leaving) return;
    armed = shouldArmExitGuard({ loggedIn, redirectPending: rp, leaving });
    // 여기서 pushState 하지 않는다. 로그인 콜백에는 사용자 제스처가 없다.
  }

  // 첫 pointerdown·keydown. 확인 창이 떠 있는 동안에는 넣지 않는다(종료 버튼이 센티널을 다시 만들면 나가지 못함).
  function onUserGesture() {
    if (!canPush() || confirming) return false;
    return pushSentinel();
  }

  // 취소·배경·Escape. 이 이벤트 안에 호출해야 새 센티널이 뒤로가기에서 건너뛰어지지 않는다.
  function rearm() {
    if (!canPush()) return false;
    return pushSentinel();
  }

  // 새로고침으로 부모 기록을 다시 깐 뒤, 그 안의 센티널을 이미 넣은 것으로 친다.
  function claimPushed() {
    pushed = true;
    return true;
  }

  // 센티널 칸은 소비됐지만 종료 확인은 열지 않을 때(하위 화면·시트).
  function forgetSentinel() {
    if (leaving) return false;
    pushed = false;
    return true;
  }

  function willTrap() {
    return planExitPop({ armed, leaving, redirectPending, confirming, pushed }).trap;
  }

  function onPopState() {
    const plan = planExitPop({ armed, leaving, redirectPending, confirming, pushed });
    if (!plan.trap) {
      if (!leaving) pushed = false;
      return plan;
    }
    // 센티널은 이미 소비됐다. 이 콜백에서 pushState 하면 제스처가 없어 다시 건너뛰게 된다.
    pushed = false;
    if (plan.confirm) {
      confirming = true;
      Promise.resolve()
        .then(() => confirm())
        .then((ok) => {
          confirming = false;
          if (ok && !leaving) leave();
        })
        .catch(() => { confirming = false; });
    }
    return plan;
  }

  function leave() {
    if (leaving) return;
    leaving = true;
    armed = false;
    pushed = false;
    history.go(leaveHistoryDelta());
    schedule(() => {
      if (isHidden()) return;
      try { closeWindow?.(); } catch { /* 스크립트가 연 창이 아니면 브라우저가 무시 */ }
    }, 80);
  }

  return {
    noteStay, sync, onUserGesture, rearm, claimPushed, forgetSentinel, willTrap, onPopState,
    isLeaving: () => leaving,
    isConfirming: () => confirming,
  };
}
