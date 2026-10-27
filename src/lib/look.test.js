import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { normalizeSettings } from './modes.js';
import { homeView, settingsView } from '../ui/views.js';
import { symbol, JJAEM_D, JJAEM_ICON_D, FAB_INNER } from '../ui/brand.js';
import {
  DEFAULT_LOOK, DEFAULT_TONE, MOODS, FONTS, ART_MOODS,
  readLook, writeLook, sanitizeLook, applyLook, lookFromCloud, adoptCloudLook,
  fontsFor, toneList,
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
    expect(cfg).toMatch(/globPatterns: \['\*\*\/\*\.\{js,css,html,svg,png\}'\]/);
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
    expect(fontsFor('pretendard')).toEqual(['pretendard']);
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
      expect(html).toContain('오늘 쓸 수 있는 돈');
      expect(html).toContain('hero-card px-5');
    }
  });
});

describe('쨈 심볼과 추가 버튼', () => {
  test('앱 안 심볼은 JJAEM_D 윤곽(단색은 currentColor)이고, 아이콘 SVG는 아이콘 글자 윤곽 JJAEM_ICON_D를 그린다', () => {
    const svg = symbol('S', { cls: 'fab-mark', ink: true });
    expect(svg).toContain('class="fab-mark"');
    expect(svg).toContain('fill="currentColor"');
    expect(svg).toContain(JJAEM_D);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).not.toContain('linearGradient');
    const painted = symbol('S', { label: '쨈 가계부' });
    expect(painted).toContain('linearGradient');
    expect(painted).toContain('aria-label="쨈 가계부"');
    expect(painted).toContain(JJAEM_D);
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
