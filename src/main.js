import './style.css';
import { isFirebaseConfigured, useEmulator } from './config.js';
import { initTheme, toggleTheme, currentTheme, themeMode, setThemeMode } from './lib/theme.js';
// Firebase SDK는 설정이 있을 때만 나눠서 불러옴
let data = null;
let state = { ready: false, user: null, txs: [], categories: [], accounts: [] };
import { ymd, period, periodOf, shiftYm, monthLabel } from './lib/dates.js';
import { filterPeriod, totals, trend, moneyWeather, recordStreak, noSpendDays, topIncrease } from './lib/stats.js';
import { formatWon } from './lib/money.js';
import { toCSV } from './lib/csv.js';
import { nextTip, dismissTip, emptyTipState } from './lib/tips.js';
import { validateCategory } from './lib/validate.js';
import { $, esc, toast, confirmDialog, promptAmount, rollNumber, haptic } from './ui/util.js';
import { initSheet, openSheet, isSheetOpen } from './ui/sheet.js';
import { topBar, homeView, calendarView, chartView, budgetView, settingsView, loginView, setupView } from './ui/views.js';

initTheme();
const app = $('#app');
const TABS = [['home', '🏠', '홈'], ['calendar', '📅', '달력'], ['chart', '📊', '차트'], ['budget', '💰', '예산']];
const VIEWS = ['home', 'calendar', 'chart', 'budget', 'settings'];
const hashView = () => (VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
const ui = { view: hashView(), viewYm: null, selDate: null, mode: 'cal', catFilter: null, envelopes: false, catKind: 'expense', emojiFor: null, catMenu: null, chartKind: 'expense', barYm: null, accEmojiFor: null, loginError: '' };
const today = () => ymd(new Date());

function model() {
  const sd = state.profile?.monthStartDay ?? 1;
  const t = today();
  const curYm = periodOf(t, sd);
  const viewYm = ui.viewYm ?? curYm;
  const p = period(viewYm, sd);
  const periodTxs = filterPeriod(state.txs, p);
  const tot = totals(periodTxs);
  const prevTxs = filterPeriod(state.txs, period(shiftYm(viewYm, -1), sd));
  return {
    sd, today: t, curYm, viewYm, p, periodTxs, tot, user: state.user, budget: state.budget, txLoaded: state.txLoaded,
    categories: state.categories, accounts: state.accounts,
    catMap: new Map(state.categories.map((c) => [c.id, c])), accMap: new Map(state.accounts.map((a) => [a.id, a])),
    weather: moneyWeather({ budget: state.budget?.total ?? 0, periodTxs, p, today: t }),
    trend: trend(state.txs, [-5, -4, -3, -2, -1, 0].map((d) => period(shiftYm(viewYm, d), sd))),
    streak: recordStreak(state.txs.map((x) => x.date), t),
    noSpend: viewYm === curYm ? noSpendDays(periodTxs, p, t) : 0,
    insight: topIncrease(periodTxs, prevTxs),
    wide: window.matchMedia('(min-width: 1024px)').matches, dark: currentTheme() === 'dark', themeMode: themeMode(), offline: !navigator.onLine,
  };
}

// ── 렌더 ───────────────────────────────────────────
let lastHero = null, lastView = null;
// 로그인·설정 안내: 첫 화면(index.html)의 브랜드 카드는 그대로 두고 아래 카드만 바꿈 → 화면 깜빡임·LCP 지연 없음
function gateView({ caption, card }) {
  const hero = $('#boot-hero');
  if (!hero) app.innerHTML = `<main class="min-h-dvh flex justify-center px-5 pt-[12vh] pb-10"><div class="w-full max-w-sm flex flex-col gap-4">
    <section class="hero-card p-6" id="boot-hero"><p class="text-caption font-semibold" id="boot-cap"></p><h1 class="mt-2 text-display">쓱 가계부</h1>
      <p class="mt-3 text-body">10초 기록, 하루 한 번 보는 내 돈 날씨.</p></section><section class="card-solid p-5 flex flex-col gap-3" id="boot-card"></section></div></main>`;
  $('#boot-cap').textContent = caption;
  $('#boot-card').innerHTML = card;
  $('main', app)?.removeAttribute('aria-busy');
}
function render() {
  if (!isFirebaseConfigured) return gateView(setupView());
  if (!state.ready) return; // index.html 의 첫 화면(브랜드 카드)을 그대로 둠
  if (!state.user) return gateView(loginView({ emulator: useEmulator, error: ui.loginError }));
  const m = model();
  data.watchMonth(m.viewYm);
  const focusKey = document.activeElement?.dataset && Object.entries(document.activeElement.dataset)[0];
  const scrollY = window.scrollY;
  const body = { home: homeView, calendar: calendarView, chart: chartView, budget: budgetView, settings: settingsView }[ui.view](m, ui);
  app.innerHTML = `
    <div class="aurora" aria-hidden="true"></div>
    <a href="#main" class="skip-link">본문으로 건너뛰기</a>
    <div class="app-shell ${ui.view === 'settings' ? '' : 'has-nav'}">
      ${topBar(m)}
      <main id="main" class="mt-3 pb-[124px] ${ui.view !== lastView ? 'view-enter' : ''}" tabindex="-1">${body}</main>
    </div>
    ${ui.view === 'settings' ? '' : tabBar()}
    <div id="tip-slot"></div>`;
  // 홈 숫자 롤링
  const hero = $('#hero-num');
  if (hero) { const to = Number(hero.dataset.target); rollNumber(hero, to, formatWon, lastHero ?? 0); lastHero = to; }
  if (focusKey) { const el = app.querySelector(`[data-${focusKey[0].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${CSS.escape(focusKey[1])}"]`); el?.focus({ preventScroll: true }); }
  window.scrollTo(0, scrollY);
  lastView = ui.view;
  renderTip();
}
const tabBar = () => `<nav class="tabbar" aria-label="주요 화면">
  ${TABS.slice(0, 2).map(tabBtn).join('')}
  <button class="fab" data-action="add" aria-label="새 기록 추가 (지출·수입)"><span aria-hidden="true">＋</span></button>
  ${TABS.slice(2).map(tabBtn).join('')}</nav>`;
const tabBtn = ([id, icon, label]) => `<button class="tab ${ui.view === id ? 'on' : ''}" data-nav="${id}" ${ui.view === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span><span>${label}</span></button>`;

// ── 구석 팁 ─────────────────────────────────────────
const tipState = () => { try { return JSON.parse(localStorage.getItem('tips')) ?? emptyTipState(); } catch { return emptyTipState(); } };
const saveTipState = (s) => localStorage.setItem('tips', JSON.stringify(s));
let currentTip = null, tipCollapsed = false, tipTimer;
function pickTip() {
  const r = nextTip(tipState(), today());
  saveTipState(r.state);
  currentTip = r.tip ? { text: r.tip, index: r.index } : null;
  tipCollapsed = false;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { tipCollapsed = true; renderTip(); }, 8000);
}
function renderTip() {
  const slot = $('#tip-slot');
  if (!slot) return;
  if (ui.view !== 'home' || !currentTip || isSheetOpen()) { slot.innerHTML = ''; return; }
  slot.innerHTML = `<div class="tip ${tipCollapsed ? 'collapsed' : ''}" aria-live="polite">
    ${tipCollapsed ? `<button class="tip-mini" data-tip-open aria-label="팁 보기">💡</button>`
      : `<span aria-hidden="true">💡</span><p class="flex-1">${esc(currentTip.text)}</p><button class="tip-x" data-tip-close aria-label="팁 닫기 (오늘 하루 숨김)">✕</button>`}</div>`;
}

// ── 동작 ───────────────────────────────────────────
function onSave(tx) {
  const isEdit = !!tx.id;
  const before = isEdit ? state.txs.find((t) => t.id === tx.id) : null;
  const id = data.saveTx(tx);
  const c = state.categories.find((x) => x.id === tx.categoryId);
  setTimeout(() => {
    const m = model();
    const extra = tx.kind === 'expense' && m.weather.hasBudget && tx.date === m.today ? ` 오늘 쓸 돈 ${formatWon(m.weather.available)}` : '';
    toast(`${c?.name ?? ''} ${formatWon(tx.amount)} ${isEdit ? '고쳤어요.' : '기록!'}${extra}`, {
      action: '되돌리기', onAction: () => (before ? data.restoreTx(before) : data.deleteTx(id)),
    });
  }, 50);
}
function onDelete(id) {
  const before = state.txs.find((t) => t.id === id);
  data.deleteTx(id);
  toast('삭제했어요.', { action: '되돌리기', onAction: () => before && data.restoreTx(before) });
}
function download(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function go(view, extra = {}) {
  Object.assign(ui, { view, emojiFor: null }, extra);
  history.replaceState(null, '', view === 'home' ? location.pathname : `#${view}`);
  render();
  $('#main')?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function editBudget(m) {
  const v = await promptAmount({ title: `${monthLabel(m.viewYm, m.sd)} 예산`, body: '한 달 동안 쓸 총액을 정해 주세요. 0원이면 예산을 끕니다.', value: m.budget?.total ?? 0 });
  if (v == null) return;
  data.setBudget(m.viewYm, v, state.budget?.byCategory);
  toast(v ? `예산을 ${formatWon(v)}으로 정했어요.` : '예산을 껐어요.');
}

app.addEventListener('click', async (e) => {
  const bar = e.target.closest('[data-bar]');
  if (bar) { ui.barYm = bar.dataset.bar; return render(); }
  const t = e.target.closest('button, [data-tx]');
  if (!t || t.disabled) return;
  const d = t.dataset;
  const m = state.user ? model() : null;
  if (d.nav) return go(d.nav, d.mode ? { mode: d.mode, catFilter: null } : {});
  if (d.tx) { const tx = state.txs.find((x) => x.id === d.tx); return tx && openSheet(tx); }
  if (d.month) {
    const delta = Number(d.month);
    ui.viewYm = delta === 0 ? null : shiftYm(m.viewYm, delta);
    if (ui.viewYm && ui.viewYm >= m.curYm) ui.viewYm = null;
    ui.selDate = null;
    return render();
  }
  if (d.date) { ui.selDate = ui.selDate === d.date ? null : d.date; return render(); }
  if (d.addOn) return openSheet(null, { date: d.addOn });
  if (d.mode) { ui.mode = d.mode; return render(); }
  if (d.clearFilter !== undefined) { ui.catFilter = null; return render(); }
  if (d.filterCat) return go('calendar', { mode: 'list', catFilter: d.filterCat });
  if (d.theme) { setThemeMode(d.theme); return render(); }
  if (d.catKind) { ui.catKind = d.catKind; ui.emojiFor = null; return render(); }
  if (d.accEmoji) { ui.accEmojiFor = ui.accEmojiFor === d.accEmoji ? null : d.accEmoji; return render(); }
  if (d.accPick) { const a = state.accounts.find((x) => x.id === ui.accEmojiFor); ui.accEmojiFor = null; if (a) data.saveAccount({ ...a, emoji: d.accPick }); return render(); }
  if (d.accDel) {
    const a = state.accounts.find((x) => x.id === d.accDel);
    if (!a || !(await confirmDialog({ title: `'${a.name}' 결제수단을 지울까요?`, body: '이미 남긴 기록은 지워지지 않아요.', ok: '지우기', danger: true }))) return;
    data.deleteAccount(a.id); if (localStorage.getItem('lastAccount') === a.id) localStorage.removeItem('lastAccount');
    return toast('지웠어요.', { action: '되돌리기', onAction: () => data.saveAccount(a) });
  }
  if (d.chartKind) { ui.chartKind = d.chartKind; return render(); }
  if (d.catMenu) { ui.catMenu = ui.catMenu === d.catMenu ? null : d.catMenu; ui.emojiFor = null; return render(); }
  if (d.emojiFor) { ui.emojiFor = ui.emojiFor === d.emojiFor ? null : d.emojiFor; return render(); }
  if (d.pick) { const c = state.categories.find((x) => x.id === ui.emojiFor); ui.emojiFor = null; if (c) data.saveCategory({ ...c, emoji: d.pick }); return render(); }
  if (d.move) {
    const list = state.categories.filter((c) => c.kind === ui.catKind);
    const i = list.findIndex((c) => c.id === d.move), j = i + Number(d.dir);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    return data.reorderCategories(list);
  }
  if (d.archive) { const c = state.categories.find((x) => x.id === d.archive); return c && data.saveCategory({ ...c, archived: !c.archived }); }
  if (d.delcat) {
    const c = state.categories.find((x) => x.id === d.delcat);
    if (!c || !(await confirmDialog({ title: `'${c.name}' 카테고리를 지울까요?`, body: '이 카테고리의 기록은 기타로 옮겨져요.', ok: '지우기', danger: true }))) return;
    try { const n = await data.deleteCategory(c); toast(n ? `지웠어요. 기록 ${n}개는 기타로 옮겼어요.` : '지웠어요.'); }
    catch (err) { toast(err.message || '지우지 못했어요. 인터넷 연결을 확인해 주세요.'); }
    return;
  }
  if (d.env) {
    const c = state.categories.find((x) => x.id === d.env);
    const cur = state.budget?.byCategory?.[d.env] ?? 0;
    const v = await promptAmount({ title: `${c.emoji} ${c.name} 한도`, body: '0원이면 한도를 없앱니다.', value: cur });
    if (v == null) return;
    const by = { ...(state.budget?.byCategory ?? {}) };
    v ? (by[d.env] = v) : delete by[d.env];
    return data.setBudget(m.viewYm, state.budget?.total ?? 0, by);
  }
  if (d.tipClose !== undefined) { saveTipState(dismissTip(tipState(), currentTip.index, today())); currentTip = null; return renderTip(); }
  if (d.tipOpen !== undefined) { tipCollapsed = false; return renderTip(); }
  switch (d.action) {
    case 'add': haptic(); return openSheet();
    case 'theme': toggleTheme(); return render();
    case 'budget': return editBudget(m);
    case 'login':
      ui.loginError = '';
      try { await data.login(); } catch (err) { ui.loginError = '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.'; console.error(err); render(); }
      return;
    case 'login-test': return data.loginTestUser();
    case 'logout': if (await confirmDialog({ title: '로그아웃할까요?', body: '기록은 그대로 있어요.', ok: '로그아웃' })) { await data.logout(); ui.view = 'home'; } return;
    case 'tips-reset': localStorage.removeItem('tips'); pickTip(); return toast('팁을 처음부터 다시 보여 드릴게요.');
    case 'csv-month': return download(`쓱가계부_${m.viewYm}.csv`, toCSV(m.periodTxs, state));
    case 'csv-all':
      try { download(`쓱가계부_전체_${m.today}.csv`, toCSV(await data.allTransactions(), state)); }
      catch { toast('내보내지 못했어요. 인터넷 연결을 확인해 주세요.'); }
      return;
    case 'add-acc': {
      const id = data.saveAccount({ name: '새 결제수단', emoji: '💳', type: 'card', order: state.accounts.length });
      setTimeout(() => { const el = app.querySelector(`[data-acc-name="${CSS.escape(id)}"]`); el?.focus(); el?.select(); }, 60);
      return;
    }
    case 'add-cat': {
      const list = state.categories.filter((c) => c.kind === ui.catKind);
      const id = data.saveCategory({ name: '새 카테고리', emoji: ui.catKind === 'income' ? '💸' : '🌱', kind: ui.catKind, order: list.length });
      setTimeout(() => { const el = app.querySelector(`[data-name-for="${CSS.escape(id)}"]`); el?.focus(); el?.select(); }, 60);
      return;
    }
    case 'json-all':
      try {
        const txs = await data.allTransactions();
        const strip = ({ createdAt, updatedAt, ...r }) => r;
        download(`쓱가계부_백업_${m.today}.json`, JSON.stringify({ app: 'gagyebu', version: 1, exportedAt: new Date().toISOString(), profile: { monthStartDay: m.sd }, categories: state.categories, accounts: state.accounts, transactions: txs.map(strip) }, null, 2), 'application/json');
      } catch { toast('백업하지 못했어요. 인터넷 연결을 확인해 주세요.'); }
      return;
    case 'delete-all':
      if (!(await confirmDialog({ title: '정말 모두 지울까요?', body: '모든 기록·카테고리·예산과 계정이 지워지고 되돌릴 수 없어요. 먼저 CSV로 내보내 두면 안심이에요.', ok: '삭제', danger: true, typeToConfirm: '삭제' }))) return;
      try { const r = await data.deleteEverything(); toast(r === 'deleted' ? '모두 지웠어요.' : '기록을 지웠어요. 계정 삭제는 다시 로그인한 뒤 해 주세요.'); }
      catch { toast('지우지 못했어요. 인터넷 연결을 확인해 주세요.'); }
  }
});

app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.nameFor) {
    const c = state.categories.find((x) => x.id === t.dataset.nameFor);
    const err = validateCategory({ name: t.value, emoji: c?.emoji });
    if (err) { toast(err); t.value = c?.name ?? ''; return; }
    if (c && c.name !== t.value.trim()) data.saveCategory({ ...c, name: t.value });
  }
  if (t.dataset.accName) {
    const a = state.accounts.find((x) => x.id === t.dataset.accName), name = t.value.trim();
    if (!name || name.length > 20) { toast('이름은 1~20자로 적어 주세요.'); t.value = a?.name ?? ''; return; }
    if (/\d{4}[- ]?\d{4}/.test(name)) { toast('카드·계좌 번호는 저장하지 않아요. 이름만 적어 주세요.'); t.value = a?.name ?? ''; return; }
    if (a && a.name !== name) data.saveAccount({ ...a, name });
  }
  if (t.dataset.accType) { const a = state.accounts.find((x) => x.id === t.dataset.accType); if (a) data.saveAccount({ ...a, type: t.value }); }
  if (t.dataset.startDay !== undefined) { data.setProfile({ monthStartDay: Number(t.value) }); ui.viewYm = null; toast(`한 달 시작일을 ${t.value}일로 바꿨어요.`); }
  if (t.dataset.haptic !== undefined) localStorage.setItem('haptic', t.checked ? 'on' : 'off');
  if (t.dataset.toggleEnv !== undefined) { ui.envelopes = t.checked; if (!t.checked && state.budget?.byCategory) data.setBudget(model().viewYm, state.budget.total ?? 0, undefined); render(); }
});
app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.target.dataset?.nameFor || e.target.dataset?.accName)) e.target.blur();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.bar) { e.preventDefault(); ui.barYm = e.target.dataset.bar; render(); }
});
window.matchMedia('(min-width: 1024px)').addEventListener?.('change', () => state.user && render());
document.addEventListener('keydown', (e) => {
  if (!state.user || isSheetOpen() || e.target.matches('input,select,textarea') || document.querySelector('[role=alertdialog],[role=dialog]:not(.sheet)')) return;
  if ((e.key === 'n' || e.key === '+') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openSheet(); }
});

window.addEventListener('online', render);
window.addEventListener('hashchange', () => { if (hashView() !== ui.view) go(hashView()); });
window.addEventListener('offline', () => { render(); toast('☁️ 인터넷이 끊겼어요. 기록은 저장해 두고, 연결되면 자동으로 올릴게요.', { duration: 5000 }); });
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => state.user && render());

// 거래 밀어서 지우기 (왼쪽으로 40% 이상 밀면 삭제 + 되돌리기). 키보드·스크린리더는 거래를 눌러 시트의 🗑️ 사용
let swipe = null, swipedAt = 0;
app.addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.tx-row');
  if (!row || e.button) return;
  swipe = { row, x: e.clientX, y: e.clientY, dx: 0, active: false, id: e.pointerId };
});
app.addEventListener('pointermove', (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (!swipe.active) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
    if (dx < -10 && Math.abs(dx) > Math.abs(dy)) { swipe.active = true; swipe.row.setPointerCapture?.(e.pointerId); swipe.row.classList.add('swiping'); }
    else return;
  }
  swipe.dx = Math.min(0, dx);
  swipe.row.style.transform = `translateX(${swipe.dx}px)`;
  swipe.row.parentElement.classList.toggle('swipe-ready', -swipe.dx > swipe.row.offsetWidth * 0.4);
});
const endSwipe = () => {
  if (!swipe) return;
  const { row, dx, active } = swipe; swipe = null;
  if (!active) return;
  swipedAt = Date.now();
  row.classList.remove('swiping');
  if (-dx > row.offsetWidth * 0.4) { row.style.transform = 'translateX(-110%)'; haptic(12); setTimeout(() => onDelete(row.dataset.tx), 160); }
  else { row.style.transform = ''; row.parentElement.classList.remove('swipe-ready'); }
};
app.addEventListener('pointerup', endSwipe);
app.addEventListener('pointercancel', endSwipe);
app.addEventListener('click', (e) => { if (Date.now() - swipedAt < 300 && e.target.closest('.tx-row')) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

// 렌더 묶기(스냅샷이 연달아 올 때 한 번만)
let raf = 0;
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (!isSheetOpen() || ui.view) render(); }); };

if (isFirebaseConfigured) {
  data = await import('./data.js');
  state = data.state;
  initSheet({ getState: () => state, onSave, onDelete });
  data.onWriteError((e) => toast(e?.code === 'permission-denied' ? '저장 권한이 없어요. 다시 로그인해 주세요.' : '저장하지 못했어요. 잠시 후 다시 시도해 주세요.'));
  data.subscribe(schedule);
  data.initAuth();
  pickTip();
}
render();

// 에뮬레이터 전용 데모 데이터 (스크린샷·수동 검증용)
if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  window.__gagyebu = { state, data, ui, render, openSheet, go,
    async seedDemo() {
      const { demoTransactions } = await import('./dev/demo.js');
      const m = model();
      data.setBudget(m.curYm, 1_500_000);
      await data.saveTxBatch(demoTransactions(m.today));
    } };
}
