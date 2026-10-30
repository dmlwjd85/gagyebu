// 분위기(계절) 테마는 고른 부분만 물들인다. 화면 바탕·본문색은 라이트/다크 기본 그대로.
// 기기에는 localStorage, 로그인한 뒤에는 users/{uid}/settings/prefs 의 mood·font·decor·tone 만 더한다.
// tone 은 선택 필드다. 없는 예전 문서는 기본(메뉴+강조 글씨 켜짐, 카드 바탕 꺼짐)으로 읽고, 그 값을 문서에 새로 쓰지 않는다.
// font 값 'gaegu' 는 예전 손글씨 자리다. 지금은 나눔스퀘어라운드 서브셋으로 그린다. 저장값은 바꾸지 않는다.
// font 값 'pretendard' 는 기본 글꼴 자리다. 지금은 쨈 본문(JJAEM Body)으로 그린다. 저장값·Firestore 규칙은 바꾸지 않는다.
// decor 는 예전 설정과 맞추려고 읽고 저장만 한다. 화면에는 쓰지 않는다.
// 쓰는 방식(mode·features·용돈·배우자)과 거래 필드는 바꾸지 않는다. normalizeSettings 는 이 키를 백업에 넣지 않는다.
// 다크 모드는 기존 'theme' 키(light|dark|시스템) 그대로다.

import coreRegularUrl from '../assets/fonts/jjaem/fonts/JJAEMBody-Regular.core.woff2?url';
import coreBoldUrl from '../assets/fonts/jjaem/fonts/JJAEMBody-Bold.core.woff2?url';
import ksRegularUrl from '../assets/fonts/jjaem/fonts/JJAEMBody-Regular.ks.woff2?url';
import ksBoldUrl from '../assets/fonts/jjaem/fonts/JJAEMBody-Bold.ks.woff2?url';

export const MOODS = ['default', 'sakura', 'ocean', 'maple', 'snow', 'retro'];
export const FONTS = ['system', 'pretendard', 'gaegu'];
export const ART_MOODS = ['sakura', 'ocean', 'maple', 'snow', 'retro'];
export const TONE_PARTS = ['menu', 'accent', 'card'];

const MOOD_KEY = 'mood';
const FONT_KEY = 'font';
const DECOR_KEY = 'decor';
const TONE_KEY = 'tone';

export const DEFAULT_TONE = { menu: true, accent: true, card: false };
export const DEFAULT_LOOK = { mood: 'default', font: 'pretendard', decor: true, tone: { ...DEFAULT_TONE } };

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
  { id: 'pretendard', label: '쨈 본문' },
  { id: 'gaegu', label: '나눔라운드' },
];

export const TONE_OPTIONS = [
  { id: 'menu', label: '메뉴' },
  { id: 'accent', label: '강조 글씨' },
  { id: 'card', label: '카드 바탕' },
];

export function sanitizeTone(tone) {
  if (!tone || typeof tone !== 'object' || Array.isArray(tone)) return { ...DEFAULT_TONE };
  return {
    menu: tone.menu === true,
    accent: tone.accent === true,
    card: tone.card === true,
  };
}

function sameTone(a, b) {
  return TONE_PARTS.every((id) => a[id] === b[id]);
}

/** 클라우드·저장용. 켜진 부분만. 빈 배열은 전부 꺼짐. */
export function toneList(tone) {
  const t = sanitizeTone(tone);
  return TONE_PARTS.filter((id) => t[id]);
}

function toneFromStorage(raw) {
  if (raw == null) return { ...DEFAULT_TONE };
  if (raw === 'none') return { menu: false, accent: false, card: false };
  const on = raw.split(',').filter((id) => TONE_PARTS.includes(id));
  if (!on.length) return { ...DEFAULT_TONE };
  return { menu: on.includes('menu'), accent: on.includes('accent'), card: on.includes('card') };
}

export function sanitizeLook(look) {
  return {
    mood: MOODS.includes(look?.mood) ? look.mood : DEFAULT_LOOK.mood,
    font: FONTS.includes(look?.font) ? look.font : DEFAULT_LOOK.font,
    decor: look?.decor === false ? false : true,
    tone: sanitizeTone(look?.tone),
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
      tone: toneFromStorage(storage?.getItem(TONE_KEY)),
    });
  } catch {
    return { mood: DEFAULT_LOOK.mood, font: DEFAULT_LOOK.font, decor: DEFAULT_LOOK.decor, tone: { ...DEFAULT_TONE } };
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
    if (sameTone(next.tone, DEFAULT_TONE)) storage?.removeItem(TONE_KEY);
    else {
      const list = toneList(next.tone);
      storage?.setItem(TONE_KEY, list.length ? list.join(',') : 'none');
    }
  } catch { /* 저장이 막혀도 이번 화면에는 적용 */ }
  return next;
}

export function applyLook(look, root = globalThis.document?.documentElement) {
  const next = sanitizeLook(look);
  if (root?.dataset) {
    root.dataset.theme = next.mood;
    root.dataset.font = next.font;
    root.dataset.decor = next.decor ? 'on' : 'off';
    root.dataset.toneMenu = next.tone.menu ? 'on' : 'off';
    root.dataset.toneAccent = next.tone.accent ? 'on' : 'off';
    root.dataset.toneCard = next.tone.card ? 'on' : 'off';
  }
  return next;
}

/** gaegu(예전 손글씨 값)는 본문이 나눔라운드, 금액은 Pretendard 고정폭이라 둘 다 받는다.
 *  pretendard(기본 값)는 쨈 본문으로 그린다. 쨈 본문 숫자는 폭이 같아 금액도 같은 글꼴로 그린다. */
export function fontsFor(font) {
  if (font === 'gaegu') return ['gaegu', 'pretendard'];
  if (font === 'pretendard') return ['jjaem'];
  return [];
}

const loadedFonts = new Set();
const fontLoaders = {
  pretendard: () => import('../fonts.css'),
  jjaem: () => import('../assets/fonts/jjaem/jjaem-font.css'),
  gaegu: () => import('../assets/fonts/gaegu.css'),
};

export function ensureFont(font) {
  const jobs = [];
  for (const name of fontsFor(font)) {
    if (loadedFonts.has(name)) continue;
    loadedFonts.add(name);
    jobs.push(name === 'jjaem' ? fontLoaders.jjaem().then((m) => { prefetchJjaemKs(); return m; }) : fontLoaders[name]());
  }
  return jobs.length ? Promise.all(jobs) : Promise.resolve();
}

// 쨈 본문 .ks 조각(자주 쓰는 한글 2,350자 중 첫 조각에 없는 글자, 400 약 411KB·700 약 421KB)을
// 첫 화면이 다 뜨고 한가해진 뒤 조용히 받아 둔다(QA N2). 메모·검색·카테고리 이름에 처음 보는 글자를 쳐도 다른 글꼴이 섞이지 않게.
// 받은 뒤 첫 조각·.ks 를 서비스 워커의 글꼴 캐시(fonts-v2, CacheFirst)에도 넣어 둔다 → 한 번 온라인으로 연 뒤에는 오프라인에서도 같음.
// (첫 방문에는 워커가 아직 화면을 맡지 않아 글꼴 요청이 워커를 거치지 않으므로 직접 넣음. 방금 받은 파일이라 보통 브라우저 HTTP 캐시에서 나옴)
// 데이터 절약 모드·2G 에서는 받지 않는다(그 글자가 나올 때만 받음). .ext(드문 한글 8,822자, 두 굵기 약 1MB)는 미리 받지 않는다.
// KS_SAMPLE 은 두 굵기 .ks 범위 안에만 있는 글자(look.test.js 가 확인).
export const KS_SAMPLE = String.fromCodePoint(0xac09); // 글자를 소스에 그대로 쓰면 첫 조각 만들 때 첫 조각에 들어가 버려서 코드값으로 씀
export const JJAEM_CACHE_FILES = [coreRegularUrl, coreBoldUrl, ksRegularUrl, ksBoldUrl];
let ksPrefetched = false;
export function prefetchJjaemKs(w = globalThis) {
  if (ksPrefetched) return false;
  const conn = w.navigator?.connection;
  if (!w.document?.fonts?.load || conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return false;
  ksPrefetched = true;
  const idle = (fn) => (w.requestIdleCallback ? w.requestIdleCallback(fn, { timeout: 5000 }) : w.setTimeout(fn, 2000));
  const keep = async () => {
    if (!w.caches?.open) return;
    const cache = await w.caches.open('fonts-v2');
    for (const u of JJAEM_CACHE_FILES) if (!(await cache.match(u))) await cache.add(u);
  };
  // 첫 조각이 다 오기 전에 시작하면 첫 화면 글꼴과 대역을 나눠 써서 늦어짐 → 받는 중인 글꼴이 다 끝나고(fonts.ready) 한 번 더 한가할 때 시작
  const run = () => Promise.resolve(w.document.fonts.ready).then(() => new Promise((r) => idle(r)))
    .then(() => Promise.all(['400', '700'].map((wt) => w.document.fonts.load(`${wt} 16px "JJAEM Body"`, KS_SAMPLE)))).then(keep).catch(() => {});
  if (w.document.readyState === 'complete') idle(run);
  else w.addEventListener('load', () => idle(run), { once: true });
  return true;
}
export function resetKsPrefetchForTest() { ksPrefetched = false; }

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
  if (Array.isArray(raw.tone) && raw.tone.every((p) => TONE_PARTS.includes(p))) {
    out.tone = {
      menu: raw.tone.includes('menu'),
      accent: raw.tone.includes('accent'),
      card: raw.tone.includes('card'),
    };
  }
  return Object.keys(out).length ? out : null;
}

export function adoptCloudLook(raw, storage = globalThis.localStorage, root = globalThis.document?.documentElement) {
  const cloud = lookFromCloud(raw);
  if (!cloud) return readLook(storage);
  const cur = readLook(storage);
  const next = sanitizeLook({ ...cur, ...cloud });
  if (cur.mood === next.mood && cur.font === next.font && cur.decor === next.decor && sameTone(cur.tone, next.tone)) return cur;
  writeLook(next, storage);
  applyLook(next, root);
  ensureFont(next.font);
  return next;
}
