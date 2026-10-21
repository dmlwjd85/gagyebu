// 스크린샷 전용. vite build 입력(index.html)에 없음.
import '../style.css';
import '../fonts.css';
import { initTheme, currentTheme } from '../lib/theme.js';
import { applyLook, writeLook, readLook, ensureFont, themeBannerHtml } from '../lib/look.js';
import { applyScale } from '../lib/contentScale.js';
import { fitNums } from '../ui/util.js';
import { period, periodOf } from '../lib/dates.js';
import { filterPeriod, totals, trend, moneyWeather } from '../lib/stats.js';
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS } from '../lib/defaults.js';
import { topBar, homeView, calendarView, chartView, budgetView, settingsView, onboardingView } from '../ui/views.js';
import { resolveMode, settingsForMode } from '../lib/modes.js';

const q = new URLSearchParams(location.search);
const screen = q.get('screen') || 'home';
const scale = Number(q.get('scale')) || 1;
localStorage.setItem('theme', q.get('dark') === '1' ? 'dark' : 'light');
initTheme();
applyScale(scale);
if (q.has('mood') || q.has('font') || q.has('decor')) {
  writeLook({
    mood: q.get('mood') || 'default',
    font: q.get('font') || 'pretendard',
    decor: q.get('decor') !== '0',
  });
}
const look = applyLook(readLook());
ensureFont(look.font);

const today = '2026-10-21';
const sd = 1;
const viewYm = periodOf(today, sd);
const p = period(viewYm, sd);
const txs = [
  { id: 'a', date: '2026-10-02', amount: 550000, kind: 'expense', categoryId: 'housing', memo: '월세', accountId: 'bank' },
  { id: 'b', date: '2026-10-05', amount: 13500, kind: 'expense', categoryId: 'telecom', memo: '넷플릭스', accountId: 'card' },
  { id: 'c', date: '2026-10-18', amount: 12800, kind: 'expense', categoryId: 'food', memo: '점심', accountId: 'card' },
  { id: 'd', date: '2026-10-20', amount: 4500, kind: 'expense', categoryId: 'cafe', memo: '아메리카노', accountId: 'card' },
  { id: 'e', date: '2026-10-21', amount: 8900, kind: 'expense', categoryId: 'food', memo: '저녁', accountId: 'card' },
  { id: 'f', date: '2026-10-01', amount: 3100000, kind: 'income', categoryId: 'salary', memo: '월급', accountId: 'bank' },
  { id: 'g', date: '2026-10-11', amount: 42000, kind: 'income', categoryId: 'side', memo: '중고', accountId: 'bank' },
];
const categories = DEFAULT_CATEGORIES;
const catMap = new Map(categories.map((c) => [c.id, c]));
const accounts = DEFAULT_ACCOUNTS;
const mode = q.get('mode');
if (mode === 'couple') {
  txs[0].owner = '공동';
  txs[2].owner = '배우자';
  txs.push({ id: 'h', date: '2026-10-03', amount: 2400000, kind: 'income', categoryId: 'salary', memo: '월급', accountId: 'bank', owner: '배우자' });
  txs.push({ id: 'i', date: '2026-10-16', amount: 32000, kind: 'expense', categoryId: 'living', memo: '장보기', accountId: 'card', owner: '공동' });
}
const periodTxs = filterPeriod(txs, p);
const tot = totals(periodTxs);
const budget = { total: 1500000, byCategory: { food: 300000, cafe: 50000, housing: 600000 } };
const m = {
  sd, today, curYm: viewYm, viewYm, p, periodTxs, tot,
  user: { displayName: '초', email: 'cho@example.com' },
  budget, txLoaded: true,
  categories, accounts,
  rules: [], recurring: [{ id: 'r1', name: '월세', amount: 550000, kind: 'expense', categoryId: 'housing', dayOfMonth: 2, active: true, startYm: '2026-10' }],
  goals: [{ id: 'g1', name: '비상금', emoji: '🐷', target: 500000, saved: 120000 }],
  imports: [], txs,
  assetAccounts: [], holdings: [], contributions: [], assetPrefs: null,
  catMap, accMap: new Map(accounts.map((a) => [a.id, a])),
  weather: moneyWeather({ budget: budget.total, periodTxs, p, today }),
  trend: trend(txs, [0].map(() => p)),
  streak: 2, noSpend: 4, insight: null,
  wide: false, dark: currentTheme() === 'dark', themeMode: q.get('dark') === '1' ? 'dark' : 'light', look, offline: false, contentScale: scale, storedStart: sd,
};
const settings = (mode === 'single' || mode === 'student' || mode === 'couple')
  ? { ...settingsForMode(mode), allowanceAmount: 800000, allowanceCycle: 'month', allowanceDay: 1, ...(mode === 'couple' ? { spouseName: '민지', splitMe: 60 } : {}) }
  : null;
const info = resolveMode(settings);
m.mode = info.mode;
m.legacyMode = info.legacy;
m.features = info.features;
m.settings = settings;
if (mode === 'student') {
  m.categories = [...categories, { id: 'part-time', emoji: '💼', name: '알바', kind: 'income', order: 20 }, { id: 'errand', emoji: '🛵', name: '심부름', kind: 'income', order: 21 }];
  m.catMap = new Map(m.categories.map((c) => [c.id, c]));
}
// 6개월 추이 막대는 점이 있어야 함
m.trend = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((ym) => ({ ym, expense: ym === '2026-10' ? tot.expense : 400000, income: ym === '2026-10' ? tot.income : 3100000, saved: 100000 }));

const ui = { catKind: 'expense', chartKind: 'expense', envelopes: true, catMenu: null, emojiFor: null, accEmojiFor: null, barYm: null };
const nav = screen === 'home';
const body = screen === 'onboard' ? onboardingView() : ({
  home: () => homeView(m),
  settings: () => settingsView(m, ui),
  budget: () => budgetView(m, ui),
  chart: () => chartView(m, ui),
  list: () => calendarView(m, { mode: 'list', ownerFilter: q.get('who') || null }),
}[screen]?.() ?? homeView(m));

document.body.classList.add('has-frame');
document.getElementById('app').innerHTML = `
  <div class="aurora" aria-hidden="true"></div>
  <div class="app-frame ${nav ? 'has-nav' : ''}">
    <div class="app-top"><div class="app-shell">${topBar(m, { month: screen !== 'settings' })}</div></div>
    <main id="main" class="app-main ${nav ? '' : 'no-nav'}" tabindex="-1"><div class="app-shell">${screen === 'home' ? '' : themeBannerHtml(look)}${body}</div></main>
    ${nav ? `<nav class="tabbar" aria-label="주요 화면"><button class="tab on"><span>🏠</span><span>홈</span></button><button class="tab"><span>📅</span><span>달력</span></button><button class="fab" aria-label="새 기록 추가"><span>＋</span></button><button class="tab"><span>📊</span><span>차트</span></button><button class="tab"><span>💰</span><span>예산</span></button></nav>` : ''}
  </div>`;
fitNums(document);
document.fonts?.ready?.then(() => fitNums(document));
document.documentElement.dataset.shotReady = '1';
