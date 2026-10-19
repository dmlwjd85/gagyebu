// 새 버전 적용(QA 3차 N3).
// 서비스 워커는 새 버전을 받으면 바로 자리를 잡아요(vite.config.js: skipWaiting·clientsClaim, vite-plugin-pwa 'autoUpdate' 방식).
// 그래서 배포 뒤에는 새로 고침 한 번이면 새 버전이 떠요. 다만 화면을 그 자리에서 다시 불러오는 건 입력 중인 내용을 지울 수 있으니
// 여기서 정해요(vite-plugin-pwa 문서의 '폼이 있으면 사용자가 정하게' 권고):
//  - 입력 중인 게 없고, 방금 열었거나(새로 고친 직후 15초) 화면이 뒤로 갔거나 로그인 전이면 → 바로 다시 불러옴
//  - 그 밖에는 '새 버전이 있어요 [지금 적용]'을 보여 주고, 앱을 뒤로 보냈다 돌아오면(입력 중이 아닐 때) 알아서 적용
// 권한 거부 토스트의 [새로 고침]은 refresh(): 새 버전을 먼저 받아 자리 잡게 한 뒤 다시 불러옴.
export const AUTO_WINDOW_MS = 15_000;
const CHECK_EVERY_MS = 30 * 60_000;

/**
 * @param {object} o
 * @param {ServiceWorkerContainer} [o.sw]
 * @param {string} o.base 앱 경로('/gagyebu/')
 * @param {() => boolean} o.isBusy 입력 중인 내용이 있는지(시트·대화상자·가져오기 진행 중 등)
 * @param {() => boolean} [o.canApplyAnytime] 언제 다시 불러와도 되는지(로그인 전 화면 등)
 * @param {() => void} o.onReady 새 버전 안내를 보여 줄 때
 */
export function createUpdater({ sw = globalThis.navigator?.serviceWorker, base, isBusy, canApplyAnytime = () => false, onReady,
  reload = () => globalThis.location.reload(), now = Date.now, doc = globalThis.document, timers = globalThis }) {
  const t0 = now();
  let ready = false, reg = null, lastCheck = 0, applying = false;
  const hadController = !!sw?.controller;
  const apply = () => { if (applying) return; applying = true; reload(); };
  const quietOk = () => !isBusy() && (canApplyAnytime() || doc?.hidden || now() - t0 < AUTO_WINDOW_MS);
  function newVersion() {
    if (ready) return;
    ready = true;
    if (quietOk()) return apply();
    onReady();
  }
  function check() {
    if (!reg || now() - lastCheck < 60_000) return;
    lastCheck = now();
    reg.update().catch(() => {});
  }
  if (sw) {
    // 처음 설치(이전에 서비스 워커가 없던 화면)는 이미 최신이라 다시 불러올 필요 없음
    sw.addEventListener('controllerchange', () => { if (hadController) newVersion(); });
    doc?.addEventListener('visibilitychange', () => {
      if (doc.hidden) { if (ready && !isBusy()) apply(); } else check();
    });
  }
  async function register() {
    if (!sw) return null;
    reg = await sw.register(`${base}sw.js`, { scope: base });
    timers.setInterval?.(check, CHECK_EVERY_MS);
    return reg;
  }
  // 새 버전이 있으면 받아서 자리 잡게 한 뒤, 없으면 바로 다시 불러옴(최대 timeout만 기다림)
  async function refresh(timeout = 8000) {
    if (ready || !sw) return apply();
    try {
      reg = reg || await sw.getRegistration(base);
      await reg?.update();
      const w = reg?.installing || reg?.waiting;
      if (w) {
        await new Promise((res) => {
          sw.addEventListener('controllerchange', res, { once: true });
          timers.setTimeout(res, timeout);
          w.postMessage?.({ type: 'SKIP_WAITING' });
        });
      }
    } catch { /* 확인하지 못해도 다시 불러오기는 함 */ }
    apply();
  }
  return { register, refresh, apply, newVersion, isReady: () => ready };
}
