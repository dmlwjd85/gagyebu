// 본문 글자 배율(화면 가운데 #main 에만 적용). 위·아래 메뉴는 늘 같은 크기.
// 브라우저 줌은 페이지 전체를 키워 메뉴까지 커지므로, 앱 안 배율을 CSS 변수 --content-scale 로 따로 둠.
export const SCALE_KEY = 'contentScale';
export const SCALE_MIN = 0.85;
export const SCALE_MAX = 1.6;
export const SCALE_DEFAULT = 1;

// 0.05 단위로 맞추고 범위 안으로. 숫자가 아니면 기본값
export function clampScale(v) {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  if (!Number.isFinite(n)) return SCALE_DEFAULT;
  const c = Math.min(SCALE_MAX, Math.max(SCALE_MIN, n));
  return Math.round(c * 20) / 20;
}

// 한 단계(기본 10%) 키우기(+1)·줄이기(-1). 끝에 닿으면 그대로
export function stepScale(cur, dir, step = 0.1) {
  return clampScale(clampScale(cur) + Math.sign(dir) * step);
}

export const scalePct = (v) => `${Math.round(clampScale(v) * 100)}%`;

export function readScale(storage = globalThis.localStorage) {
  try { return clampScale(storage?.getItem(SCALE_KEY) ?? SCALE_DEFAULT); } catch { return SCALE_DEFAULT; }
}

export function saveScale(v, storage = globalThis.localStorage) {
  const c = clampScale(v);
  try { if (c === SCALE_DEFAULT) storage?.removeItem(SCALE_KEY); else storage?.setItem(SCALE_KEY, String(c)); } catch { /* 저장 못 해도 이번 화면에는 적용 */ }
  return c;
}

export function applyScale(v, root = globalThis.document?.documentElement) {
  const c = clampScale(v);
  root?.style.setProperty('--content-scale', String(c));
  return c;
}

// Ctrl(맥은 ⌘)+키 → 동작. 해당 없으면 null
export function scaleKeyAction(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') return 'in';
  if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') return 'out';
  if (e.key === '0' || e.code === 'Numpad0') return 'reset';
  return null;
}
