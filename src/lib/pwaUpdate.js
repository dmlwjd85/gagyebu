// 새 서비스 워커가 있으면 한 번만 안내한다. 예전 캐시 앱은 고칠 수 없어, 이 화면에서 새 버전을 받게 한다.
export const UPDATE_NOTICE_TEXT = '새 버전으로 업데이트해 주세요';
const NOTICE_KEY = 'pwa-update-notice';

/** 이미 앱을 켜 둔 뒤에 새 워커가 준비됐을 때만. 첫 설치는 안내하지 않는다. */
export function shouldOfferUpdate({ hadController, updateReady }) {
  return hadController === true && updateReady === true;
}

export function updateNoticeSeen(storage = globalThis.sessionStorage) {
  try { return storage?.getItem(NOTICE_KEY) === '1'; } catch { return false; }
}

export function markUpdateNotice(storage = globalThis.sessionStorage) {
  try { storage?.setItem(NOTICE_KEY, '1'); } catch { /* 저장 불가면 이번 화면만 */ }
}

export function mountUpdateNotice(parent, onApply) {
  if (!parent || typeof parent.querySelector !== 'function' || typeof document === 'undefined') return null;
  const existing = parent.querySelector('[data-update-notice]');
  if (existing) return existing;
  const el = document.createElement('div');
  el.className = 'update-banner';
  el.setAttribute('data-update-notice', '');
  el.setAttribute('role', 'status');
  el.innerHTML = `<p>${UPDATE_NOTICE_TEXT}</p><button type="button" class="btn-primary" data-apply-update>업데이트</button>`;
  el.querySelector('[data-apply-update]').addEventListener('click', () => { onApply?.(); });
  parent.appendChild(el);
  return el;
}

/**
 * 새 워커가 기다리면 안내를 띄운다. 버튼은 updateSW(true)로 넘긴다.
 * registerSW는 virtual:pwa-register. 테스트는 이 함수를 부르지 않는다.
 */
export async function installUpdatePrompt() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  let had = !!navigator.serviceWorker.controller;
  let apply = () => location.reload();
  const show = () => {
    if (!shouldOfferUpdate({ hadController: had, updateReady: true })) return;
    if (updateNoticeSeen()) return;
    markUpdateNotice();
    mountUpdateNotice(document.body, () => apply());
  };
  try {
    const { registerSW } = await import('virtual:pwa-register');
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() { show(); },
      onRegisteredSW(_url, reg) { if (reg?.waiting) show(); },
    });
    // 워커가 이미 켜져 있으면 skipWaiting 뒤에 이 화면을 다시 연다.
    apply = async () => {
      try { await updateSW(true); } catch { /* 개발 서버·이미 활성화 */ }
      location.reload();
    };
  } catch { /* 개발 서버에 워커가 없으면 안내만 생략 */ }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had) { had = true; return; }
    show();
  });
}
