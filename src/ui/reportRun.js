// 리포트 카드 만들기 버튼과 화면 그리기를 잇는 부분(main.js 에서 씀, 시험하려고 따로 둠)
import { singleRun } from './util.js';

/** 만드는 동안 버튼 표시: disabled·aria-busy, 글자 '리포트 카드 만드는 중…', 아이콘 ⏳(모양은 style.css .report-btn[aria-busy]).
 *  글자 칸은 굵기 클래스가 아닌 data-report-label 로 찾는다(QA 3차 M1·4차 P4). */
export function markReportBusy(root, on) {
  root.querySelectorAll('[data-action="report"]').forEach((b) => {
    const label = b.querySelector('[data-report-label]'), icon = b.querySelector('[data-report-icon]');
    b.disabled = on;
    if (on) {
      b.setAttribute('aria-busy', 'true');
      if (label) { label.dataset.idle ??= label.textContent; label.textContent = '리포트 카드 만드는 중…'; }
      if (icon) { icon.dataset.idle ??= icon.textContent; icon.textContent = '⏳'; }
    } else {
      b.removeAttribute('aria-busy');
      for (const el of [label, icon]) if (el?.dataset.idle) { el.textContent = el.dataset.idle; delete el.dataset.idle; }
    }
  });
}

/** 지금 보는 화면 열쇠: 화면·달·사람이 바뀌면 다른 화면 */
export const reportScreenKey = (view, ym, uid) => `${view}|${ym}|${uid ?? ''}`;

/** 리포트 만들기: 여러 번 눌러도 한 번만(M1), 만드는 동안 화면을 떠나면 취소해서 다른 화면 위에 창이 뜨지 않게(QA 4차 P2).
 *  open(m, { signal }) 는 ui/report.js openReport. afterRender(key) 는 화면을 다 그린 뒤 main.js render 가 부름. */
export function reportRunner({ root, open, onError }) {
  let job = null;
  const run = singleRun(async (m, key) => {
    const ctl = new AbortController();
    job = { key, ctl };
    markReportBusy(root, true);
    try { await open(m, { signal: ctl.signal }); } catch (err) { if (!ctl.signal.aborted) onError?.(err); } finally { job = null; markReportBusy(root, false); }
  });
  return {
    run,
    busy: run.busy,
    afterRender(key) {
      if (job && job.key !== key) job.ctl.abort();
      if (run.busy()) markReportBusy(root, true); // 같은 화면에서 다시 그려도 버튼 표시 유지
    },
  };
}

/** 첫 데이터(기록·설정)를 그린 뒤에만 쨈 본문 .ks 미리 받기를 부른다(로그인 화면·첫 데이터 전에는 안 함, QA 3차 M5) */
export function prefetchAfterData(state, prefetch) {
  if (state.user && state.txLoaded && state.settingsLoaded) return prefetch();
  return false;
}
