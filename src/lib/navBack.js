// 화면 이동 히스토리.
// 탭(홈·달력·차트·예산)은 한 층이고, 아래 탭이 없는 화면과 입력 시트·확인 창은 그 위에 쌓는다.
// 휴대폰 뒤로 가기는 확인 창 → 시트 → 하위 화면 → (탭이면 홈) → 홈에서 종료 확인 순이다.
// pushState 는 클릭·키 입력 안에서만 한다. popstate 안에서는 주소만 고친다(제스처 없는 push 는 뒤로 가기가 건너뜀).

export const TAB_VIEWS = ['home', 'calendar', 'chart', 'budget'];
export const SUB_PARENT = {
  settings: 'home',
  search: 'home',
  import: 'settings',
  recurring: 'settings',
  assets: 'settings',
  tax: 'assets',
};

export function isTab(view) {
  return TAB_VIEWS.includes(view);
}

export function parentView(view) {
  return SUB_PARENT[view] || 'home';
}

export function createNavHistory(history, urlFor, { onStay } = {}) {
  const stack = [];
  let current = 'home';
  let ignore = false;
  let afterPop = null;

  function push(state, view) {
    history.pushState(state, '', urlFor(view));
  }
  function stay() { onStay?.(); }

  function armPop(delta, fn) {
    ignore = true;
    afterPop = () => { fn?.(); stay(); };
    history.go(delta);
  }

  function showTab(to) {
    const top = stack.at(-1);
    if (to === 'home' && top?.type === 'tab') {
      stack.pop();
      current = 'home';
      armPop(-1, () => history.replaceState(history.state, '', urlFor('home')));
      return 'back';
    }
    if (top?.type === 'tab') {
      top.view = to;
      history.replaceState({ gagyebuNav: to }, '', urlFor(to));
      current = to;
      stay();
      return 'tab';
    }
    if (to === 'home') {
      history.replaceState(history.state, '', urlFor('home'));
      current = 'home';
      stay();
      return 'tab';
    }
    stack.push({ type: 'tab', view: to });
    push({ gagyebuNav: to }, to);
    current = to;
    stay();
    return 'tab';
  }

  function pushSub(to) {
    stack.push({ type: 'sub', view: to });
    push({ gagyebuNav: to }, to);
    current = to;
    stay();
    return 'push';
  }

  function popUntil(to) {
    let n = 0;
    while (stack.length) {
      const top = stack.at(-1);
      if (to === 'home' && top.type === 'tab') break;
      if (top.type === 'tab') break;
      if (top.type === 'sub' && top.view === to) break;
      stack.pop();
      n += 1;
    }
    if (to === 'home' && stack.at(-1)?.type === 'tab') {
      stack.pop();
      n += 1;
    }
    current = to;
    if (!n) {
      history.replaceState(history.state, '', urlFor(to));
      stay();
      return 'replace';
    }
    armPop(-n, () => history.replaceState(history.state, '', urlFor(to)));
    return 'back';
  }

  // 가져오기 완료 → 달력처럼, 위저드 칸을 탭 주소로 바꾼다. 그 아래(설정)는 남는다.
  function replaceTopWithTab(to) {
    let n = 0;
    while (stack.at(-1)?.type === 'step') { stack.pop(); n += 1; }
    const top = stack.at(-1);
    if (top?.type === 'sub') { top.type = 'tab'; top.view = to; }
    else stack.push({ type: 'tab', view: to });
    current = to;
    if (!n) {
      history.replaceState({ gagyebuNav: to }, '', urlFor(to));
      stay();
      return 'replace';
    }
    armPop(-n, () => history.replaceState({ gagyebuNav: to }, '', urlFor(to)));
    return 'back';
  }

  function show(to) {
    if (to === current) return 'stay';
    const from = current;
    if (isTab(from) && isTab(to)) return showTab(to);
    if (!isTab(to) && isTab(from)) return pushSub(to);
    if (!isTab(from) && !isTab(to)) {
      if (parentView(from) === to) return popUntil(to);
      return pushSub(to);
    }
    if (to === 'home' || parentView(from) === to) return popUntil(to);
    return replaceTopWithTab(to);
  }

  function pushModal(kind) {
    stack.push({ type: 'modal', kind });
    push({ gagyebuModal: kind }, current);
  }

  function closeModal() {
    if (stack.at(-1)?.type !== 'modal') return false;
    stack.pop();
    armPop(-1, null);
    return true;
  }

  function pushStep(step) {
    stack.push({ type: 'step', view: 'import', step });
    push({ gagyebuNav: 'import', step }, 'import');
  }

  function undoStep() {
    if (stack.at(-1)?.type !== 'step') return false;
    stack.pop();
    armPop(-1, null);
    return true;
  }

  function onPop({ sheet = false, dialog = false, exitReady = false } = {}) {
    if (ignore) {
      ignore = false;
      const fn = afterPop;
      afterPop = null;
      fn?.();
      return { kind: 'ignore', view: current };
    }
    const top = stack.at(-1);
    if (top?.type === 'modal' && (dialog || sheet || top.kind)) {
      stack.pop();
      const kind = top.kind === 'sheet' ? 'sheet' : 'dialog';
      if (kind === 'dialog' && !dialog && sheet) return { kind: 'sheet' };
      return { kind };
    }
    if (!top) {
      if (exitReady) return { kind: 'exit' };
      return { kind: 'leave' };
    }
    stack.pop();
    if (top.type === 'step') {
      const under = stack.at(-1);
      current = 'import';
      if (!under || under.type === 'sub') return { kind: 'import-reset' };
      return { kind: 'import-step', step: under.step || 1 };
    }
    const dest = stack.at(-1)?.view || 'home';
    current = dest;
    return { kind: 'view', view: dest };
  }

  return {
    adopt(view) { current = view || 'home'; stack.length = 0; },
    show,
    pushModal,
    closeModal,
    pushStep,
    undoStep,
    onPop,
    snapshot: () => ({ current, stack: stack.map((x) => ({ ...x })) }),
  };
}
