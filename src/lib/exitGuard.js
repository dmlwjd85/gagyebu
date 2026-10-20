// 휴대폰·브라우저 뒤로가기로 앱을 나가기 직전에 '종료할까요?'를 묻는다.
// 탭 이동은 주소만 바꾸고(replace), 모달은 이 가드가 닫지 않는다.
// Google 리다이렉트 로그인이 끝날 때까지는 히스토리를 건드리지 않는다.

export const EXIT_MARK = 'gagyebuExit';
export const EXIT_CONFIRM_TITLE = '종료할까요?';

export function shouldArmExitGuard({ loggedIn = false, redirectPending = false, leaving = false } = {}) {
  return Boolean(loggedIn) && !redirectPending && !leaving;
}

/**
 * popstate 한 번의 계획.
 * trap: 센티널을 다시 넣어 문서에 머무름
 * confirm: 종료 대화상자를 연다(이미 떠 있으면 다시 열지 않음)
 * closeModal: 항상 false — 시트·대화상자 닫기는 기존 버튼·Escape 그대로
 */
export function planExitPop({ armed = false, leaving = false, redirectPending = false, confirming = false } = {}) {
  if (!armed || leaving || redirectPending) return { trap: false, confirm: false, closeModal: false };
  return { trap: true, confirm: !confirming, closeModal: false };
}

/** 탭·설정 이동은 히스토리를 쌓지 않는다. push 하면 뒤로가기가 탭을 바꾸게 된다. */
export function viewChangeHistoryMode() {
  return 'replace';
}

/** 확인 직전에 센티널을 다시 넣었으면, 나가려면 그 칸과 처음 넣은 칸을 함께 건너뛴다. */
export function leaveHistoryDelta({ repushedSentinel = true } = {}) {
  return repushedSentinel ? -2 : -1;
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
    history.pushState({ [EXIT_MARK]: 1 }, '', stayUrl || undefined);
    pushed = true;
  }

  function sync({ loggedIn = false, redirectPending: rp = false } = {}) {
    redirectPending = !!rp;
    if (leaving) return;
    armed = shouldArmExitGuard({ loggedIn, redirectPending: rp, leaving });
    if (armed && !pushed) pushSentinel();
  }

  function willTrap() {
    return planExitPop({ armed, leaving, redirectPending, confirming }).trap;
  }

  function onPopState() {
    const plan = planExitPop({ armed, leaving, redirectPending, confirming });
    if (!plan.trap) {
      if (!leaving) pushed = false;
      return plan;
    }
    // pop 은 이미 센티널을 소비했다. 바로 다시 넣어 앱에 남긴다.
    pushSentinel();
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
    history.go(leaveHistoryDelta({ repushedSentinel: true }));
    schedule(() => {
      if (isHidden()) return;
      try { closeWindow?.(); } catch { /* 스크립트가 연 창이 아니면 브라우저가 무시 */ }
    }, 80);
  }

  return { noteStay, sync, willTrap, onPopState, isLeaving: () => leaving };
}
