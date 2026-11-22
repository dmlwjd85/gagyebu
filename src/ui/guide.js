// 설정의 '한눈에 보는 설명서'. 그림은 설명서를 열 때만 받음(설치 직후 미리 받지 않음).
import { esc, lockApp, reducedMotion, attachModal } from './util.js';

const slash = (s) => (s.endsWith('/') ? s : `${s}/`);
export function guideBase(envBase) {
  const raw = envBase ?? (typeof import.meta !== 'undefined' ? import.meta.env?.BASE_URL : '/') ?? '/';
  return slash(raw || '/');
}

// 움직이는 그림·멈춘 그림 확장자는 이 파일에만 둠
const MOVE_EXT = 'webp';
const STILL_EXT = 'webp';

export const GUIDE_SCENES = [
  { id: 1, caption: '설정에서 한 달 시작일을 월급날 17일로 정해요.' },
  { id: 2, caption: '월급날 17일에 월급 수입을 남겨요.' },
  { id: 3, caption: '매일 지출은 기록 단추에서 금액·항목만 고르면 10초면 끝나요.' },
  { id: 4, caption: '달력과 남은 예산, 돈 날씨로 이번 달을 한눈에 봐요.' },
  { id: 5, caption: '달 말에는 차트와 리포트 카드로 한 달을 돌아봐요.' },
  { id: 6, caption: '다음 달로 넘어가면 새 월급 기간이 시작돼요.' },
];

export function sceneSrc(id, { still = false, base } = {}) {
  const name = still ? `${id}-still` : String(id);
  const ext = still ? STILL_EXT : MOVE_EXT;
  return `${guideBase(base)}guide/${name}.${ext}`;
}

let session = null;

export const isGuideOpen = () => !!session?.root?.isConnected;

export function closeGuide({ fromPop = false } = {}) {
  const s = session;
  if (!s) return;
  if (s.finish) s.finish(null, fromPop);
  else s.destroy();
}

function showSrc(i) {
  return sceneSrc(GUIDE_SCENES[i].id, { still: reducedMotion() });
}

function prefetchAround(s, i) {
  const still = reducedMotion();
  for (const j of [i + 1, i - 1]) {
    if (j < 0 || j >= GUIDE_SCENES.length) continue;
    const href = sceneSrc(GUIDE_SCENES[j].id, { still });
    if (document.querySelector(`link[data-guide-pre][href="${href}"]`)) continue;
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.as = 'image';
    l.href = href;
    l.dataset.guidePre = '1';
    document.head.append(l);
  }
}

function paint(s) {
  const n = GUIDE_SCENES.length;
  const sc = GUIDE_SCENES[s.index];
  const src = showSrc(s.index);
  const img = s.root.querySelector('[data-guide-img]');
  if (img && img.getAttribute('src') !== src) {
    img.setAttribute('src', src);
    img.setAttribute('alt', sc.caption);
  }
  const cap = s.root.querySelector('[data-guide-cap]');
  if (cap) cap.textContent = sc.caption;
  const num = s.root.querySelector('[data-guide-num]');
  if (num) num.textContent = `${s.index + 1} / ${n}`;
  const prev = s.root.querySelector('[data-guide-prev]');
  const next = s.root.querySelector('[data-guide-next]');
  if (prev) prev.disabled = s.index <= 0;
  if (next) next.disabled = s.index >= n - 1;
  prefetchAround(s, s.index);
}

export function goGuide(delta) {
  const s = session;
  if (!s) return;
  const next = s.index + delta;
  if (next < 0 || next >= GUIDE_SCENES.length) return;
  s.index = next;
  paint(s);
}

export function openGuide() {
  if (isGuideOpen()) return session.root;
  const s = {
    index: 0,
    root: document.createElement('div'),
    unlock: null,
    finish: null,
    lastFocus: document.activeElement,
    destroy() {},
  };
  const root = s.root;
  root.id = 'guide-root';
  root.className = 'guide-root';
  const first = GUIDE_SCENES[0];
  root.innerHTML = `<div class="guide-sheet" role="dialog" aria-modal="true" aria-labelledby="guide-title" tabindex="-1">
    <div class="guide-head">
      <h2 id="guide-title" class="guide-title">한눈에 보는 설명서</h2>
      <button type="button" class="icon-btn guide-x" data-guide-close aria-label="설명서 닫기">✕</button>
    </div>
    <p class="guide-num" data-guide-num aria-live="polite">1 / ${GUIDE_SCENES.length}</p>
    <div class="guide-frame">
      <img data-guide-img alt="${esc(first.caption)}" width="390" height="844" decoding="async" />
    </div>
    <p class="guide-cap" data-guide-cap>${esc(first.caption)}</p>
    <div class="guide-nav">
      <button type="button" class="btn-ghost" data-guide-prev disabled>이전</button>
      <button type="button" class="btn-primary" data-guide-next>다음</button>
    </div>
    <p class="guide-note">예시 화면이에요. 내 기록은 바뀌지 않아요.</p>
  </div>`;
  root.querySelector('[data-guide-img]').setAttribute('src', showSrc(0));
  const onKey = (e) => {
    if (!session) return;
    if (e.key === 'Escape') { e.preventDefault(); closeGuide(); }
    if (e.key === 'ArrowLeft') goGuide(-1);
    if (e.key === 'ArrowRight') goGuide(1);
  };
  s.destroy = () => {
    document.removeEventListener('keydown', onKey);
    s.unlock?.();
    if (session === s) session = null;
    root.remove();
    s.lastFocus?.focus?.();
  };
  document.body.append(root);
  s.unlock = lockApp('dialog');
  s.finish = attachModal(() => s.destroy(), { history: true, cancelValue: null });
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('[data-guide-close]')) return closeGuide();
    if (e.target.closest('[data-guide-prev]')) return goGuide(-1);
    if (e.target.closest('[data-guide-next]')) return goGuide(1);
  });
  session = s;
  paint(s);
  root.querySelector('.guide-sheet')?.focus();
  return root;
}
