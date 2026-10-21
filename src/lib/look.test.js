import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { normalizeSettings } from './modes.js';
import { homeView, settingsView } from '../ui/views.js';
import {
  DEFAULT_LOOK, MOODS, FONTS, ART_MOODS,
  readLook, writeLook, sanitizeLook, applyLook, lookFromCloud, adoptCloudLook, heroArtHtml, themeBannerHtml,
  fontsFor, artFailed,
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
    expect(DEFAULT_LOOK).toEqual({ mood: 'default', font: 'pretendard', decor: true });
    expect(sanitizeLook(null)).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook({ mood: 'blue', font: 'comic', decor: 'yes' })).toEqual(DEFAULT_LOOK);
  });
  test('저장한 값은 다시 읽고, 기본값이면 키를 지운다', () => {
    const s = mem();
    writeLook({ mood: 'sakura', font: 'gaegu', decor: false }, s);
    expect(readLook(s)).toEqual({ mood: 'sakura', font: 'gaegu', decor: false });
    expect(s.getItem('mood')).toBe('sakura');
    expect(s.getItem('font')).toBe('gaegu');
    expect(s.getItem('decor')).toBe('off');
    writeLook(DEFAULT_LOOK, s);
    expect(s.getItem('mood')).toBeNull();
    expect(s.getItem('font')).toBeNull();
    expect(s.getItem('decor')).toBeNull();
    expect(readLook(s)).toEqual(DEFAULT_LOOK);
  });
  test('잘못된 저장값은 무시하고 기본으로 돌아간다', () => {
    expect(readLook(mem({ mood: 'ocean', font: 'papyrus', decor: 'maybe' }))).toEqual({ mood: 'ocean', font: 'pretendard', decor: true });
    expect(readLook(mem({ mood: 'blue', font: 'system', decor: 'off' }))).toEqual({ mood: 'default', font: 'system', decor: false });
    expect(readLook({ getItem() { throw new Error('막힘'); } })).toEqual(DEFAULT_LOOK);
  });
  test('html data-theme·data-font·data-decor 에 반영', () => {
    const root = { dataset: {} };
    applyLook({ mood: 'maple', font: 'system', decor: false }, root);
    expect(root.dataset).toEqual({ theme: 'maple', font: 'system', decor: 'off' });
    applyLook(DEFAULT_LOOK, root);
    expect(root.dataset.theme).toBe('default');
    expect(root.dataset.decor).toBe('on');
  });
});

describe('클라우드 설정', () => {
  test('없는 키는 이 기기 값을 덮지 않는다', () => {
    const s = mem();
    writeLook({ mood: 'sakura', font: 'system', decor: true }, s);
    const root = { dataset: {} };
    expect(lookFromCloud(null)).toBeNull();
    expect(lookFromCloud({ theme: 'ocean', mode: 'single' })).toBeNull();
    expect(adoptCloudLook({ mode: 'student', theme: 'ocean' }, s, root)).toEqual({ mood: 'sakura', font: 'system', decor: true });
    expect(s.getItem('mood')).toBe('sakura');
    expect(root.dataset.theme).toBeUndefined();
  });
  test('있는 키만 합치고 잘못된 값은 버린다', () => {
    const s = mem();
    writeLook({ mood: 'sakura', font: 'pretendard', decor: true }, s);
    const root = { dataset: {} };
    expect(lookFromCloud({ mood: 'ocean', font: 'nope', decor: false, mode: 'couple' })).toEqual({ mood: 'ocean', decor: false });
    const next = adoptCloudLook({ mood: 'ocean', font: 'comic', decor: false }, s, root);
    expect(next).toEqual({ mood: 'ocean', font: 'pretendard', decor: false });
    expect(root.dataset).toEqual({ theme: 'ocean', font: 'pretendard', decor: 'off' });
    expect(readLook(s).mood).toBe('ocean');
  });
  test('모드 정규화·백업 경로는 분위기 키를 기존 설정에 섞지 않는다', () => {
    const raw = { mode: 'single', mood: 'sakura', font: 'gaegu', decor: true, theme: 'ocean', allowanceAmount: 1, updatedAt: 'x' };
    expect(normalizeSettings(raw)).toEqual({ mode: 'single', allowanceAmount: 1 });
    expect(JSON.stringify(normalizeSettings(raw))).not.toMatch(/mood|font|decor|theme|updatedAt/);
  });
});

describe('꾸미기 그림', () => {
  test('꺼짐·기본 테마는 그림을 넣지 않는다', () => {
    expect(heroArtHtml({ mood: 'sakura', decor: false }, '/gagyebu/')).toBe('');
    expect(heroArtHtml({ mood: 'default', decor: true }, '/gagyebu/')).toBe('');
    expect(themeBannerHtml(DEFAULT_LOOK, '/gagyebu/')).toBe('');
  });
  test('켜진 테마의 그림만, 두 폭, lazy', () => {
    const html = heroArtHtml({ mood: 'sakura', font: 'pretendard', decor: true }, '/gagyebu/');
    expect(html).toContain('src="/gagyebu/themes/sakura-480.webp"');
    expect(html).toContain('srcset="/gagyebu/themes/sakura-480.webp 480w, /gagyebu/themes/sakura-960.webp 960w"');
    expect(html).toContain('loading="lazy"');
    for (const other of ART_MOODS.filter((id) => id !== 'sakura')) expect(html).not.toContain(other);
    expect(MOODS).toEqual(['default', 'sakura', 'ocean', 'maple', 'snow', 'retro']);
    expect(FONTS).toEqual(['system', 'pretendard', 'gaegu']);
    const css = readFileSync(new URL('../themes.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/\.webp/);
  });
  test('그림이 실패하면 480만 다시 받고, 그것도 없으면 칸을 숨긴다', () => {
    const img = fakeImg({ src: '/gagyebu/themes/sakura-480.webp', srcset: '/gagyebu/themes/sakura-480.webp 480w, /gagyebu/themes/sakura-960.webp 960w' });
    img.currentSrc = 'https://example.test/gagyebu/themes/sakura-960.webp';
    expect(artFailed(img)).toBe('retry');
    expect(img.getAttribute('srcset')).toBe('');
    expect(img.src).toBe('/gagyebu/themes/sakura-480.webp');
    expect(artFailed(img)).toBe('hide');
    expect(img.classList.contains('is-broken')).toBe(true);
    expect(img.banner.classList.contains('is-broken')).toBe(true);
    expect(artFailed(img)).toBe('hide');
  });
});

function fakeImg({ src, srcset }) {
  const banner = { classList: classBox() };
  const attrs = new Map([['src', src], ['srcset', srcset]]);
  return {
    src,
    dataset: {},
    classList: classBox(),
    banner,
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, v),
    closest: () => banner,
  };
}
function classBox() {
  const s = new Set();
  return { add: (c) => s.add(c), contains: (c) => s.has(c) };
}

describe('손글씨 숫자·크기·오프라인 그림', () => {
  test('손글씨는 본문과 금액용 Pretendard를 함께 받는다', () => {
    expect(fontsFor('gaegu')).toEqual(['gaegu', 'pretendard']);
    expect(fontsFor('pretendard')).toEqual(['pretendard']);
    expect(fontsFor('system')).toEqual([]);
  });
  test('Gaegu는 120%로 키우고, 금액은 Pretendard 고정폭이다', () => {
    const face = readFileSync(new URL('../assets/fonts/gaegu.css', import.meta.url), 'utf8');
    const blocks = face.match(/@font-face\s*\{[^}]+\}/g);
    expect(blocks).toHaveLength(2);
    for (const block of blocks) expect(block).toMatch(/size-adjust:\s*120%/);
    const css = readFileSync(new URL('../themes.css', import.meta.url), 'utf8');
    expect(css).toMatch(/html\[data-font="gaegu"\] :is\(\.tabular-nums, \[data-fit\], \.num\)/);
    expect(css).toMatch(/font-family:[^;]*Pretendard Variable/);
    expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(css).toMatch(/height:\s*clamp\(56px,\s*calc\(150px - \(var\(--fs, 1\) - 1\) \* 300px\), 150px\)/);
    expect(css).toMatch(/@media \(max-width: 480px\)\s*\{\s*\.hero-art \{ height: 60px; \}/);
    expect(css).toMatch(/\.hero-art\.is-broken \{ display: none; \}/);
    expect(css).toMatch(/\.theme-banner\.is-broken \{ display: none; \}/);
    expect(css).not.toMatch(/top:\s*114px/);
  });
  test('480 그림만 설치 캐시하고 960은 본 뒤에 저장한다', () => {
    const cfg = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
    expect(cfg).toMatch(/themes\/\*-480\.webp/);
    expect(cfg).not.toMatch(/globPatterns:[^\]]*960/);
    expect(cfg).toContain('[^/]+-960\\.webp');
    expect(cfg).toMatch(/cacheName: 'theme-art'/);
    expect(cfg).toMatch(/handler: 'CacheFirst'/);
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
  test('설정에 색 견본·글꼴·꾸미기 스위치가 있다', () => {
    if (!globalThis.localStorage) {
      const box = new Map();
      globalThis.localStorage = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, String(v)), removeItem: (k) => box.delete(k) };
    }
    const html = settingsView({ ...homeFixture({ mood: 'ocean', font: 'system', decor: false }), themeMode: 'light', user: { displayName: '초', email: '' }, categories: [], accounts: [{ id: 'card', name: '카드', emoji: '💳', type: 'card' }], rules: [], recurring: [] }, { catKind: 'expense' });
    expect(html).toContain('data-mood="ocean"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('벚꽃');
    expect(html).toContain('data-font-pick="system"');
    expect(html).toContain('꾸미기 보기');
    expect(html).toContain('data-decor');
    expect(html).not.toMatch(/<input[^>]*data-decor[^>]*checked/);
    expect(html).toContain('SIL OFL');
  });
  test('그림이 켜지면 금액은 그림 아래 칸에 있다', () => {
    const on = homeView(homeFixture({ mood: 'maple', font: 'pretendard', decor: true }));
    const artAt = on.indexOf('class="hero-art"');
    const copyAt = on.indexOf('hero-copy');
    const numAt = on.indexOf('오늘 쓸 수 있는 돈');
    expect(artAt).toBeGreaterThan(-1);
    expect(artAt).toBeLessThan(copyAt);
    expect(copyAt).toBeLessThan(numAt);
    expect(on).toContain('maple-960.webp');
    expect(on).not.toContain('sakura-');
    const off = homeView(homeFixture({ mood: 'maple', font: 'pretendard', decor: false }));
    expect(off).not.toContain('hero-art');
    expect(off).toContain('오늘 쓸 수 있는 돈');
    expect(off).toContain('hero-card px-5');
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
function heatAlpha(block, name) {
  const m = block[name].match(/color-mix\(in srgb, var\(--primary\)\s+(\d+)%/);
  if (!m) throw new Error(name);
  return Number(m[1]) / 100;
}

describe('테마 글자 대비', () => {
  const css = readFileSync(new URL('../themes.css', import.meta.url), 'utf8');
  const pairs = (p, min, label) => {
    const fails = [];
    const need = (name, a, b, floor = min) => { const c = contrast(a, b); if (c < floor - 0.02) fails.push(`${label} ${name} ${c.toFixed(2)}`); };
    need('ink/bg', p['--ink'], p['--bg']);
    need('ink/surface', p['--ink'], p['--surface-solid']);
    need('sub/bg', p['--ink-sub'], p['--bg']);
    need('sub/surface', p['--ink-sub'], p['--surface-solid']);
    need('primary/surface', p['--primary'], p['--surface-solid']);
    need('primary/bg', p['--primary'], p['--bg']);
    need('on-primary', p['--on-primary'], p['--primary']);
    need('expense/surface', p['--expense'], p['--surface-solid']);
    need('expense/bg', p['--expense'], p['--bg']);
    need('income/surface', p['--income'], p['--surface-solid']);
    need('income/bg', p['--income'], p['--bg']);
    need('on-expense', p['--on-expense'], p['--expense']);
    need('on-income', p['--on-income'], p['--income']);
    need('logo', p['--logo-ink'], p['--bg']);
    need('toast', p['--toast-action'], p['--ink']);
    need('hero-btn', p['--hero-btn-ink'], '#FFFFFF');
    for (const id of ['--hero-1', '--hero-2', '--hero-3']) need(`white/${id}`, '#FFFFFF', p[id]);
    need('white/blend12', '#FFFFFF', mix(p['--hero-1'], p['--hero-2'], 0.58));
    need('white/blend23', '#FFFFFF', mix(p['--hero-2'], p['--hero-3'], 0.5));
    for (const id of ['--aurora-1', '--aurora-2', '--aurora-3']) {
      need(`ink/${id}`, p['--ink'], p[id]);
      need(`sub/${id}`, p['--ink-sub'], p[id]);
    }
    for (let i = 1; i <= 7; i++) need(`chart${i}`, p[`--chart-${i}`], p['--surface-solid'], 3);
    need('fab1', '#FFFFFF', p['--fab-1'], 3);
    need('fab2', '#FFFFFF', p['--fab-2'], 3);
    const heatMax = label.startsWith('dark') ? 0.4 : 0.58;
    for (const name of ['--heat-1', '--heat-2', '--heat-3', '--heat-4']) {
      const a = heatAlpha(p, name);
      expect(a).toBeLessThanOrEqual(heatMax + 0.001);
      need(name, p['--ink'], mix(p['--surface-solid'], p['--primary'], a));
    }
    expect(fails, fails.join('\n')).toEqual([]);
  };
  for (const id of ART_MOODS) {
    test(`라이트 ${id}`, () => pairs(varsIn(css, `html[data-theme="${id}"]`), 4.5, `light ${id}`));
    test(`다크 ${id}`, () => pairs(varsIn(css, `html.dark[data-theme="${id}"]`), 4.5, `dark ${id}`));
  }
});
