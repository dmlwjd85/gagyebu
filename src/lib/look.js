// 분위기(계절) 테마는 색만 바꾼다. 머리 그림은 그리지 않는다.
// 기기에는 localStorage, 로그인한 뒤에는 users/{uid}/settings/prefs 의 mood·font·decor 만 더한다.
// decor 는 예전 설정과 맞추려고 읽고 저장만 한다. 화면에는 쓰지 않는다.
// 쓰는 방식(mode·features·용돈·배우자)과 거래 필드는 바꾸지 않는다. normalizeSettings 는 이 키를 백업에 넣지 않는다.
// 다크 모드는 기존 'theme' 키(light|dark|시스템) 그대로다.

export const MOODS = ['default', 'sakura', 'ocean', 'maple', 'snow', 'retro'];
export const FONTS = ['system', 'pretendard', 'gaegu'];
export const ART_MOODS = ['sakura', 'ocean', 'maple', 'snow', 'retro'];

const MOOD_KEY = 'mood';
const FONT_KEY = 'font';
const DECOR_KEY = 'decor';

export const DEFAULT_LOOK = { mood: 'default', font: 'pretendard', decor: true };

export const MOOD_OPTIONS = [
  { id: 'default', label: '기본', sw: ['#7048F2', '#C2457E', '#B85A3E'] },
  { id: 'sakura', label: '벚꽃', sw: ['#FFD0E0', '#E85A8C', '#8C1E48'] },
  { id: 'ocean', label: '바다', sw: ['#D4EEF8', '#3AA0C8', '#0C4A68'] },
  { id: 'maple', label: '단풍', sw: ['#FFE0C8', '#E07030', '#7A2A10'] },
  { id: 'snow', label: '눈', sw: ['#E8F0F8', '#8AAAC8', '#1A3A64'] },
  { id: 'retro', label: '레트로', sw: ['#F6E0C0', '#C46A3A', '#6E2430'] },
];

export const FONT_OPTIONS = [
  { id: 'system', label: '시스템 기본' },
  { id: 'pretendard', label: 'Pretendard' },
  { id: 'gaegu', label: '손글씨' },
];

export function sanitizeLook(look) {
  return {
    mood: MOODS.includes(look?.mood) ? look.mood : DEFAULT_LOOK.mood,
    font: FONTS.includes(look?.font) ? look.font : DEFAULT_LOOK.font,
    decor: look?.decor === false ? false : true,
  };
}

export function readLook(storage = globalThis.localStorage) {
  try {
    const mood = storage?.getItem(MOOD_KEY);
    const font = storage?.getItem(FONT_KEY);
    const decor = storage?.getItem(DECOR_KEY);
    return sanitizeLook({
      mood: MOODS.includes(mood) ? mood : undefined,
      font: FONTS.includes(font) ? font : undefined,
      decor: decor === 'off' ? false : true,
    });
  } catch {
    return { ...DEFAULT_LOOK };
  }
}

export function writeLook(look, storage = globalThis.localStorage) {
  const next = sanitizeLook(look);
  try {
    if (next.mood === DEFAULT_LOOK.mood) storage?.removeItem(MOOD_KEY);
    else storage?.setItem(MOOD_KEY, next.mood);
    if (next.font === DEFAULT_LOOK.font) storage?.removeItem(FONT_KEY);
    else storage?.setItem(FONT_KEY, next.font);
    if (next.decor) storage?.removeItem(DECOR_KEY);
    else storage?.setItem(DECOR_KEY, 'off');
  } catch { /* 저장이 막혀도 이번 화면에는 적용 */ }
  return next;
}

export function applyLook(look, root = globalThis.document?.documentElement) {
  const next = sanitizeLook(look);
  if (root?.dataset) {
    root.dataset.theme = next.mood;
    root.dataset.font = next.font;
    root.dataset.decor = next.decor ? 'on' : 'off';
  }
  return next;
}

/** 손글씨를 고르면 본문은 Gaegu, 금액은 Pretendard 고정폭이라 둘 다 받는다. */
export function fontsFor(font) {
  if (font === 'gaegu') return ['gaegu', 'pretendard'];
  if (font === 'pretendard') return ['pretendard'];
  return [];
}

const loadedFonts = new Set();
const fontLoaders = {
  pretendard: () => import('../fonts.css'),
  gaegu: () => import('../assets/fonts/gaegu.css'),
};

export function ensureFont(font) {
  const jobs = [];
  for (const name of fontsFor(font)) {
    if (loadedFonts.has(name)) continue;
    loadedFonts.add(name);
    jobs.push(fontLoaders[name]());
  }
  return jobs.length ? Promise.all(jobs) : Promise.resolve();
}

export function initLook() {
  const look = applyLook(readLook());
  ensureFont(look.font);
  return look;
}

/** Firestore settings/prefs 에서 분위기 키만. 없거나 잘못된 값은 무시(예전 문서를 기본값으로 덮지 않음). */
export function lookFromCloud(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  if (MOODS.includes(raw.mood)) out.mood = raw.mood;
  if (FONTS.includes(raw.font)) out.font = raw.font;
  if (typeof raw.decor === 'boolean') out.decor = raw.decor;
  return Object.keys(out).length ? out : null;
}

export function adoptCloudLook(raw, storage = globalThis.localStorage, root = globalThis.document?.documentElement) {
  const cloud = lookFromCloud(raw);
  if (!cloud) return readLook(storage);
  const cur = readLook(storage);
  const next = sanitizeLook({ ...cur, ...cloud });
  if (cur.mood === next.mood && cur.font === next.font && cur.decor === next.decor) return cur;
  writeLook(next, storage);
  applyLook(next, root);
  ensureFont(next.font);
  return next;
}

