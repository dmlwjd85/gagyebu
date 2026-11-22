// 설명서 장면 촬영용. vite build 입력(index.html)에 없어 배포 번들에 안 들어감. 예시 숫자만 씀.
import '../style.css';
import '../fonts.css';
import { initTheme, currentTheme } from '../lib/theme.js';
import { applyLook, readLook, ensureFont } from '../lib/look.js';
import { applyScale } from '../lib/contentScale.js';
import { fitNums } from '../ui/util.js';
import { period, periodOf, shiftYm } from '../lib/dates.js';
import { filterPeriod, totals, trend, moneyWeather, monthBudgetLeft } from '../lib/stats.js';
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS } from '../lib/defaults.js';
import { topBar, homeView, calendarView, chartView, budgetView, settingsView } from '../ui/views.js';
import { symbol, FAB_INNER } from '../ui/brand.js';
import { resolveMode, settingsForMode } from '../lib/modes.js';
import { initSheet, openSheet, closeSheet, isSheetOpen } from '../ui/sheet.js';
import { dockHtml } from '../ui/dock.js';
import { DEFAULT_DOCK } from '../lib/dockSlots.js';
import { paydayChip } from '../lib/payday.js';
import { openReport } from '../ui/report.js';

localStorage.setItem('theme', 'light');
localStorage.setItem('btnSound', 'off');
localStorage.setItem('haptic', 'off');
initTheme();
applyScale(1);
const look = applyLook(readLook());
ensureFont(look.font);

const categories = DEFAULT_CATEGORIES;
const accounts = DEFAULT_ACCOUNTS;

function seedTxs({ salary = true, daily = true } = {}) {
  const out = [];
  const add = (id, date, amount, categoryId, memo, kind = 'expense', accountId = 'card') => {
    out.push({ id, date, amount, categoryId, memo, kind, accountId });
  };
  if (salary) add('sal', '2026-10-17', 3100000, 'salary', '월급', 'income', 'bank');
  if (daily) {
    add('r1', '2026-10-18', 550000, 'housing', '월세', 'expense', 'bank');
    add('r2', '2026-10-18', 12800, 'food', '점심');
    add('r3', '2026-10-19', 4500, 'cafe', '아메리카노');
    add('r4', '2026-10-19', 2900, 'transit', '지하철');
    add('r5', '2026-10-20', 13500, 'food', '저녁');
    add('r6', '2026-10-21', 8900, 'food', '점심');
    add('r7', '2026-10-22', 4200, 'cafe', '라떼');
    add('r8', '2026-10-23', 62000, 'living', '마트 장보기');
    add('r9', '2026-10-24', 14500, 'food', '저녁');
    add('r10', '2026-10-25', 69000, 'telecom', '휴대폰·OTT');
    add('r11', '2026-10-26', 11800, 'food', '점심');
    add('r12', '2026-10-28', 22000, 'culture', '영화');
    add('r13', '2026-10-30', 9800, 'food', '저녁');
    add('r14', '2026-11-02', 15200, 'food', '점심');
    add('r15', '2026-11-04', 4700, 'cafe', '빵·커피');
    add('r16', '2026-11-07', 38000, 'living', '생필품');
    add('r17', '2026-11-10', 12600, 'food', '저녁');
    add('r18', '2026-11-13', 2900, 'transit', '지하철');
    add('r19', '2026-11-15', 9900, 'food', '점심');
  }
  return out;
}

const budget = { total: 1800000, byCategory: { food: 350000, cafe: 60000, housing: 550000, living: 150000 } };

const st = {
  today: '2026-10-28',
  sd: 1,
  viewYm: null,
  screen: 'settings',
  txs: seedTxs({ salary: false, daily: false }),
  budgetOpen: true,
  startPicked: 1,
};

const ui = { catKind: 'expense', chartKind: 'expense', envelopes: true, catMenu: null, emojiFor: null, accEmojiFor: null, barYm: null, mode: 'cal', selDate: null };

function settingsOf() {
  const base = settingsForMode('single');
  return { ...base, monthStartDay: st.sd, features: { ...base.features, monthShare: true } };
}

function model() {
  const settings = settingsOf();
  const info = resolveMode(settings);
  const sd = st.sd;
  const today = st.today;
  const curYm = periodOf(today, sd);
  const viewYm = st.viewYm || curYm;
  const p = period(viewYm, sd);
  const txs = st.txs;
  const periodTxs = filterPeriod(txs, p);
  const tot = totals(periodTxs);
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftYm(curYm, -i));
  const tr = months.map((ym) => {
    const pt = totals(filterPeriod(txs, period(ym, sd)));
    return { ym, expense: pt.expense, income: pt.income, saved: pt.saved };
  });
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const accMap = new Map(accounts.map((a) => [a.id, a]));
  return {
    sd, today, curYm, viewYm, p, periodTxs, tot, txs,
    user: { displayName: '예시', email: 'example@gagyebu.invalid' },
    budget, txLoaded: true, budgetOpen: st.budgetOpen,
    categories, accounts, catMap, accMap,
    rules: [], recurring: [], goals: [], imports: [],
    assetAccounts: [], holdings: [], contributions: [], assetPrefs: null,
    weather: moneyWeather({ budget: budget.total, periodTxs, p, today }),
    monthLeft: monthBudgetLeft({ budget, periodTxs, categories }),
    trend: tr, streak: 3, noSpend: 2, insight: null,
    wide: false, dark: currentTheme() === 'dark', themeMode: 'light', look, offline: false, contentScale: 1, storedStart: sd,
    mode: info.mode, legacyMode: info.legacy, features: info.features, settings,
    install: 'standalone',
  };
}

const app = document.getElementById('app');
const finger = document.getElementById('guide-finger');
const captionEl = document.getElementById('guide-caption');

function bodyOf(m) {
  const screen = st.screen;
  if (screen === 'settings') return settingsView(m, ui);
  if (screen === 'calendar') return calendarView(m, { mode: ui.mode || 'cal', selDate: ui.selDate, ownerFilter: null });
  if (screen === 'chart') return chartView(m, ui);
  if (screen === 'budget') return budgetView(m, ui);
  return homeView(m);
}

function draw() {
  const m = model();
  const screen = st.screen;
  const nav = true;
  const payday = screen === 'home' && m.viewYm === m.curYm ? paydayChip(m.today, m.settings) : null;
  document.body.classList.add('has-frame');
  app.innerHTML = `
    <div class="aurora" aria-hidden="true"></div>
    <div class="app-frame has-nav">
      <div class="app-top"><div class="app-shell">${topBar(m, { month: screen !== 'settings', back: screen === 'settings' ? { to: 'home', label: '홈으로', text: '홈' } : null, payday })}</div></div>
      <main id="main" class="app-main" tabindex="-1"><div class="app-shell">${bodyOf(m)}</div></main>
      ${dockHtml({ view: screen === 'sheet' ? 'home' : screen, order: DEFAULT_DOCK, logo: `<div class="pclogo">${symbol('M', { cls: 'pcsym', label: '쨈 가계부' })}</div>`, mid: `<button class="fab" data-action="add" aria-label="기록 추가 (지출·수입)">${FAB_INNER}</button>` })}
    </div>`;
  fitNums(document);
}

initSheet({
  getState: () => model(),
  onSave(tx) {
    const id = tx.id || `n${st.txs.length + 1}`;
    st.txs = [...st.txs, { ...tx, id }];
    draw();
  },
  onDelete() {},
});

app.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-nav], [data-action], [data-start-day], [data-feat], [data-month]');
  if (!t) return;
  if (t.dataset.nav) {
    if (isSheetOpen()) closeSheet();
    st.screen = t.dataset.nav;
    if (st.screen === 'home') st.viewYm = null;
    draw();
    return;
  }
  if (t.dataset.action === 'add') {
    openSheet(null, { date: st.today });
    return;
  }
  if (t.dataset.action === 'report') {
    openReport(model(), { toast() {} });
    return;
  }
  if (t.dataset.startDay) {
    const n = Number(t.dataset.startDay);
    st.sd = n;
    st.startPicked = n;
    st.viewYm = null;
    draw();
    return;
  }
  if (t.dataset.month) {
    const d = Number(t.dataset.month);
    const m = model();
    if (d === 0) st.viewYm = m.curYm;
    else st.viewYm = shiftYm(m.viewYm, d);
    draw();
    return;
  }
  if (t.dataset.budgetToggle !== undefined) {
    st.budgetOpen = !st.budgetOpen;
    draw();
  }
});

function pointAt(sel, { offsetX = 0, offsetY = 0 } = {}) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) { finger.hidden = true; return null; }
  const r = el.getBoundingClientRect();
  const x = r.left + r.width * 0.55 + offsetX;
  const y = r.top + r.height * 0.55 + offsetY;
  finger.hidden = false;
  finger.style.left = `${x}px`;
  finger.style.top = `${y}px`;
  return { x, y, width: r.width, height: r.height };
}

function setCaption(text, pos = 'bottom') {
  if (!text) { captionEl.hidden = true; captionEl.textContent = ''; return; }
  captionEl.hidden = false;
  captionEl.textContent = text;
  captionEl.dataset.pos = pos;
}

function waitFonts() {
  return document.fonts?.ready ?? Promise.resolve();
}

async function ready() {
  await waitFonts();
  fitNums(document);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function applyPreset(name) {
  if (name === 's1') {
    st.today = '2026-10-16';
    st.sd = 1;
    st.viewYm = null;
    st.screen = 'settings';
    st.txs = seedTxs({ salary: false, daily: false });
  } else if (name === 's2') {
    st.today = '2026-10-17';
    st.sd = 17;
    st.viewYm = null;
    st.screen = 'home';
    st.txs = seedTxs({ salary: false, daily: false });
  } else if (name === 's3') {
    st.today = '2026-10-21';
    st.sd = 17;
    st.viewYm = null;
    st.screen = 'home';
    st.txs = seedTxs({ salary: true, daily: true }).filter((t) => t.date < '2026-10-21');
  } else if (name === 's4') {
    st.today = '2026-10-28';
    st.sd = 17;
    st.viewYm = null;
    st.screen = 'home';
    st.txs = seedTxs({ salary: true, daily: true });
    st.budgetOpen = true;
  } else if (name === 's5') {
    st.today = '2026-11-16';
    st.sd = 17;
    st.viewYm = null;
    st.screen = 'chart';
    st.txs = seedTxs({ salary: true, daily: true });
  } else if (name === 's6') {
    st.today = '2026-11-20';
    st.sd = 17;
    st.screen = 'home';
    st.txs = seedTxs({ salary: true, daily: true });
    st.viewYm = periodOf('2026-11-16', 17);
  }
  if (isSheetOpen()) closeSheet();
  const dlg = document.querySelector('.dlg-wrap');
  dlg?.remove();
  draw();
}

function scrollToSel(sel) {
  const el = document.querySelector(sel);
  el?.scrollIntoView({ block: 'center', inline: 'nearest' });
}

const style = document.createElement('style');
style.textContent = `
  #guide-finger { position: fixed; z-index: 200; width: 72px; height: 72px; margin: -14px 0 0 -14px; pointer-events: none; filter: drop-shadow(0 3px 6px rgba(0,0,0,.35)); }
  #guide-caption { position: fixed; left: 12px; right: 12px; z-index: 199; margin: 0; padding: 10px 14px; border-radius: 16px; background: rgba(22,24,48,.88); color: #fff; font-weight: 700; font-size: 15px; line-height: 1.35; text-align: center; word-break: keep-all; pointer-events: none; box-shadow: 0 6px 18px rgba(0,0,0,.22); }
  #guide-caption[data-pos="top"] { top: 8px; bottom: auto; }
  #guide-caption[data-pos="bottom"] { bottom: 92px; top: auto; }
  #guide-caption[data-pos="mid"] { bottom: 200px; top: auto; }
`;
document.head.append(style);

draw();
waitFonts().then(() => {
  fitNums(document);
  document.documentElement.dataset.shotReady = '1';
});

globalThis.__guide = {
  applyPreset, draw, model, pointAt, setCaption, ready, scrollToSel,
  openSheet: (tx, opts) => openSheet(tx, opts),
  closeSheet, isSheetOpen,
  state: st,
  click: (sel) => document.querySelector(sel)?.click(),
};
