import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { normalizeSettings } from './modes.js';
import { homeView, settingsView } from '../ui/views.js';
import { symbol, logo, JJAEM_D, JJAEM_ICON_D, JJAEM_ICON_VB, FAB_INNER } from '../ui/brand.js';
import {
  DEFAULT_LOOK, DEFAULT_TONE, MOODS, FONTS, ART_MOODS,
  readLook, writeLook, sanitizeLook, applyLook, lookFromCloud, adoptCloudLook,
  fontsFor, toneList, FONT_OPTIONS, KS_SAMPLE, JJAEM_CACHE_FILES, prefetchJjaemKs, resetKsPrefetchForTest,
} from './look.js';

function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe('분위기 저장', () => {
  test('기본값: 기본 테마, Pretendard, 꾸미기 켜짐', () => {
    expect(readLook(mem())).toEqual(DEFAULT_LOOK);
    expect(DEFAULT_LOOK).toEqual({ mood: 'default', font: 'pretendard', decor: true, tone: { menu: true, accent: true, card: false } });
    expect(DEFAULT_TONE).toEqual({ menu: true, accent: true, card: false });
    expect(sanitizeLook(null)).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook({ mood: 'blue', font: 'comic', decor: 'yes' })).toEqual(DEFAULT_LOOK);
  });
  test('저장한 값은 다시 읽고, 기본값이면 키를 지운다', () => {
    const s = mem();
    writeLook({ mood: 'sakura', font: 'gaegu', decor: false }, s);
    expect(readLook(s)).toEqual({ mood: 'sakura', font: 'gaegu', decor: false, tone: { ...DEFAULT_TONE } });
    expect(s.getItem('mood')).toBe('sakura');
    expect(s.getItem('font')).toBe('gaegu');
    expect(s.getItem('decor')).toBe('off');
    expect(s.getItem('tone')).toBeNull();
    writeLook(DEFAULT_LOOK, s);
    expect(s.getItem('mood')).toBeNull();
    expect(s.getItem('font')).toBeNull();
    expect(s.getItem('decor')).toBeNull();
    expect(s.getItem('tone')).toBeNull();
    expect(readLook(s)).toEqual(DEFAULT_LOOK);
  });
  test('잘못된 저장값은 무시하고 기본으로 돌아간다', () => {
    expect(readLook(mem({ mood: 'ocean', font: 'papyrus', decor: 'maybe' }))).toEqual({ mood: 'ocean', font: 'pretendard', decor: true, tone: { ...DEFAULT_TONE } });
    expect(readLook(mem({ mood: 'blue', font: 'system', decor: 'off' }))).toEqual({ mood: 'default', font: 'system', decor: false, tone: { ...DEFAULT_TONE } });
    expect(readLook(mem({ tone: 'none' })).tone).toEqual({ menu: false, accent: false, card: false });
    expect(readLook(mem({ tone: 'card' })).tone).toEqual({ menu: false, accent: false, card: true });
    expect(readLook(mem({ tone: 'nope' })).tone).toEqual({ ...DEFAULT_TONE });
    expect(readLook({ getItem() { throw new Error('막힘'); } })).toEqual(DEFAULT_LOOK);
  });
  test('html data-theme·data-font·data-decor 에 반영', () => {
    const root = { dataset: {} };
    applyLook({ mood: 'maple', font: 'system', decor: false }, root);
    expect(root.dataset).toEqual({ theme: 'maple', font: 'system', decor: 'off', toneMenu: 'on', toneAccent: 'on', toneCard: 'off' });
    applyLook({ ...DEFAULT_LOOK, tone: { menu: false, accent: true, card: true } }, root);
    expect(root.dataset.theme).toBe('default');
    expect(root.dataset.decor).toBe('on');
    expect(root.dataset.toneMenu).toBe('off');
    expect(root.dataset.toneAccent).toBe('on');
    expect(root.dataset.toneCard).toBe('on');
  });
});

describe('클라우드 설정', () => {
  test('없는 키는 이 기기 값을 덮지 않는다', () => {
    const s = mem();
    writeLook({ mood: 'sakura', font: 'system', decor: true }, s);
    const root = { dataset: {} };
    expect(lookFromCloud(null)).toBeNull();
    expect(lookFromCloud({ theme: 'ocean', mode: 'single' })).toBeNull();
    expect(adoptCloudLook({ mode: 'student', theme: 'ocean' }, s, root)).toEqual({ mood: 'sakura', font: 'system', decor: true, tone: { ...DEFAULT_TONE } });
    expect(s.getItem('mood')).toBe('sakura');
    expect(root.dataset.theme).toBeUndefined();
  });
  test('있는 키만 합치고 잘못된 값은 버린다', () => {
    const s = mem();
    writeLook({ mood: 'sakura', font: 'pretendard', decor: true }, s);
    const root = { dataset: {} };
    expect(lookFromCloud({ mood: 'ocean', font: 'nope', decor: false, mode: 'couple' })).toEqual({ mood: 'ocean', decor: false });
    expect(lookFromCloud({ tone: ['nope'] })).toBeNull();
    expect(lookFromCloud({ tone: [] })).toEqual({ tone: { menu: false, accent: false, card: false } });
    const next = adoptCloudLook({ mood: 'ocean', font: 'comic', decor: false }, s, root);
    expect(next).toEqual({ mood: 'ocean', font: 'pretendard', decor: false, tone: { ...DEFAULT_TONE } });
    expect(root.dataset).toEqual({ theme: 'ocean', font: 'pretendard', decor: 'off', toneMenu: 'on', toneAccent: 'on', toneCard: 'off' });
    expect(readLook(s).mood).toBe('ocean');
  });
  test('모드 정규화·백업 경로는 분위기 키를 기존 설정에 섞지 않는다', () => {
    const raw = { mode: 'single', mood: 'sakura', font: 'gaegu', decor: true, tone: ['menu', 'accent'], theme: 'ocean', allowanceAmount: 1, updatedAt: 'x' };
    expect(normalizeSettings(raw)).toEqual({ mode: 'single', allowanceAmount: 1 });
    expect(JSON.stringify(normalizeSettings(raw))).not.toMatch(/mood|font|decor|tone|theme|updatedAt/);
  });
});

describe('테마는 색만', () => {
  test('화면 HTML·CSS·설치 캐시에 테마 그림이 없다', () => {
    expect(MOODS).toEqual(['default', 'sakura', 'ocean', 'maple', 'snow', 'retro']);
    expect(FONTS).toEqual(['system', 'pretendard', 'gaegu']);
    const css = readFileSync(new URL('../themes.css', import.meta.url), 'utf8');
    const views = readFileSync(new URL('../ui/views.js', import.meta.url), 'utf8');
    const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    expect(css).not.toMatch(/hero-art|theme-banner|\.webp/);
    expect(views).not.toMatch(/hero-art|theme-banner|꾸미기 보기|\.webp/);
    expect(main).not.toMatch(/hero-art|theme-banner|themeBannerHtml|\.webp/);
    const cfg = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
    expect(cfg).not.toMatch(/webp|cacheName:\s*'theme-art'/);
    // 프리캐시: 그림(webp) 없음. 글꼴은 리포트 제목 조각(약 2KB)만 더함(QA 3차 M4)
    expect(cfg).toMatch(/PRECACHE_GLOBS = \['\*\*\/\*\.\{js,css,html,svg,png\}', '\*\*\/JJAEM-TitleFlat-\*\.woff2'\]/);
    expect(cfg).toContain('globPatterns: PRECACHE_GLOBS,');
    expect(cfg).toContain("importScripts: ['sw-cleanup.js']");
    const sw = readFileSync(new URL('../../public/sw-cleanup.js', import.meta.url), 'utf8');
    expect(sw).toMatch(/addEventListener\(\s*'activate'/);
    expect(sw).toContain("caches.delete('theme-art')");
    expect(sw).toContain("caches.delete('fonts')");
    expect(cfg).toContain("cacheName: 'fonts-v2'");
    expect(cfg).toContain("cacheId: 'gagyebu-v2'");
    expect(css).toMatch(/word-break:\s*keep-all/);
    expect(css).not.toMatch(/\.look-name\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });
  test('저장된 decor 는 화면을 바꾸지 않고 그대로 읽힌다', () => {
    const s = mem({ decor: 'off', mood: 'sakura' });
    expect(readLook(s)).toEqual({ mood: 'sakura', font: 'pretendard', decor: false, tone: { ...DEFAULT_TONE } });
    const root = { dataset: {} };
    applyLook(readLook(s), root);
    expect(root.dataset).toEqual({ theme: 'sakura', font: 'pretendard', decor: 'off', toneMenu: 'on', toneAccent: 'on', toneCard: 'off' });
    expect(s.getItem('decor')).toBe('off');
  });
});

describe('나눔라운드 숫자', () => {
  test('저장된 gaegu 는 본문 글꼴과 금액용 Pretendard를 함께 받는다', () => {
    expect(fontsFor('gaegu')).toEqual(['gaegu', 'pretendard']);
    expect(fontsFor('pretendard')).toEqual(['jjaem']);
    expect(fontsFor('system')).toEqual([]);
    expect(toneList({ menu: true, accent: true, card: false })).toEqual(['menu', 'accent']);
    expect(toneList({ menu: false, accent: false, card: false })).toEqual([]);
  });
  test('gaegu 값은 나눔스퀘어라운드 서브셋이고, 금액은 Pretendard 고정폭이다', () => {
    const face = readFileSync(new URL('../assets/fonts/gaegu.css', import.meta.url), 'utf8');
    const blocks = face.match(/@font-face\s*\{[^}]+\}/g);
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block).toMatch(/font-family:\s*"Gagyebu Round"/);
      expect(block).not.toMatch(/size-adjust/);
      expect(block).toMatch(/GagyebuRound-/);
    }
    expect(face).toMatch(/SIL Open Font License/);
    const css = readFileSync(new URL('../themes.css', import.meta.url), 'utf8');
    expect(css).toMatch(/html\[data-font="gaegu"\] :is\(\.tabular-nums, \[data-fit\], \.num\)/);
    expect(css).toMatch(/font-family:[^;]*Pretendard Variable/);
    expect(css).toMatch(/font-family:[^;]*Gagyebu Round/);
    expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(css).not.toMatch(/hero-art|theme-banner|Gaegu/);
  });
});

describe('쨈 폰트 v1.0.5', () => {
  const face = readFileSync(new URL('../assets/fonts/jjaem/jjaem-font.css', import.meta.url), 'utf8');
  const blocks = face.match(/@font-face\{[^}]+\}/g);
  const range = (block) => {
    const out = new Set();
    for (const tok of block.match(/unicode-range:([^;}]+)/)[1].split(',')) {
      const [a, b = a] = tok.replace('U+', '').split('-').map((x) => parseInt(x, 16));
      for (let c = a; c <= b; c++) out.add(c);
    }
    return out;
  };
  const body = (weight) => blocks.filter((x) => x.includes("font-family:'JJAEM Body'") && x.includes(`font-weight:${weight};`));

  test('기본 값(pretendard)은 쨈 본문 조각판으로 그리고, 전체 TTF·한 파일판은 싣지 않는다', () => {
    expect(blocks).toHaveLength(7);
    for (const block of blocks) {
      expect(block).toMatch(/font-display:swap/);
      expect(block).toMatch(/unicode-range:U\+/);
      expect(block).toMatch(/url\('fonts\/JJAEM[^']*\.(core|ks|ext|title)\.woff2'\) format\('woff2'\)/);
      const file = block.match(/url\('([^']+)'\)/)[1];
      expect(readdirSync(new URL('../assets/fonts/jjaem/fonts/', import.meta.url))).toContain(file.replace('fonts/', ''));
    }
    // 굵기는 두 벌: 100~500 → 보통, 600~900 → 굵게 (가짜 굵게 없이 semibold·extrabold 도 굵게 파일로)
    expect(body('100 500').map((x) => x.match(/\.(core|ks|ext)\.woff2/)[1])).toEqual(['core', 'ks', 'ext']);
    expect(body('600 900').map((x) => x.match(/\.(core|ks|ext)\.woff2/)[1])).toEqual(['core', 'ks', 'ext']);
    expect(face.match(/font-family:'JJAEM Title Flat'/g)).toHaveLength(1);
    expect(face).not.toMatch(/\.ttf|\.otf|한파일판/);
    expect(FONT_OPTIONS.find((o) => o.id === 'pretendard').label).toBe('쨈 본문');
    const tw = readFileSync(new URL('../../tailwind.config.js', import.meta.url), 'utf8');
    expect(tw).toMatch(/sans: \['"JJAEM Body"', '"Pretendard Variable"'/);
  });

  test('첫 조각(.core)·.ks·.ext 글자 범위는 겹치지 않고, 앱 소스의 한글·가운뎃점은 모두 첫 조각에 있다', () => {
    for (const w of ['100 500', '600 900']) {
      const [core, ks, ext] = body(w).map(range);
      for (const c of core) { expect(ks.has(c)).toBe(false); expect(ext.has(c)).toBe(false); }
      expect(core.has(0xb7)).toBe(true);
      const src = fileURLToPath(new URL('..', import.meta.url));
      const files = [];
      const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|css|html)$/.test(e.name) && !e.name.endsWith('.test.js')) files.push(p); } };
      walk(src);
      const missing = new Set();
      for (const f of files) {
        const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '');
        for (const ch of text) { const c = ch.codePointAt(0); if (c >= 0xac00 && c <= 0xd7a3 && !core.has(c)) missing.add(ch); }
      }
      // 화면 글자를 새로 넣었으면 tools/font/make-jjaem-core.py 를 다시 돌려 첫 조각을 만들어 주세요.
      expect([...missing].join('')).toBe('');
    }
  });

  test('미리 받기(preload)는 보통 굵기 첫 조각 하나만, 기본 글꼴일 때만, 앱 CSS·JS 뒤에 낮은 우선순위로 건다(QA 3차 M3)', async () => {
    const { default: config } = await import('../../vite.config.js');
    const plugin = config.plugins.flat().find((p) => p?.name === 'preload-main-fonts');
    const bundle = Object.fromEntries(['assets/JJAEMBody-Regular.core-AAAA1111.woff2', 'assets/JJAEMBody-Bold.core-BBBB2222.woff2', 'assets/JJAEMBody-Regular.ks-CCCC3333.woff2', 'assets/jjaem-font-DDDD4444.css', 'assets/index-EEEE5555.js'].map((f) => [f, {}]));
    const out = plugin.transformIndexHtml.handler('<html><head></head></html>', { bundle });
    const tags = out.tags ?? out;
    expect(tags).toHaveLength(1);
    expect(tags[0].injectTo).toBe('head'); // head 끝: Vite 가 넣는 앱 CSS·모듈 스크립트 뒤
    const run = (font) => {
      const links = [];
      const document = { documentElement: { dataset: font ? { font } : {} }, createElement: () => ({}), head: { appendChild: (l) => links.push(l) } };
      new Function('document', tags[0].children)(document);
      return links;
    };
    for (const font of [undefined, 'pretendard']) {
      const links = run(font);
      expect(links.map((l) => [l.rel, l.as, l.fetchPriority, l.crossOrigin, l.href]).sort()).toEqual([
        ['preload', 'font', 'low', '', '/gagyebu/assets/JJAEMBody-Regular.core-AAAA1111.woff2'],
      ]); // 굵게 .core·.ks 조각·글꼴 CSS 는 미리 받지 않음
    }
    expect(run('system')).toEqual([]);
    expect(run('gaegu')).toEqual([]);
  });

  test('글꼴 런타임 캐시(fonts-v2, 만료 관리)는 글꼴 요청과 미리 받기가 다시 받는 woff2 를 같이 맡고, 리포트 제목 조각은 프리캐시(QA 3차 M4·M7)', async () => {
    const { FONT_RUNTIME_CACHE, PRECACHE_GLOBS } = await import('../../vite.config.js');
    const req = (destination, path) => ({ request: { destination }, url: new URL(`https://x.test/gagyebu/assets/${path}`) });
    expect(FONT_RUNTIME_CACHE.urlPattern(req('font', 'JJAEMBody-Regular.ks-AAAA.woff2'))).toBe(true);
    expect(FONT_RUNTIME_CACHE.urlPattern(req('', 'JJAEMBody-Regular.ks-AAAA.woff2'))).toBe(true);
    expect(FONT_RUNTIME_CACHE.urlPattern(req('script', 'index-AAAA.js'))).toBe(false);
    expect(FONT_RUNTIME_CACHE.urlPattern(req('style', 'index-AAAA.css'))).toBe(false);
    expect(FONT_RUNTIME_CACHE).toMatchObject({ handler: 'CacheFirst', options: { cacheName: 'fonts-v2', expiration: { maxEntries: 120 } } });
    const title = readdirSync(fileURLToPath(new URL('../assets/fonts/jjaem/fonts/', import.meta.url))).filter((f) => /Title/.test(f));
    expect(title).toEqual(['JJAEM-TitleFlat-Regular.title.woff2']);
    expect(PRECACHE_GLOBS).toContain('**/JJAEM-TitleFlat-*.woff2');
    expect(PRECACHE_GLOBS.join()).not.toMatch(/JJAEMBody|\*\.woff2'|\{[^}]*woff2/); // 본문 조각은 프리캐시하지 않음(쓰는 것만 런타임)
  });

  describe('.ks 조각 미리 받기(QA N2·3차 M5·M6·M7)', () => {
    const tick = () => new Promise((r) => setTimeout(r, 5));
    const fake = ({ conn, font = 'pretendard', controller = {}, idleQueue = false } = {}) => {
      const calls = [], fetched = [], idles = [], sw = { controller, listeners: [], addEventListener: (ev, fn) => sw.listeners.push([ev, fn]) };
      const win = {
        document: { readyState: 'complete', documentElement: { dataset: { font } }, fonts: { ready: Promise.resolve(), load: (f, t) => { calls.push([f, t]); return Promise.resolve([]); } } },
        navigator: { connection: conn, serviceWorker: sw },
        fetch: async (u) => { fetched.push(u); return {}; },
        requestIdleCallback: (fn) => (idleQueue ? idles.push(fn) : fn()),
        setTimeout: (fn) => fn(),
        addEventListener: () => {},
      };
      return { win, calls, fetched, idles, sw };
    };
    test('.ks 범위 안 글자로 두 굵기를 받고, 첫 조각·.ks 는 워커를 거쳐(fetch) 다시 받아 만료 관리되는 캐시에 둔다', async () => {
      for (const w of ['100 500', '600 900']) {
        const [core, ks, ext] = body(w).map(range);
        const c = KS_SAMPLE.codePointAt(0);
        expect(ks.has(c)).toBe(true); expect(core.has(c)).toBe(false); expect(ext.has(c)).toBe(false);
      }
      expect(JJAEM_CACHE_FILES.map((u) => u.split('/').pop().replace(/-[\w-]{8}\./, '.'))).toEqual(['JJAEMBody-Regular.core.woff2', 'JJAEMBody-Bold.core.woff2', 'JJAEMBody-Regular.ks.woff2', 'JJAEMBody-Bold.ks.woff2']);
      resetKsPrefetchForTest();
      const a = fake();
      expect(prefetchJjaemKs(a.win)).toBe(true);
      await tick();
      expect(a.calls).toEqual([['400 16px "JJAEM Body"', KS_SAMPLE], ['700 16px "JJAEM Body"', KS_SAMPLE]]);
      expect(a.fetched).toEqual(JJAEM_CACHE_FILES);
      expect(prefetchJjaemKs(fake().win)).toBe(false); // 한 번만
      resetKsPrefetchForTest();
    });
    test('워커가 아직 화면을 맡지 않았으면 맡은 뒤(controllerchange)에 받는다. 워커가 없으면 캐시에 넣지 않는다', async () => {
      resetKsPrefetchForTest();
      const a = fake({ controller: null });
      prefetchJjaemKs(a.win); await tick();
      expect(a.calls).toHaveLength(2);
      expect(a.fetched).toEqual([]);
      const [[ev, fn]] = a.sw.listeners; expect(ev).toBe('controllerchange');
      fn(); await tick();
      expect(a.fetched).toEqual(JJAEM_CACHE_FILES);
      resetKsPrefetchForTest();
      const b = fake(); delete b.win.navigator.serviceWorker;
      prefetchJjaemKs(b.win); await tick();
      expect(b.calls).toHaveLength(2); expect(b.fetched).toEqual([]);
      resetKsPrefetchForTest();
    });
    test('글꼴 설정이 시스템·나눔라운드면 받지 않는다(클라우드에서 받은 설정 포함)', async () => {
      for (const font of ['system', 'gaegu']) {
        resetKsPrefetchForTest();
        const a = fake({ font });
        expect(prefetchJjaemKs(a.win)).toBe(false);
        await tick();
        expect(a.calls).toEqual([]); expect(a.fetched).toEqual([]);
      }
      // 기기에는 기본 글꼴, 로그인해서 받은 설정은 system → 받기 직전 다시 보면 system 이라 받지 않음
      resetKsPrefetchForTest();
      const c = fake();
      adoptCloudLook({ font: 'system' }, mem({ font: 'pretendard' }), c.win.document.documentElement);
      expect(c.win.document.documentElement.dataset.font).toBe('system');
      expect(prefetchJjaemKs(c.win)).toBe(false);
      await tick();
      expect(c.calls).toEqual([]);
      resetKsPrefetchForTest();
    });
    test('기다리는 사이 설정을 시스템으로 바꾸면 그만두고, 나중에 기본으로 돌아오면 다시 받는다', async () => {
      resetKsPrefetchForTest();
      const a = fake({ idleQueue: true });
      expect(prefetchJjaemKs(a.win)).toBe(true);
      a.win.document.documentElement.dataset.font = 'system';
      while (a.idles.length) { a.idles.shift()(); await tick(); }
      expect(a.calls).toEqual([]); expect(a.fetched).toEqual([]);
      a.win.document.documentElement.dataset.font = 'pretendard';
      expect(prefetchJjaemKs(a.win)).toBe(true);
      while (a.idles.length) { a.idles.shift()(); await tick(); }
      expect(a.calls).toHaveLength(2); expect(a.fetched).toEqual(JJAEM_CACHE_FILES);
      resetKsPrefetchForTest();
    });
    test('데이터 절약 모드·2G 에서는 받지 않는다', async () => {
      for (const conn of [{ saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }]) {
        resetKsPrefetchForTest();
        const b = fake({ conn });
        expect(prefetchJjaemKs(b.win)).toBe(false);
        await tick();
        expect(b.calls).toEqual([]);
      }
      resetKsPrefetchForTest();
    });
  });
});

function homeFixture(look) {
  return {
    viewYm: '2026-10', curYm: '2026-10', sd: 1, txLoaded: true,
    weather: { hasBudget: true, weather: { key: 'sunny', icon: '☀️', label: '맑음', text: '여유 있어요' }, available: 18400, usedPct: 40, daysLeft: 11, tomorrow: 19000, remaining: 200000 },
    tot: { expense: 12000, income: 3100000, saved: 3088000 },
    periodTxs: [], wide: false, streak: 0, noSpend: 0, budget: { total: 1500000 },
    catMap: new Map(), categories: [], accounts: [], accMap: new Map(),
    assetAccounts: [], holdings: [],
    mode: null, features: {}, settings: null, look,
  };
}

describe('설정·홈 표시', () => {
  test('설정에 색 견본과 글꼴이 있고 꾸미기 스위치는 없다', () => {
    if (!globalThis.localStorage) {
      const box = new Map();
      globalThis.localStorage = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, String(v)), removeItem: (k) => box.delete(k) };
    }
    const html = settingsView({ ...homeFixture({ mood: 'ocean', font: 'system', decor: false }), themeMode: 'light', user: { displayName: '초', email: '' }, categories: [], accounts: [{ id: 'card', name: '카드', emoji: '💳', type: 'card' }], rules: [], recurring: [] }, { catKind: 'expense' });
    expect(html).toContain('data-mood="ocean"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('벚꽃');
    expect(html).toContain('data-font-pick="system"');
    expect(html).toContain('나눔라운드');
    expect(html).toContain('톤 적용 부분');
    expect(html).toContain('data-tone-part="menu" checked');
    expect(html).toContain('data-tone-part="accent" checked');
    expect(html).not.toMatch(/data-tone-part="card" checked/);
    expect(html).not.toContain('꾸미기 보기');
    expect(html).not.toContain('data-decor');
    expect(html).not.toContain('Gaegu');
    expect(html).toContain('SIL OFL');
  });
  test('분위기를 켜도 홈에는 그림 없이 금액만 있다', () => {
    for (const decor of [true, false]) {
      const html = homeView(homeFixture({ mood: 'sakura', font: 'pretendard', decor }));
      expect(html).not.toMatch(/hero-art|theme-banner|\.webp/);
      expect(html).toContain('이번 달 남은 예산');
      expect(html).toContain('hero-card px-5');
    }
  });
});

describe('쨈 심볼과 추가 버튼', () => {
  test('로고(가로 로고·첫 화면 로고·brand SVG)는 앱 아이콘과 같은 글자 윤곽 JJAEM_ICON_D를 남색 잉크로 그린다', () => {
    const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
    const horiz = logo({ cls: 'boot-logo' });
    const boot = read('../../index.html').split('\n').find((l) => l.includes('id="boot-logo"'));
    const light = read('../../public/brand/logo-light.svg');
    const dark = read('../../public/brand/logo-dark.svg');
    for (const svg of [horiz, boot, light, dark]) {
      expect(svg).toContain(`<path d="${JJAEM_ICON_D}" fill="url(#`);
      expect(svg).not.toContain(JJAEM_D);
      expect(svg).toContain('translate(112.68 56.80)'); // 손그림 '가계부'는 그대로
    }
    // 첫 화면 로고는 logo()를 그대로 옮긴 것(그라데이션 id만 lgBoot)
    expect(boot).toContain(horiz.replace(/lgL\d+/g, 'lgBoot'));
    // 앱 안 색은 CSS 변수(라이트는 아이콘 남색 잉크, 다크는 더 밝은 남색), brand SVG는 같은 값을 직접 적는다
    const css = read('../style.css');
    expect(css).toContain(':root { --lg1: #3D55C4; --lg2: #2B3FA0; --lg3: #1A2470;');
    expect(css).toContain('.dark { --lg1: #B9C4FF; --lg2: #93A4FF; --lg3: #7A8CF0;');
    for (const c of ['#3D55C4', '#2B3FA0', '#1A2470']) expect(light).toContain(`stop-color="${c}"`);
    for (const c of ['#B9C4FF', '#93A4FF', '#7A8CF0']) expect(dark).toContain(`stop-color="${c}"`);
  });

  test('앱 안 심볼은 아이콘 글자 윤곽 JJAEM_ICON_D(단색은 currentColor)이고, 아이콘 SVG도 같은 윤곽을 그린다', () => {
    const svg = symbol('S', { cls: 'fab-mark', ink: true });
    expect(svg).toContain('class="fab-mark"');
    expect(svg).toContain('fill="currentColor"');
    expect(svg).toContain(`viewBox="${JJAEM_ICON_VB}"`);
    expect(svg).toContain(`d="${JJAEM_ICON_D}"`);
    expect(svg).not.toContain(JJAEM_D);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).not.toContain('linearGradient');
    const painted = symbol('S', { label: '쨈 가계부' });
    expect(painted).toContain('linearGradient');
    expect(painted).toContain('aria-label="쨈 가계부"');
    expect(painted).toContain(`d="${JJAEM_ICON_D}"`);
    expect(painted).not.toContain(JJAEM_D);
    const views = readFileSync(new URL('../ui/views.js', import.meta.url), 'utf8');
    expect(views).not.toMatch(/아래 가운데|왼쪽 위/); // 화면 폭마다 버튼 위치가 달라 위치를 말하지 않음
    const fav = readFileSync(new URL('../../public/favicon.svg', import.meta.url), 'utf8');
    // 앱 아이콘(은박 호일 컵)은 쨈 제목 평면 글자 윤곽(JJAEM_ICON_D)을 #g 로 정의해 <use>로 그린다
    const maskableSvg = readFileSync(new URL('../../public/pwa-maskable.svg', import.meta.url), 'utf8');
    for (const svgText of [fav, maskableSvg]) {
      expect(svgText).toContain(`<path id="g" d="${JJAEM_ICON_D}"`);
      expect(svgText).toContain('<use href="#g"');
      expect(svgText).toContain('JJAEM Title Flat');
    }
    expect(fav).toContain('<title>쨈 가계부</title>');
    const tokens = readFileSync(new URL('../../design/tokens-a.css', import.meta.url), 'utf8');
    const root = varsIn(tokens, ':root');
    expect(contrast('#FFFFFF', root['--fab-1'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#FFFFFF', root['--fab-2'])).toBeGreaterThanOrEqual(4.5);
  });
});

function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function rgb(hex) { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function hex(c) { return `#${c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`; }
function lum(h) { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
function contrast(a, b) {
  const hi = Math.max(lum(a), lum(b)); const lo = Math.min(lum(a), lum(b));
  return (hi + 0.05) / (lo + 0.05);
}
function mix(a, b, t) {
  const pa = rgb(a); const pb = rgb(b);
  return hex(pa.map((c, i) => c + (pb[i] - c) * t));
}
function varsIn(css, selector) {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  if (!m) throw new Error(`없는 블록 ${selector}`);
  const out = {};
  for (const part of m[1].split(';')) {
    const hit = part.match(/(--[a-z0-9-]+)\s*:\s*([\s\S]+)/);
    if (hit) out[hit[1]] = hit[2].trim();
  }
  return out;
}

describe('테마 글자 대비', () => {
  const css = readFileSync(new URL('../themes.css', import.meta.url), 'utf8');
  const neutral = {
    light: { bg: '#F6F4FF', ink: '#1E1B3A', sub: '#5B5775', surface: '#FFFFFF' },
    dark: { bg: '#0F0E1A', ink: '#F3F1FF', sub: '#B4AFCF', surface: '#1C1A2E' },
  };
  const pairs = (p, n, label) => {
    const fails = [];
    const need = (name, a, b, floor = 4.5) => { const c = contrast(a, b); if (c < floor - 0.02) fails.push(`${label} ${name} ${c.toFixed(2)}`); };
    expect(p['--bg']).toBeUndefined();
    expect(p['--ink']).toBeUndefined();
    expect(p['--mood']).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const card = mix(n.surface, p['--mood'], 0.08);
    const expense = label.startsWith('dark') ? '#FF8A9B' : '#CC2A48';
    const income = label.startsWith('dark') ? '#5EE0A8' : '#0B7A55';
    const bar = mix(n.surface, p['--mood'], 0.14);
    const head = mix(n.bg, p['--mood'], 0.14);
    need('mood/bg', p['--mood'], n.bg);
    need('mood/surface', p['--mood'], n.surface);
    need('mood-on', p['--mood-on'], p['--mood']);
    need('ink/card', n.ink, card);
    need('sub/card', n.sub, card);
    need('expense/card', expense, card);
    need('income/card', income, card);
    need('mood/card', p['--mood'], card);
    need('sub/bar', n.sub, bar);
    need('mood/bar', p['--mood'], bar);
    need('mood/head', p['--mood'], head);
    need('ink/head', n.ink, head);
    need('fab1', '#FFFFFF', p['--mood-fab-1']);
    need('fab2', '#FFFFFF', p['--mood-fab-2']);
    expect(fails, fails.join('\n')).toEqual([]);
  };
  test('톤은 메뉴·강조·카드에만 붙고 바탕 변수는 건드리지 않는다', () => {
    expect(css).toMatch(/data-tone-menu/);
    expect(css).toMatch(/data-tone-accent/);
    expect(css).toMatch(/data-tone-card/);
    expect(css).toMatch(/--mood\) 8%, var\(--surface-solid\)/);
    expect(css).toMatch(/:not\(\.btn-primary, \.btn-primary \*\)/);
    expect(css).toMatch(/\.btn-primary \{\s*color: var\(--on-primary\)/);
    const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const wash = (name) => {
      const m = style.match(new RegExp(`\\.bud-hero\\.is-${name}[^{]*\\{[^}]*?color-mix\\(in srgb, var\\(--(?:income|expense)\\) (\\d+)%`));
      expect(m, name).toBeTruthy();
      return Number(m[1]) / 100;
    };
    const surface = '#FFFFFF';
    expect(contrast('#0B7A55', mix(surface, '#0B7A55', wash('ok')))).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#CC2A48', mix(surface, '#CC2A48', wash('over')))).toBeGreaterThanOrEqual(4.5);
    expect(css).not.toMatch(/--bg\s*:/);
    expect(css).not.toMatch(/--ink\s*:/);
    expect(css).not.toMatch(/--aurora-/);
  });
  for (const id of ART_MOODS) {
    test(`라이트 ${id}`, () => pairs(varsIn(css, `html[data-theme="${id}"]`), neutral.light, `light ${id}`));
    test(`다크 ${id}`, () => pairs(varsIn(css, `html.dark[data-theme="${id}"]`), neutral.dark, `dark ${id}`));
  }
});

// 디자인 스펙 17절 #5·#14: 과한 겸양 '~드릴게요/~드려요' 대신 친구 말투 '~줄게요/둘게요/줘요'
test('문구 17절: src 전체에 드릴게요·드려요를 쓰지 않음', () => {
  const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  expect(read('../main.js')).toContain('팁을 처음부터 다시 보여 줄게요.');
  expect(read('../ui/views.js')).toContain('그래프를 그려 줄게요.');
  expect(read('../ui/importer.js')).toContain('다음부터는 알아서 맞춰 둘게요.');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  const files = walk(root).filter((f) => /\.(js|css|html)$/.test(f) && !f.endsWith('look.test.js'));
  expect(files.length).toBeGreaterThan(20);
  const bad = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((l, i) => /드릴게요|드려요/.test(l) ? `${f.slice(root.length)}:${i + 1}` : null).filter(Boolean));
  expect(bad).toEqual([]);
});

describe('추가 버튼: 조식 쨈 컵', () => {
  const EMPTY = '아직 기록이 없어요. 쨈 컵 모양 버튼을 눌러 첫 기록을 10초 만에 남겨 보세요.';
  test('버튼 안에 ＋ 없이 쨈 컵 그림과 보이는 글자 "기록"이 있고, 접근 이름이 "기록"으로 시작한다(WCAG 2.5.3)', () => {
    expect(FAB_INNER).toContain('class="cup-svg"');
    expect(FAB_INNER).not.toMatch(/＋|fab-plus|M12 5v14/);
    expect(FAB_INNER).toMatch(/<span class="fab-txt"[^>]*>기록<\/span>/);
    expect(FAB_INNER).not.toContain('fab-mark');
    for (const f of ['../main.js', '../dev/shot-main.js']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      const btn = src.match(/<button class="fab"[^>]*>[^<]*<\/button>/)?.[0] ?? '';
      expect(btn).toContain('data-action="add"');
      expect(btn).toContain('${FAB_INNER}');
      const name = btn.match(/aria-label="([^"]+)"/)?.[1] ?? '';
      expect(name.startsWith('기록')).toBe(true);
      expect(name).toContain('기록');
    }
  });
  test('빈 화면 안내는 정해진 문장이고 설계 문서와 같다', () => {
    const html = homeView(homeFixture(null));
    expect(html).toContain(EMPTY);
    const spec = readFileSync(new URL('../../design/design-spec.md', import.meta.url), 'utf8');
    expect(spec).toContain(`"${EMPTY}"`);
  });
  test('첫 실행(모바일)은 안내 카드를 요약 바로 아래에 둬 아래 메뉴에 가리지 않는다(QA L4), PC는 오른쪽 칸 그대로', () => {
    const mob = homeView(homeFixture(null));
    expect(mob.indexOf(EMPTY)).toBeLessThan(mob.indexOf('stat-grid'));
    expect(mob.match(/id="recent-h"/g)).toHaveLength(1);
    const pc = homeView({ ...homeFixture(null), wide: true });
    expect(pc.indexOf(EMPTY)).toBeGreaterThan(pc.indexOf('stat-grid'));
  });
});
