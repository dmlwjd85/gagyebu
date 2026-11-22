// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { settingsView } from './views.js';
import { bindModalHistory, lockApp, dismissTopModal, hasModal } from './util.js';
import { GUIDE_SCENES, sceneSrc, guideBase, openGuide, closeGuide, isGuideOpen, goGuide } from './guide.js';

const app = () => document.getElementById('app');

beforeAll(() => {
  if (!globalThis.localStorage) {
    const box = new Map();
    globalThis.localStorage = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, String(v)), removeItem: (k) => box.delete(k) };
  }
  window.matchMedia ??= (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
});

beforeEach(() => {
  document.body.innerHTML = '<div id="app"><button type="button" data-action="open-guide">열기</button></div>';
  bindModalHistory({ open() {}, close() {} });
});

afterEach(() => {
  closeGuide({ fromPop: true });
  document.querySelectorAll('link[data-guide-pre]').forEach((n) => n.remove());
});

const fixture = () => ({
  viewYm: '2026-10', curYm: '2026-10', sd: 1, txLoaded: true,
  weather: { hasBudget: true, weather: { key: 'sunny', icon: '☀️', label: '맑음', text: '여유 있어요' }, available: 18400, usedPct: 40, daysLeft: 11, tomorrow: 19000, remaining: 200000 },
  tot: { expense: 12000, income: 3100000, saved: 3088000 },
  periodTxs: [], wide: false, streak: 0, noSpend: 0, budget: { total: 1500000 },
  catMap: new Map(), categories: [], accounts: [{ id: 'card', name: '카드', emoji: '💳', type: 'card' }], accMap: new Map(),
  assetAccounts: [], holdings: [], rules: [], recurring: [],
  mode: null, features: {}, settings: null, themeMode: 'light',
  user: { displayName: '초', email: '' },
  look: { mood: 'default', font: 'pretendard', decor: false, tone: { menu: true, accent: true, card: false } },
});

describe('한눈에 보는 설명서', () => {
  test('설정에 설명서 줄이 있고 그림 주소는 적지 않는다', () => {
    const html = settingsView(fixture(), { catKind: 'expense' });
    expect(html).toContain('한눈에 보는 설명서');
    expect(html).toContain('data-action="open-guide"');
    expect(html).not.toMatch(/\.webp|\.gif|guide\/1/);
  });

  test('앱 본체와 배포 설정에는 그림 확장자를 적지 않고, 설명서는 열 때만 받는다', () => {
    const root = process.cwd();
    const main = readFileSync(join(root, 'src/main.js'), 'utf8');
    const views = readFileSync(join(root, 'src/ui/views.js'), 'utf8');
    const css = readFileSync(join(root, 'src/style.css'), 'utf8');
    const cfg = readFileSync(join(root, 'vite.config.js'), 'utf8');
    expect(main).toContain("case 'open-guide'");
    expect(main).toContain("import('./ui/guide.js')");
    expect(main).not.toMatch(/\.webp|\.gif/);
    expect(views).not.toMatch(/\.webp|\.gif/);
    expect(css).not.toMatch(/\.webp|\.gif/);
    expect(cfg).not.toMatch(/webp|cacheName:\s*'theme-art'/);
    expect(cfg).toContain("url.pathname.includes('/guide/')");
    expect(cfg).toContain("cacheName: 'guide-v1'");
    expect(cfg).toContain('handler: \'CacheFirst\'');
  });

  test('그림 주소는 앱 경로 아래 guide 폴더이고, 움직임 줄이기면 멈춘 그림을 쓴다', () => {
    expect(GUIDE_SCENES).toHaveLength(6);
    expect(guideBase('/gagyebu/')).toBe('/gagyebu/');
    expect(sceneSrc(1, { base: '/gagyebu/' })).toBe('/gagyebu/guide/1.webp');
    expect(sceneSrc(1, { still: true, base: '/gagyebu/' })).toBe('/gagyebu/guide/1-still.webp');
    window.matchMedia = (q) => ({ matches: String(q).includes('prefers-reduced-motion') && String(q).includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} });
    openGuide();
    const img = document.querySelector('[data-guide-img]');
    expect(img.getAttribute('src')).toBe('/gagyebu/guide/1-still.webp');
    expect(img.getAttribute('src')).not.toBeFalsy();
  });

  test('열면 지금 장면만 받고, 이전·다음·닫기·뒤로 가기가 된다', () => {
    window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
    const btn = app().querySelector('[data-action="open-guide"]');
    btn.focus();
    openGuide();
    expect(isGuideOpen()).toBe(true);
    expect(app().inert).toBe(true);
    const img = document.querySelector('[data-guide-img]');
    expect(img.getAttribute('src')).toContain('/guide/1.');
    expect(document.querySelectorAll('[data-guide-img]')).toHaveLength(1);
    expect(document.querySelector('[data-guide-cap]').textContent).toContain('17일');
    expect(document.querySelector('[data-guide-prev]').disabled).toBe(true);
    document.querySelector('[data-guide-next]').click();
    expect(document.querySelector('[data-guide-img]').getAttribute('src')).toContain('/guide/2.');
    expect(document.querySelector('[data-guide-num]').textContent).toBe('2 / 6');
    goGuide(1);
    expect(document.querySelector('[data-guide-num]').textContent).toBe('3 / 6');
    document.querySelector('[data-guide-prev]').click();
    expect(document.querySelector('[data-guide-num]').textContent).toBe('2 / 6');
    document.querySelector('[data-guide-close]').click();
    expect(isGuideOpen()).toBe(false);
    expect(hasModal()).toBe(false);
    expect(app().inert).toBe(false);
  });

  test('Escape 와 뒤로 가기로 닫힌다', () => {
    window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
    openGuide();
    expect(isGuideOpen()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(isGuideOpen()).toBe(false);
    openGuide();
    expect(dismissTopModal()).toBe(true);
    expect(isGuideOpen()).toBe(false);
  });

  test('장면 그림 파일이 있고 모두 합쳐 1.5MB 이하다', () => {
    const dir = join(process.cwd(), 'public/guide');
    let total = 0;
    for (let i = 1; i <= 6; i++) {
      for (const name of [`${i}.webp`, `${i}-still.webp`]) {
        const p = join(dir, name);
        expect(existsSync(p), name).toBe(true);
        total += statSync(p).size;
      }
    }
    expect(total).toBeGreaterThan(10_000);
    expect(total).toBeLessThanOrEqual(1.5 * 1024 * 1024);
  });
});
