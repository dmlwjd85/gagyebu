import './style.css';
import { isFirebaseConfigured, useEmulator } from './config.js';
import { initTheme, toggleTheme, currentTheme, themeMode, setThemeMode } from './lib/theme.js';
import { initLook, readLook, writeLook, applyLook, ensureFont, adoptCloudLook, toneList } from './lib/look.js';
import { readScale, saveScale, applyScale, stepScale, scalePct, clampScale, SCALE_KEY, SCALE_MIN, SCALE_MAX } from './lib/contentScale.js';
import { installScaleShortcuts } from './lib/scaleShortcuts.js';
// Firebase SDK는 설정이 있을 때만 나눠서 불러옴
let data = null;
let state = { ready: false, user: null, txs: [], categories: [], accounts: [], rules: [], recurring: [], goals: [], assetAccounts: [], holdings: [], contributions: [], assetPrefs: null };
import { ymd, period, periodOf, shiftYm, monthLabel, isYmd } from './lib/dates.js';
import { filterPeriod, totals, trend, moneyWeather, recordStreak, noSpendDays, topIncrease } from './lib/stats.js';
import { formatWon } from './lib/money.js';
import { toCSV } from './lib/csv.js';
import { nextTip, dismissTip, emptyTipState } from './lib/tips.js';
import { validateCategory } from './lib/validate.js';
import { $, esc, toast, confirmDialog, promptAmount, formDialog, rollNumber, haptic, fitNums, bindModalHistory, dismissTopModal, hasModal } from './ui/util.js';
import { createExitGuard, EXIT_CONFIRM_TITLE, isExitDismissGesture } from './lib/exitGuard.js';
import { createNavHistory } from './lib/navBack.js';
// 가져오기(표 읽기·열 맞춤·중복)와 리포트 이미지는 쓸 때만 불러옴 → 첫 화면 JS를 가볍게
let IMP = null;
const loadImp = () => import('./ui/importer.js').then((mod) => (IMP = mod));
import { searchView, recurringView } from './ui/m2views.js';
import { ruleSuggestion, josa, classify } from './lib/classify.js';
import { buildBackup, parseBackup } from './lib/backup.js';
import { settingsForMode, MODES, LEGACY_FEATURES, allowanceFrom, effectiveStartDay } from './lib/modes.js';
import { ownerToWrite, spouseLabel } from './lib/couple.js';
import { installUpdatePrompt } from './lib/pwaUpdate.js';
import { restoreMessage } from './lib/restoreWait.js';
import { pruneLimits } from './lib/budget.js';
import { validateGoal } from './lib/goals.js';
import { initSheet, openSheet, closeSheet, isSheetOpen } from './ui/sheet.js';
import { logo, symbol } from './ui/brand.js';
import { topBar, homeView, calendarView, chartView, budgetView, settingsView, loginView, setupView, onboardingView } from './ui/views.js';
import { assetsView, taxView } from './ui/assetsView.js';
import { validateAssetAccount, validateHolding, validateContribution, validateTaxPrefs, parseQtyE4, normalizeCode, taxPrefs, formatQty, formatRateBp, parseRateBp } from './lib/assets.js';

initTheme();
initLook();
installUpdatePrompt();
// 본문 글자 배율: 저장값을 그리기 전에 적용(깜빡임 없음)
let contentScale = applyScale(readScale());
const app = $('#app');
const TABS = [['home', '🏠', '홈'], ['calendar', '📅', '달력'], ['chart', '📊', '차트'], ['budget', '💰', '예산']];
const VIEWS = ['home', 'calendar', 'chart', 'budget', 'settings', 'import', 'search', 'recurring', 'assets', 'tax'];
// 아래 탭은 홈·달력·차트·예산과 기록 버튼만. 설정·검색·가져오기·반복·자산·세액공제는
// 그 위의 화면이라 탭을 숨긴다(긴 설정이 탭·기록 버튼에 가리지 않게). 나가는 길은 헤더의 홈/뒤로.
const NO_NAV = new Set(['settings', 'import', 'search', 'recurring', 'assets', 'tax']);
const headerBack = (view) => (view === 'settings' ? { to: 'home', label: '홈으로', text: '홈' } : null);
const hashView = () => (VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
const ui = { view: hashView(), viewYm: null, selDate: null, mode: 'cal', catFilter: null, ownerFilter: null, envelopes: false, catKind: 'expense', emojiFor: null, catMenu: null, chartKind: 'expense', barYm: null, accEmojiFor: null, loginError: '', imp: null, assetOpen: null, search: { q: '', kind: '', categoryId: '', accountId: '', range: '6', min: null, max: null }, searchAll: null };
const today = () => ymd(new Date());

function model() {
  const storedStart = state.profile?.monthStartDay ?? 1;
  const sd = effectiveStartDay(storedStart, state.features);
  const t = today();
  const curYm = periodOf(t, sd);
  const viewYm = ui.viewYm ?? curYm;
  const p = period(viewYm, sd);
  const periodTxs = filterPeriod(state.txs, p);
  const tot = totals(periodTxs);
  const prevTxs = filterPeriod(state.txs, period(shiftYm(viewYm, -1), sd));
  return {
    sd, storedStart, today: t, curYm, viewYm, p, periodTxs, tot, user: state.user, budget: state.budget, txLoaded: state.txLoaded,
    categories: state.categories, accounts: state.accounts, rules: state.rules, recurring: state.recurring, goals: state.goals, imports: state.imports, txs: state.txs,
    assetAccounts: state.assetAccounts ?? [], holdings: state.holdings ?? [], contributions: state.contributions ?? [], assetPrefs: state.assetPrefs ?? null,
    searchPool: ui.searchAll ?? state.txs, searchLoading: ui.view === 'search' && !ui.searchAll,
    catMap: new Map(state.categories.map((c) => [c.id, c])), accMap: new Map(state.accounts.map((a) => [a.id, a])),
    weather: moneyWeather({ budget: state.budget?.total ?? 0, periodTxs, p, today: t }),
    trend: trend(state.txs, [-5, -4, -3, -2, -1, 0].map((d) => period(shiftYm(viewYm, d), sd))),
    streak: recordStreak(state.txs.map((x) => x.date), t),
    noSpend: viewYm === curYm ? noSpendDays(periodTxs, p, t) : 0,
    insight: topIncrease(periodTxs, prevTxs),
    wide: window.matchMedia('(min-width: 1024px)').matches, dark: currentTheme() === 'dark', themeMode: themeMode(), look: readLook(), offline: !navigator.onLine, contentScale,
    mode: state.mode ?? null, legacyMode: state.legacyMode !== false && !state.mode, features: state.features, settings: state.settings ?? null,
  };
}

// ── 렌더 ───────────────────────────────────────────
let lastHero = null, lastView = null;
// 로그인·설정 안내: 첫 화면(index.html)의 브랜드 카드는 그대로 두고 아래 카드만 바꿈 → 화면 깜빡임·LCP 지연 없음
function gateView({ caption, card }) {
  document.body.classList.remove('has-frame');
  const hero = $('#boot-hero');
  if (!hero) app.innerHTML = `<main class="min-h-dvh flex justify-center px-5 pt-[12vh] pb-10"><div class="w-full max-w-sm flex flex-col gap-4">
    <h1 class="flex justify-center" id="boot-logo">${logo({ cls: 'boot-logo' })}</h1>
    <section class="hero-card p-6" id="boot-hero"><p class="text-caption font-semibold" id="boot-cap"></p><p class="mt-2 text-title">10초 기록,<br />하루 한 번 보는 내 돈 날씨.</p></section>
    <section class="card-solid p-5 flex flex-col gap-3" id="boot-card"></section></div></main>`;
  $('#boot-cap').textContent = caption;
  $('#boot-card').innerHTML = card;
  $('main', app)?.removeAttribute('aria-busy');
}
function pushLook(partial) {
  const next = applyLook(writeLook({ ...readLook(), ...partial }));
  ensureFont(next.font)?.then?.(() => { if ($('#main')) fitNums(); });
  if (state.user && data?.saveSettings) {
    const patch = { mood: next.mood, font: next.font, decor: next.decor, tone: toneList(next.tone) };
    if (state.settings) state.settings = { ...state.settings, ...patch };
    data.saveSettings(patch);
  }
  render();
}
function render() {
  if (state.user && state.settingsLoaded) adoptCloudLook(state.settings);
  if (redirectDone) exitGuard.sync({ loggedIn: !!state.user });
  if (!isFirebaseConfigured) return gateView(setupView());
  if (!state.ready) return; // index.html 의 첫 화면(브랜드 카드)을 그대로 둠
  if (!state.user) return gateView(loginView({ emulator: useEmulator, error: ui.loginError }));
  const m = model();
  data.watchMonth(m.viewYm);
  const focusKey = document.activeElement?.dataset && Object.entries(document.activeElement.dataset)[0];
  const scrollY = $('#main') ? scroller().scrollTop : 0;
  const mainFocused = document.activeElement?.id === 'main'; // 다시 그려도 본문 포커스 유지(PageDown·스페이스 스크롤)
  if (ui.view === 'import' && !IMP) loadImp().then(render);
  if (ui.view === 'import' && IMP && !ui.imp) ui.imp = IMP.newImport();
  const ask = !!(state.askMode && state.settingsLoaded && ui.view === 'home');
  const body = ask ? onboardingView() : ui.view === 'import' ? (IMP ? IMP.importView(m, ui.imp) : '<div class="max-w-[560px] mx-auto card-solid p-5" aria-busy="true"><div class="skeleton h-40 rounded-lg"></div></div>')
    : { home: homeView, calendar: calendarView, chart: chartView, budget: budgetView, settings: settingsView, search: searchView, recurring: recurringView, assets: assetsView, tax: taxView }[ui.view](m, ui);
  const nav = !ask && !NO_NAV.has(ui.view);
  // 위 메뉴 / 본문(여기만 스크롤, 글자 배율 적용) / 아래 메뉴 3줄 틀 — style.css '.app-frame'
  document.body.classList.add('has-frame');
  app.innerHTML = `
    <div class="aurora" aria-hidden="true"></div>
    <a href="#main" class="skip-link">본문으로 건너뛰기</a>
    <div class="app-frame ${nav ? 'has-nav' : ''}">
      <div class="app-top"><div class="app-shell">${topBar(m, { month: !NO_NAV.has(ui.view), back: headerBack(ui.view) })}</div></div>
      <main id="main" class="app-main ${nav ? '' : 'no-nav'}" tabindex="-1"><div class="app-shell ${ui.view !== lastView ? 'view-enter' : ''}">${body}</div></main>
      ${nav ? tabBar() : ''}
    </div>`;
  // 홈 숫자 롤링
  const hero = $('#hero-num');
  if (hero) { const to = Number(hero.dataset.target); rollNumber(hero, to, formatWon, lastHero ?? 0); lastHero = to; }
  if (focusKey) { const el = app.querySelector(`[data-${focusKey[0].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${CSS.escape(focusKey[1])}"]`); el?.focus({ preventScroll: true }); }
  const mainEl = $('#main');
  if (mainEl) scroller().scrollTop = ui.view === lastView ? scrollY : 0;
  fitNums(app);
  syncRailShift();
  if (mainFocused && !focusKey) mainEl?.focus({ preventScroll: true });
  lastView = ui.view;
  renderTip();
}
const tabBar = () => `<nav class="tabbar" aria-label="주요 화면">
  <div class="pclogo">${symbol('M', { cls: 'pcsym', label: '쓱 가계부' })}</div>
  ${TABS.slice(0, 2).map(tabBtn).join('')}
  <button class="fab" data-action="add" aria-label="새 기록 추가 (지출·수입)"><span aria-hidden="true">＋</span></button>
  ${TABS.slice(2).map(tabBtn).join('')}</nav>`;
const tabBtn = ([id, icon, label]) => `<button class="tab ${ui.view === id ? 'on' : ''}" data-nav="${id}" ${ui.view === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span><span>${label}</span></button>`;

// ── 구석 팁 ─────────────────────────────────────────
const tipState = () => { try { return JSON.parse(localStorage.getItem('tips')) ?? emptyTipState(); } catch { return emptyTipState(); } };
const saveTipState = (s) => localStorage.setItem('tips', JSON.stringify(s));
let currentTip = null;
function pickTip() {
  const r = nextTip(tipState(), today());
  saveTipState(r.state);
  currentTip = r.tip ? { text: r.tip, index: r.index } : null;
}
function renderTip() {
  const slot = $('#tip-slot');
  if (!slot) return;
  if (ui.view !== 'home' || !currentTip || isSheetOpen()) { slot.innerHTML = ''; return; }
  // 홈 본문 흐름 안의 한 줄(떠 있지 않아 기록·메뉴·토스트를 가리지 않음, QA M1·L1)
  slot.innerHTML = `<div class="tip" role="note" aria-label="팁"><span class="py-1.5" aria-hidden="true">💡</span><p>${esc(currentTip.text)}</p><button class="tip-x" data-tip-close aria-label="팁 닫기 (오늘 하루 숨김)">✕</button></div>`;
}

// ── 동작 ───────────────────────────────────────────
function onSave(tx, { repeat = false } = {}) {
  const isEdit = !!tx.id;
  const before = isEdit ? findTx(tx.id) : null;
  const id = data.saveTx(tx);
  const c = state.categories.find((x) => x.id === tx.categoryId);
  if (ui.view === 'search') refreshSearch();
  if (repeat && tx.amount > 0) {
    // 이번 회차는 방금 기록했으니 lastPosted = 이번 달 → 다음 달부터 자동 기록
    const ym = tx.date.slice(0, 7);
    data.saveRecurring({ name: (tx.memo || c?.name || '반복').split(' #')[0].slice(0, 30), amount: tx.amount, kind: tx.kind, categoryId: tx.categoryId, accountId: tx.accountId, dayOfMonth: Number(tx.date.slice(8)), active: true, startYm: ym, lastPosted: ym, owner: ownerToWrite(tx.owner) });
    return setTimeout(() => toast(`🔁 매달 ${Number(tx.date.slice(8))}일에 ${formatWon(tx.amount)} 자동으로 기록할게요.`, { action: '반복 보기', onAction: () => go('recurring') }), 50);
  }
  // 분류를 고치면 규칙 제안: 앞으로 같은 가맹점은 이 카테고리로('10월' 같은 일반어·이미 맞는 규칙은 묻지 않음)
  const sug = isEdit ? ruleSuggestion(before, tx, state.rules) : null;
  if (sug) {
    const old = sug.existing, oc = old && state.categories.find((x) => x.id === old.categoryId);
    const q = old ? `'${sug.key}' 규칙(${oc?.name ?? '다른 카테고리'})을 ${c?.emoji ?? ''} ${josa(c?.name ?? '', '으로')} 바꿀까요?`
      : `앞으로 ${josa(`'${sug.key}'`, '은는')} ${c?.emoji ?? ''} ${josa(c?.name ?? '', '으로')} 분류할까요?`;
    return setTimeout(() => toast(`고쳤어요. ${q}`, {
      action: old ? '바꾸기' : '그렇게 하기', duration: 6000,
      onAction: () => { data.saveRule({ id: old?.id, match: sug.key, categoryId: tx.categoryId }); toast(old ? '규칙을 바꿨어요.' : '규칙을 만들었어요. 설정에서 고칠 수 있어요.'); },
    }), 50);
  }
  setTimeout(() => {
    const m = model();
    const extra = tx.kind === 'expense' && m.weather.hasBudget && tx.date === m.today ? ` 오늘 쓸 돈 ${formatWon(m.weather.available)}` : '';
    toast(`${c?.name ?? ''} ${tx.amount < 0 ? '환불 ' : ''}${formatWon(Math.abs(tx.amount))} ${isEdit ? '고쳤어요.' : '기록!'}${extra}`, {
      action: '되돌리기', onAction: () => (before ? data.restoreTx(before) : data.deleteTx(id)),
    });
  }, 50);
}
const findTx = (id) => state.txs.find((t) => t.id === id) ?? ui.searchAll?.find((t) => t.id === id);
function refreshSearch() {
  data.allTransactions().then((all) => { ui.searchAll = all; schedule(); }).catch(() => { ui.searchAll = state.txs; schedule(); });
}
function onDelete(id) {
  const before = findTx(id);
  data.deleteTx(id);
  if (ui.searchAll) { ui.searchAll = ui.searchAll.filter((t) => t.id !== id); if (ui.view === 'search') schedule(); }
  toast('삭제했어요.', { action: '되돌리기', onAction: () => before && data.restoreTx(before) });
}
function download(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function go(view, extra = {}) {
  const from = ui.view;
  if (from === 'import' && view !== 'import') ui.imp = null; // 가져오기에서 나가면 읽은 파일을 메모리에서 버림
  if (view === 'search' && from !== 'search') { ui.searchAll = null; refreshSearch(); }
  Object.assign(ui, { view, emojiFor: null }, extra);
  if (from !== view) nav.show(view);
  exitGuard.noteStay(location.href);
  render();
  $('#main')?.focus({ preventScroll: true });
  scrollMainTop();
}
// 지금 스크롤되는 곳: 보통은 본문(#main), 높이가 낮은 화면(max-height 500px)에서는 문서 전체(style.css 참고)
const scroller = () => {
  const main = $('#main');
  return main && getComputedStyle(main).overflowY !== 'visible' ? main : document.scrollingElement;
};
const scrollMainTop = () => { if ($('#main')) scroller().scrollTop = 0; };

// ── M2: 반복 거래·저축 목표·규칙 입력 대화상자 ─────────────
const catOptions = () => state.categories.filter((c) => !c.archived).map((c) => [c.id, `${c.kind === 'income' ? '수입' : '지출'} · ${c.emoji} ${c.name}`]);
async function editRecurring(r) {
  const isNew = !r?.id;
  const t = today();
  const v = await formDialog({
    title: isNew ? '반복 거래 추가' : '반복 거래 고치기', body: '정한 날짜가 되면 자동으로 기록해요. 31일로 정하면 짧은 달은 말일에 기록해요.',
    fields: [
      { name: 'name', label: '이름', value: r?.name ?? '', maxlength: 30, hint: '예: 월세, 넷플릭스' },
      { name: 'amount', label: '금액', type: 'amount', value: r?.amount ?? 0 },
      { name: 'categoryId', label: '카테고리', type: 'select', value: r?.categoryId ?? state.categories.find((c) => c.kind === 'expense')?.id, options: catOptions() },
      { name: 'dayOfMonth', label: '매달 며칠', type: 'select', value: r?.dayOfMonth ?? Number(t.slice(8)), options: Array.from({ length: 31 }, (_, i) => [i + 1, `${i + 1}일`]) },
      { name: 'accountId', label: '결제수단', type: 'select', value: r?.accountId ?? '', options: [['', '지정 안 함'], ...state.accounts.map((a) => [a.id, `${a.emoji || ''} ${a.name}`])] },
      ...(state.features?.txOwner ? [{ name: 'owner', label: '누구 돈', type: 'select', value: r?.owner === '배우자' || r?.owner === '공동' ? r.owner : '', options: [['', '나'], ['배우자', spouseLabel(state.settings)], ['공동', '공동']], hint: '나는 기록에 누구 돈을 적지 않아요. 배우자 입금이면 배우자를 고르세요.' }] : []),
    ],
    validate: (x) => (!x.name ? '이름을 적어 주세요.' : x.name.length > 30 ? '이름은 30자까지예요.' : !x.amount ? '금액을 입력해 주세요.' : x.amount > 1_000_000_000 ? '10억 원까지 입력할 수 있어요.' : null),
  });
  if (!v) return;
  const c = state.categories.find((x) => x.id === v.categoryId);
  const day = Number(v.dayOfMonth);
  // 새로 만들 때: 오늘이 이미 지난 날이면 이번 달은 건너뜀(직접 기록했을 수 있음) → 다음 달부터
  const ym = t.slice(0, 7);
  const lastPosted = isNew ? (day <= Number(t.slice(8)) ? ym : undefined) : r.lastPosted;
  const pickedOwner = state.features?.txOwner ? v.owner : r?.owner;
  data.saveRecurring({ ...(r ?? {}), name: v.name, amount: v.amount, kind: c?.kind === 'income' ? 'income' : 'expense', categoryId: v.categoryId, accountId: v.accountId || undefined, dayOfMonth: day, active: r?.active ?? true, startYm: r?.startYm ?? ym, lastPosted, owner: pickedOwner === '나' ? '나' : ownerToWrite(pickedOwner) });
  setTimeout(() => data.postRecurring(today()), 300);
  toast(isNew ? `🔁 매달 ${day}일에 ${formatWon(v.amount)} 기록할게요.${lastPosted === ym ? ' 이번 달 것은 건너뛰었어요.' : ''}` : '고쳤어요.');
}
const GOAL_EMOJI = ['🎯', '✈️', '🏠', '🚗', '💍', '🎓', '🛟', '💻', '🎁', '🐷'];
function applyModeChoice(mode) {
  const next = settingsForMode(mode);
  data.saveSettings(next);
  if (next.features.studentIncome) data.ensureStudentIncome();
  if (next.features.recurring) setTimeout(() => data.postRecurring(today()), 300);
  const leaveRecurring = ui.view === 'recurring' && !next.features.recurring;
  const label = MODES.find((x) => x.id === mode)?.label ?? '';
  toast(`${label}에 맞춰 메뉴를 골랐어요. 설정에서 기능을 더 켜고 끌 수 있어요.`);
  if (leaveRecurring) go('settings');
  else render();
}
async function editAllowance() {
  const a = allowanceFrom(state.settings);
  const v = await formDialog({
    title: '용돈', body: '다음 용돈날까지 남은 돈을 남은 일수로 나눈 하루 몫이에요. 홈의 큰 숫자와는 계산이 달라요.',
    fields: [
      { name: 'amount', label: '한 번에 받는 용돈', type: 'amount', value: a.amount },
      { name: 'cycle', label: '주기', type: 'select', value: a.cycle, options: [['month', '매달'], ['week', '매주']] },
      { name: 'day', label: '매달 며칠 (1~28일)', type: 'select', value: a.day, options: Array.from({ length: 28 }, (_, i) => [i + 1, `${i + 1}일`]) },
      { name: 'weekday', label: '매주 요일', type: 'select', value: a.weekday, options: ['일', '월', '화', '수', '목', '금', '토'].map((l, i) => [i, `${l}요일`]) },
    ],
    validate: (x) => (x.amount > 10_000_000_000 ? '100억 원까지예요.' : null),
  });
  if (!v) return;
  data.saveSettings({ allowanceAmount: v.amount, allowanceCycle: v.cycle === 'week' ? 'week' : 'month', allowanceDay: Number(v.day) || 1, allowanceWeekday: Number(v.weekday) || 0 });
  toast('용돈을 정했어요.');
}
async function editGoal(g) {
  const piggy = !!(state.mode && state.features?.piggy);
  const v = await formDialog({
    title: piggy ? (g ? '저금통 고치기' : '저금통에 넣기') : (g ? '저축 목표 고치기' : '저축 목표 추가'),
    fields: [
      { name: 'emoji', label: '아이콘', type: 'select', value: g?.emoji ?? (piggy ? '🐷' : '🎯'), options: GOAL_EMOJI.map((e) => [e, e]) },
      { name: 'name', label: '이름', value: g?.name ?? '', maxlength: 30, hint: '예: 제주 여행, 비상금' },
      { name: 'target', label: '목표 금액', type: 'amount', value: g?.target ?? 0 },
      { name: 'saved', label: '지금까지 모은 돈', type: 'amount', value: g?.saved ?? 0 },
      { name: 'due', label: '목표일 (선택)', type: 'date', value: g?.due ?? '' },
    ],
    validate: (x) => validateGoal(x) ?? (x.due && x.due < today() && !g ? '목표일은 오늘 뒤로 정해 주세요.' : null),
  });
  if (!v) return;
  data.saveGoal({ ...(g ?? { order: state.goals.length }), ...v, due: v.due || undefined });
  toast(g ? '고쳤어요.' : `🎯 '${v.name}' 목표를 만들었어요.`);
}
async function editRule() {
  const v = await formDialog({
    title: '자동 분류 규칙 추가', body: '메모(가맹점)에 이 글자가 들어 있으면 이 카테고리로 분류해요. 여러 규칙이 맞으면 더 긴 글자가 이겨요.',
    fields: [{ name: 'match', label: '이 글자가 있으면', value: '', maxlength: 40, hint: '예: 스타벅스, 쿠팡' }, { name: 'categoryId', label: '이 카테고리로', type: 'select', value: state.categories[0]?.id, options: catOptions() }],
    validate: (x) => (!x.match ? '글자를 적어 주세요.' : null),
  });
  if (!v) return;
  const old = state.rules.find((r) => r.match === v.match);
  data.saveRule({ id: old?.id, ...v });
  toast(old ? '같은 글자의 규칙을 바꿨어요.' : '규칙을 만들었어요.');
}

const TYPE_OPTIONS = [['stock', '일반 주식'], ['pension', '연금저축'], ['irp', 'IRP'], ['isa', 'ISA'], ['dc', 'DC'], ['civil', '공무원연금']];
const KIND_OPTIONS = [['stock', '주식'], ['etf', 'ETF'], ['fund', '펀드'], ['deposit', '예금']];
function assetById(id) { return state.assetAccounts.find((a) => a.id === id); }
async function editAssetAccount(a) {
  const v = await formDialog({
    title: a ? '계좌 고치기' : '계좌 추가',
    body: '계좌번호는 저장하지 않아요. 기관 이름과 별명만 적어 주세요.',
    fields: [
      { name: 'type', label: '종류', type: 'select', value: a?.type ?? 'pension', options: TYPE_OPTIONS },
      { name: 'institution', label: '금융기관', value: a?.institution ?? '', maxlength: 40, hint: '예: 삼성증권, 공무원연금공단' },
      { name: 'name', label: '이름', value: a?.name ?? '', maxlength: 40, hint: '예: 직장인 연금' },
      { name: 'opened', label: '개설일', type: 'date', value: a?.opened ?? today() },
      { name: 'maturity', label: 'ISA 만기일', type: 'date', value: a?.maturity ?? '', hint: 'ISA만 필요해요.' },
      { name: 'expectedPension', label: '공무원연금 예상 월액', type: 'amount', value: a?.expectedPension ?? 0, hint: '공무원연금만 써요. 총자산에는 더하지 않아요.' },
    ],
    validate: (x) => validateAssetAccount(x),
  });
  if (!v) return;
  const id = data.saveAssetAccount({ ...(a ?? { order: state.assetAccounts.length }), ...v, maturity: v.type === 'isa' ? v.maturity : undefined, expectedPension: v.type === 'civil' ? v.expectedPension : undefined });
  ui.assetOpen = id;
  toast(a ? '계좌를 고쳤어요.' : '계좌를 추가했어요.');
  render();
}
async function editHolding(accountId, h) {
  const v = await formDialog({
    title: h ? '종목 고치기' : '종목 추가',
    body: '주식·ETF 코드는 6자리예요. 펀드 기준가와 예금은 여기서 직접 적어요.',
    fields: [
      { name: 'kind', label: '종류', type: 'select', value: h?.kind ?? 'stock', options: KIND_OPTIONS },
      { name: 'name', label: '이름', value: h?.name ?? '', maxlength: 80 },
      { name: 'code', label: '종목 코드', value: h?.code ?? '', maxlength: 12, hint: '예: 005930. 펀드·예금은 비워도 돼요.' },
      { name: 'qty', label: '수량', value: h ? formatQty(h.qtyE4) : '', inputmode: 'decimal', hint: '소수 넷째 자리까지' },
      { name: 'avgPrice', label: '평균 단가', type: 'amount', value: h?.avgPrice ?? 0 },
      { name: 'lastPrice', label: '현재 가격', type: 'amount', value: h?.lastPrice ?? 0, hint: '0원이면 시세 없음으로 둬요.' },
      { name: 'priceDate', label: '시세 기준일', type: 'date', value: h?.priceDate || (h?.lastPrice ? today() : '') },
    ],
    validate: (x) => validateHolding({ ...x, priceDate: x.lastPrice > 0 ? x.priceDate : '' }),
  });
  if (!v) return;
  const qtyE4 = parseQtyE4(v.qty);
  const code = normalizeCode(v.code);
  const priced = v.lastPrice > 0;
  data.saveHolding({
    ...(h ?? {}), assetAccountId: accountId, kind: v.kind, name: v.name, code: code || undefined, qtyE4,
    avgPrice: v.avgPrice, lastPrice: priced ? v.lastPrice : undefined, priceDate: priced ? v.priceDate : undefined,
    priceSource: priced ? 'manual' : undefined,
  });
  ui.assetOpen = accountId;
  toast(h ? '종목을 고쳤어요.' : '종목을 추가했어요.');
  render();
}
async function editHoldingPrice(h) {
  const v = await formDialog({
    title: '시세 고치기',
    body: `${h.name}의 가격과 기준일을 적어 주세요. 0원이면 시세를 비워요. 자동 시세는 이 날짜보다 더 새로운 날만 덮어써요.`,
    fields: [
      { name: 'lastPrice', label: '현재 가격', type: 'amount', value: h.lastPrice || 0 },
      { name: 'priceDate', label: '시세 기준일', type: 'date', value: h.priceDate || today() },
    ],
    validate: (x) => (x.lastPrice < 0 || x.lastPrice > 10_000_000_000 ? '가격은 0원~100억 원이에요.' : x.lastPrice > 0 && !isYmd(x.priceDate) ? '기준일을 확인해 주세요.' : null),
  });
  if (!v) return;
  const priced = v.lastPrice > 0;
  data.saveHolding({ ...h, lastPrice: priced ? v.lastPrice : undefined, priceDate: priced ? v.priceDate : undefined, priceSource: priced ? 'manual' : undefined });
  toast('시세를 고쳤어요.', { action: '되돌리기', onAction: () => data.saveHolding(h) });
}
async function editContribution(account) {
  const deductible = account.type === 'pension' || account.type === 'irp' || account.type === 'dc';
  const v = await formDialog({
    title: '납입 추가',
    body: '세액공제에 체크한 연금저축·IRP·DC만 올해 환급 계산에 들어가요.',
    fields: [
      { name: 'date', label: '날짜', type: 'date', value: today() },
      { name: 'amount', label: '금액', type: 'amount', value: 0 },
      { name: 'deductible', label: '세액공제 대상', type: 'checkbox', value: deductible },
    ],
    validate: (x) => validateContribution(x),
  });
  if (!v) return;
  data.saveContribution({ assetAccountId: account.id, date: v.date, amount: v.amount, deductible: v.deductible });
  ui.assetOpen = account.id;
  toast('납입을 적었어요.');
  render();
}
async function editTaxPrefs() {
  const p = taxPrefs(state.assetPrefs);
  const v = await formDialog({
    title: '세액공제 한도·세율',
    body: '기본은 연금저축 600만 원, 연금저축+IRP+DC 900만 원, 16.5%와 13.2%예요.',
    fields: [
      { name: 'pensionLimit', label: '연금저축 한도', type: 'amount', value: p.pensionLimit },
      { name: 'combinedLimit', label: '합산 한도', type: 'amount', value: p.combinedLimit },
      { name: 'rateHigh', label: '높은 세율 (%)', value: formatRateBp(p.rateHigh).replace('%', '') },
      { name: 'rateLow', label: '낮은 세율 (%)', value: formatRateBp(p.rateLow).replace('%', '') },
    ],
    validate: (x) => validateTaxPrefs(x),
  });
  if (!v) return;
  data.saveAssetPrefs({ ...p, pensionLimit: v.pensionLimit, combinedLimit: v.combinedLimit, rateHigh: parseRateBp(v.rateHigh), rateLow: parseRateBp(v.rateLow) });
  toast('한도와 세율을 저장했어요.');
}
async function onAssetClick(d) {
  if (d.assetAdd !== undefined) return editAssetAccount(null);
  if (d.assetOpen) { ui.assetOpen = ui.assetOpen === d.assetOpen ? null : d.assetOpen; return render(); }
  if (d.assetEdit) return editAssetAccount(assetById(d.assetEdit));
  if (d.assetDel) {
    const a = assetById(d.assetDel);
    if (!a) return;
    const holdings = state.holdings.filter((h) => h.assetAccountId === a.id);
    const contributions = state.contributions.filter((c) => c.assetAccountId === a.id);
    if (!(await confirmDialog({ title: `'${a.name}' 계좌를 지울까요?`, body: '이 계좌의 종목과 납입 기록도 함께 지워져요. 가계부 거래는 그대로예요.', ok: '지우기', danger: true }))) return;
    try { await data.deleteAssetAccount(a.id); } catch { return toast('지우지 못했어요. 인터넷 연결을 확인해 주세요.'); }
    if (ui.assetOpen === a.id) ui.assetOpen = null;
    return toast('지웠어요.', { action: '되돌리기', onAction: () => { data.saveAssetAccount(a); holdings.forEach((h) => data.saveHolding(h)); contributions.forEach((c) => data.saveContribution(c)); } });
  }
  if (d.holdingAdd) return editHolding(d.holdingAdd, null);
  if (d.holdingEdit) { const h = state.holdings.find((x) => x.id === d.holdingEdit); return h && editHolding(h.assetAccountId, h); }
  if (d.holdingPrice) { const h = state.holdings.find((x) => x.id === d.holdingPrice); return h && editHoldingPrice(h); }
  if (d.holdingDel) {
    const h = state.holdings.find((x) => x.id === d.holdingDel);
    if (!h || !(await confirmDialog({ title: `'${h.name}' 종목을 지울까요?`, ok: '지우기', danger: true }))) return;
    data.deleteHolding(h.id);
    return toast('지웠어요.', { action: '되돌리기', onAction: () => data.saveHolding(h) });
  }
  if (d.contribAdd) { const a = assetById(d.contribAdd); return a && editContribution(a); }
  if (d.contribDel) {
    const c = state.contributions.find((x) => x.id === d.contribDel);
    if (!c) return;
    data.deleteContribution(c.id);
    return toast('납입을 지웠어요.', { action: '되돌리기', onAction: () => data.saveContribution(c) });
  }
  if (d.taxRate) {
    const p = taxPrefs(state.assetPrefs);
    if (p.rateChoice === d.taxRate) return;
    data.saveAssetPrefs({ ...p, rateChoice: d.taxRate === 'low' ? 'low' : 'high' });
    return;
  }
  if (d.taxEdit !== undefined) return editTaxPrefs();
}

// ── 가져오기 동작 ──────────────────────────────────
const impCtx = () => ({ categories: state.categories, rules: state.rules, txsInRange: data.txsInRange, importTxs: data.importTxs });
async function impLoad(bytes, name, enc) {
  const imp = ui.imp ?? (ui.imp = IMP.newImport());
  const before = imp.step;
  if (before < 2) nav.pushStep(2);
  imp.busy = true; render();
  await IMP.loadFile(imp, bytes, name, enc);
  if (imp.step < 2) nav.undoStep();
  render(); $('#main')?.focus({ preventScroll: true });
}
async function restoreFile(file) {
  if (!file) return;
  let parsed;
  try { parsed = parseBackup(JSON.parse(await file.text())); }
  catch (e) { return toast(e?.message || '백업 파일을 읽지 못했어요.'); }
  const ok = await confirmDialog({ title: '백업을 더할까요?', body: '파일에 있는 기록만 같은 칸에 넣어요. 파일에 없는 기록은 지우지 않아요. 예전 백업에 없는 항목도 그대로 둡니다.', ok: '더하기' });
  if (!ok) return;
  try {
    const result = await data.restoreBackup(parsed);
    toast(restoreMessage({ online: navigator.onLine, queued: !!result?.queued }));
  } catch { toast('복원하지 못했어요. 인터넷 연결을 확인해 주세요.'); }
}
async function impFile(file) {
  if (!file) return;
  await loadImp();
  if (file.size > 20 * 1024 * 1024) return toast('20MB보다 큰 파일은 읽지 않아요. 기간을 나눠서 받아 주세요.');
  if (ui.view !== 'import') go('import');
  ui.imp = IMP.newImport();
  await impLoad(new Uint8Array(await file.arrayBuffer()), file.name);
}
async function onImportClick(d) {
  const imp = ui.imp;
  if (!imp) return;
  if (d.impRestart !== undefined) { ui.imp = IMP.newImport(); render(); scrollMainTop(); return $('#main')?.focus({ preventScroll: true }); }
  if (d.impBack !== undefined) {
    if (imp.step > 1) { history.back(); return; }
    return go('settings');
  }
  if (d.impSample !== undefined) {
    try { const r = await fetch(IMP.SAMPLE_URL); if (!r.ok) throw new Error(r.status); await impLoad(new Uint8Array(await r.arrayBuffer()), '현대카드_예시.xls'); }
    catch { toast('예시 파일을 받지 못했어요.'); }
    return;
  }
  if (d.impUndo) {
    if (!(await confirmDialog({ title: '이번에 가져온 거래를 모두 지울까요?', body: '이 묶음으로 들어온 거래만 지워요. 직접 남긴 기록은 그대로예요.', ok: '되돌리기', danger: true }))) return;
    try { const n = await data.undoImport(d.impUndo); ui.imp = IMP.newImport(); render(); toast(`가져온 거래 ${n}건을 지웠어요.${navigator.onLine ? '' : ' 연결되면 서버에서도 지울게요.'}`); }
    catch { toast('되돌리지 못했어요. 인터넷 연결을 확인해 주세요.'); }
    return;
  }
  if (d.impEnc !== undefined && imp.bytes) return impLoad(imp.bytes, imp.fileName, imp.table.encoding === 'euc-kr' ? 'utf-8' : 'euc-kr');
  if (d.impHdr) { IMP.setHeaderRow(imp, imp.headerRow + Number(d.impHdr)); return render(); }
  if (d.impSheet) { IMP.setSheet(imp, Number(d.impSheet)); return render(); }
  if (d.impSkipall !== undefined) { imp.choice = {}; return render(); }
  if (d.impChoice) { imp.choice[d.impChoice] = d.v; return render(); }
  if (d.impNext !== undefined) {
    const before = imp.step;
    if (imp.step === 2) nav.pushStep(3);
    else if (imp.step === 3) nav.pushStep(4);
    else if (imp.step === 4) nav.pushStep(5);
    if (imp.step === 2) { imp.busy = true; render(); await IMP.checkDuplicates(imp, impCtx()); }
    else if (imp.step === 3) imp.step = 4;
    else if (imp.step === 4) { imp.busy = true; render(); await IMP.commit(imp, impCtx()); if (imp.step === 5) haptic(20); }
    if (imp.step === before) nav.undoStep();
    render(); scrollMainTop(); $('#main')?.focus({ preventScroll: true });
  }
}

async function editBudget(m) {
  const v = await promptAmount({ title: `${monthLabel(m.viewYm, m.sd)} 예산`, body: '한 달 동안 쓸 총액을 정해 주세요. 0원이면 예산을 끕니다.', value: m.budget?.total ?? 0 });
  if (v == null) return;
  const pr = state.budget?.byCategory ? pruneLimits(state.budget.byCategory, state.categories).by : undefined;
  data.setBudget(m.viewYm, v, pr && Object.keys(pr).length ? pr : undefined);
  toast(v ? `예산을 ${formatWon(v)}으로 정했어요.` : '예산을 껐어요.');
}

app.addEventListener('click', async (e) => {
  const bar = e.target.closest('[data-bar]');
  if (bar) { ui.barYm = bar.dataset.bar; return render(); }
  const t = e.target.closest('button, [data-tx]');
  if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.scaleStep !== undefined) return setScale(stepScale(contentScale, Number(d.scaleStep)));
  if (d.scaleReset !== undefined) return setScale(1);
  const m = state.user ? model() : null;
  if (d.assetAdd !== undefined || d.assetOpen || d.assetEdit || d.assetDel || d.holdingAdd || d.holdingEdit || d.holdingPrice || d.holdingDel || d.contribAdd || d.contribDel || d.taxRate || d.taxEdit !== undefined) return onAssetClick(d);
  if (d.nav) {
    // '목록에서 보기'(가져오기 완료): 가져온 거래가 있는 달로 이동
    const ym = d.date ? periodOf(d.date, m?.sd) : null;
    return go(d.nav, { ...(d.mode ? { mode: d.mode, catFilter: null } : {}), ...(ym ? { viewYm: m && ym >= m.curYm ? null : ym, selDate: null } : {}) });
  }
  if (d.tx) { const tx = findTx(d.tx); return tx && openSheet(tx); }
  if (Object.keys(d).some((k) => k.startsWith('imp'))) return onImportClick(d);
  // 검색
  if (d.searchKind !== undefined) { ui.search.kind = d.searchKind; if (ui.search.categoryId && m.catMap.get(ui.search.categoryId)?.kind !== d.searchKind && d.searchKind) ui.search.categoryId = ''; return render(); }
  if (d.searchClear !== undefined) { ui.search = { q: '', kind: '', categoryId: '', accountId: '', range: ui.search.range, min: null, max: null }; return render(); }
  if (d.searchTry) { ui.search.q = d.searchTry; render(); return $('[data-search-q]')?.focus(); }
  // 반복 거래
  if (d.recEdit) return editRecurring(state.recurring.find((r) => r.id === d.recEdit));
  if (d.pickMode) return applyModeChoice(d.pickMode);
  if (d.modeLater !== undefined) { data.saveSettings({ askMode: false }); return toast('지금 메뉴를 그대로 둘게요. 설정에서 언제든 고를 수 있어요.'); }
  if (d.setMode) return applyModeChoice(d.setMode);
  if (d.recPreset === 'rent' || d.recPreset === 'sub') {
    const housing = state.categories.some((c) => c.id === 'housing') ? 'housing' : 'etc';
    const telecom = state.categories.some((c) => c.id === 'telecom') ? 'telecom' : 'etc';
    return editRecurring(d.recPreset === 'rent'
      ? { name: '월세', amount: 0, kind: 'expense', categoryId: housing, dayOfMonth: state.profile?.monthStartDay || 1, active: true }
      : { name: '구독', amount: 0, kind: 'expense', categoryId: telecom, dayOfMonth: 1, active: true });
  }
  if (d.recFrom) {
    const ids = new Set(state.categories.map((x) => x.id));
    const categoryId = ids.has(d.cat) ? d.cat : classify({ desc: d.recFrom, kind: 'expense' }, state.rules, ids).categoryId;
    return editRecurring({ name: d.recFrom.slice(0, 30), amount: Number(d.amount), kind: 'expense', categoryId, dayOfMonth: Math.min(31, Math.max(1, Number(d.day) || 1)), active: true });
  }
  if (d.recDel) {
    const r = state.recurring.find((x) => x.id === d.recDel);
    if (!r || !(await confirmDialog({ title: `'${r.name}' 반복을 지울까요?`, body: '이미 기록된 거래는 그대로 남아요.', ok: '지우기', danger: true }))) return;
    data.deleteRecurring(r.id);
    return toast('지웠어요.', { action: '되돌리기', onAction: () => data.saveRecurring(r) });
  }
  // 저축 목표
  if (d.goalEdit) return editGoal(state.goals.find((g) => g.id === d.goalEdit));
  if (d.goalAdd) {
    const g = state.goals.find((x) => x.id === d.goalAdd);
    const v = g && (await promptAmount({ title: `${g.emoji || '🎯'} ${g.name}에 모으기`, body: `지금 ${formatWon(g.saved || 0)} / ${formatWon(g.target)}`, value: 0, ok: '모으기' }));
    if (!v) return;
    const saved = Math.min(10_000_000_000, (g.saved || 0) + v);
    data.saveGoal({ ...g, saved });
    haptic(12);
    return toast(saved >= g.target ? `🎉 '${g.name}' 목표를 이뤘어요!` : `${formatWon(v)} 모았어요. ${Math.round((saved / g.target) * 100)}%`, { action: '되돌리기', onAction: () => data.saveGoal(g) });
  }
  // 자동 분류 규칙
  if (d.ruleDel) { const r = state.rules.find((x) => x.id === d.ruleDel); if (!r) return; data.deleteRule(r.id); return toast('규칙을 지웠어요.', { action: '되돌리기', onAction: () => data.saveRule(r) }); }
  if (d.month) {
    const delta = Number(d.month);
    ui.viewYm = delta === 0 ? null : shiftYm(m.viewYm, delta);
    if (ui.viewYm && ui.viewYm >= m.curYm) ui.viewYm = null;
    ui.selDate = null;
    return render();
  }
  if (d.date) { ui.selDate = ui.selDate === d.date ? null : d.date; return render(); }
  if (d.addOn) return openSheet(null, { date: d.addOn });
  if (d.ownerFilter !== undefined) { ui.ownerFilter = d.ownerFilter || null; return render(); }
  if (d.mode) { ui.mode = d.mode; return render(); }
  if (d.clearFilter !== undefined) { ui.catFilter = null; return render(); }
  if (d.filterCat) return go('calendar', { mode: 'list', catFilter: d.filterCat });
  if (d.theme) { setThemeMode(d.theme); return render(); }
  if (d.mood) return pushLook({ mood: d.mood });
  if (d.fontPick) return pushLook({ font: d.fontPick });
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
    try {
      const n = await data.deleteCategory(c);
      // 지운 카테고리의 이 달 한도도 지움(30개 한도에 남지 않게)
      if (state.budget?.byCategory?.[c.id] != null) { const by = { ...state.budget.byCategory }; delete by[c.id]; data.setBudget(m.viewYm, state.budget.total ?? 0, Object.keys(by).length ? by : undefined); }
      toast(n ? `지웠어요. 기록 ${n}개는 기타로 옮겼어요.` : '지웠어요.'); }
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
    // 규칙과 같은 한도: 카테고리 30개까지(지운 카테고리 키는 버리고, 숨긴 카테고리는 넘칠 때만 버림), 100억 원까지
    if (v > 10_000_000_000) return toast('한도는 100억 원까지 정할 수 있어요.');
    const pr = pruneLimits(by, state.categories);
    if (!pr.ok) return toast('카테고리 한도는 30개까지 정할 수 있어요. 안 쓰는 카테고리 한도를 눌러 0원으로 지운 뒤 다시 해 주세요.', { duration: 6000 });
    return data.setBudget(m.viewYm, state.budget?.total ?? 0, Object.keys(pr.by).length ? pr.by : undefined);
  }
  if (d.tipClose !== undefined) { saveTipState(dismissTip(tipState(), currentTip.index, today())); currentTip = null; return renderTip(); }
  switch (d.action) {
    case 'add': haptic(); return openSheet();
    case 'add-rec': return editRecurring(null);
    case 'add-goal': return editGoal(null);
    case 'add-rule': return editRule();
    case 'allowance': return editAllowance();
    case 'share-text':
      try {
        const { reportData, drawReport } = await import('./ui/report.js');
        const { monthSummaryText, shareSummary } = await import('./lib/shareSummary.js');
        const d = reportData(m);
        const text = monthSummaryText(d);
        const blob = await drawReport(d, { dark: m.dark });
        const file = new File([blob], `쓱가계부_${d.ym}_요약.png`, { type: 'image/png' });
        const r = await shareSummary({ text, file, title: `${d.month}월 요약` });
        if (r === 'shared') toast('요약을 공유했어요.');
        else if (r === 'copied') toast('글을 복사하고 이미지를 저장했어요.');
        else if (r === 'downloaded') toast('이미지를 저장했어요.');
        else if (r !== 'abort') toast('공유하지 못했어요.');
      } catch (err) { console.error(err); toast('요약을 만들지 못했어요.'); }
      return;
    case 'json-in': {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = () => restoreFile(input.files?.[0]);
      input.click();
      return;
    }
    case 'report':
      try { const { openReport } = await import('./ui/report.js'); await openReport(m, { toast }); } catch (err) { console.error(err); toast('리포트 이미지를 만들지 못했어요.'); }
      return;
    case 'theme': toggleTheme(); return render();
    case 'budget': return editBudget(m);
    case 'login':
      ui.loginError = '';
      try { await data.login(); } catch (err) { ui.loginError = data.loginErrorText(err); console.error(err); render(); }
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
        // 규칙·반복·목표·모든 달 예산·가져오기 기록까지(QA M4)
        const [txs, budgets, assets] = await Promise.all([data.allTransactions(), data.allBudgets(), data.assetExport()]);
        const b = buildBackup({ profile: { monthStartDay: m.storedStart ?? state.profile?.monthStartDay ?? 1 }, categories: state.categories, accounts: state.accounts, transactions: txs, budgets, rules: state.rules, recurring: state.recurring, goals: state.goals, imports: state.imports, settings: state.settings, ...assets });
        download(`쓱가계부_백업_${m.today}.json`, JSON.stringify(b, null, 2), 'application/json');
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
  if (t.dataset.feat) {
    const id = t.dataset.feat;
    if (!state.mode && LEGACY_FEATURES[id] && !t.checked) {
      t.checked = true;
      return toast('방식을 고르기 전에는 지금 메뉴를 끄지 않아요.');
    }
    const features = { ...(state.features ?? {}), [id]: t.checked };
    data.saveSettings(state.mode ? { mode: state.mode, features } : { features });
    if (id === 'studentIncome' && t.checked) data.ensureStudentIncome();
    if (id === 'recurring' && t.checked) setTimeout(() => data.postRecurring(today()), 300);
    return;
  }
  if (t.dataset.spouseName !== undefined) {
    const name = t.value.trim();
    if (name.length > 20) { toast('배우자 이름은 20자까지예요.'); t.value = state.settings?.spouseName || ''; return; }
    data.saveSettings({ spouseName: name || null });
    toast(name ? `배우자 이름을 ${name}(으)로 보여 드려요.` : '배우자 이름을 기본으로 돌렸어요.');
    return;
  }
  if (t.dataset.splitMe !== undefined) {
    const n = Number(t.value);
    if (Number.isInteger(n) && n >= 0 && n <= 100) data.saveSettings({ splitMe: n });
    return;
  }
  if (t.dataset.startDay !== undefined) { data.setProfile({ monthStartDay: Number(t.value) }); ui.viewYm = null; toast(`한 달 시작일을 ${t.value}일로 바꿨어요.`); }
  if (t.dataset.haptic !== undefined) localStorage.setItem('haptic', t.checked ? 'on' : 'off');
  if (t.dataset.decor !== undefined && t.type === 'checkbox') return pushLook({ decor: t.checked });
  if (t.dataset.tonePart && t.type === 'checkbox') return pushLook({ tone: { ...readLook().tone, [t.dataset.tonePart]: t.checked } });
  // 가져오기
  if (t.dataset.impFile !== undefined) { impFile(t.files?.[0]); t.value = ''; return; }
  if (t.dataset.impCol && ui.imp) { IMP.setCol(ui.imp, Number(t.dataset.impCol), t.value); return render(); }
  if (t.dataset.impOpt && ui.imp) { const k = t.dataset.impOpt; ui.imp.opts[k] = t.type === 'checkbox' ? t.checked : t.value; return render(); }
  // 검색
  if (t.dataset.searchF) { ui.search[t.dataset.searchF] = t.value; return render(); }
  if (t.dataset.searchAmt) { const n = t.value.replace(/[^0-9]/g, ''); ui.search[t.dataset.searchAmt] = n ? Number(n) : null; return render(); }
  // 반복·규칙
  if (t.dataset.recActive) {
    const r = state.recurring.find((x) => x.id === t.dataset.recActive);
    if (!r) return;
    // 다시 켤 때 꺼져 있던 달은 채우지 않음(지난달까지 기록한 것으로 봄)
    const prev = shiftYm(today().slice(0, 7), -1);
    data.saveRecurring({ ...r, active: t.checked, lastPosted: t.checked && (!r.lastPosted || r.lastPosted < prev) ? prev : r.lastPosted });
    if (t.checked) setTimeout(() => data.postRecurring(today()), 300);
    return toast(t.checked ? `'${r.name}' 자동 기록을 켰어요.` : `'${r.name}' 자동 기록을 껐어요.`);
  }
  if (t.dataset.ruleMatch) {
    const r = state.rules.find((x) => x.id === t.dataset.ruleMatch), v = t.value.trim();
    if (!v || v.length > 40) { toast('글자는 1~40자로 적어 주세요.'); t.value = r?.match ?? ''; return; }
    if (r && r.match !== v) data.saveRule({ ...r, match: v });
  }
  if (t.dataset.ruleCat) { const r = state.rules.find((x) => x.id === t.dataset.ruleCat); if (r) data.saveRule({ ...r, categoryId: t.value }); }
  if (t.dataset.toggleEnv !== undefined) { ui.envelopes = t.checked; if (!t.checked && state.budget?.byCategory) data.setBudget(model().viewYm, state.budget.total ?? 0, undefined); render(); }
});
let searchTimer;
app.addEventListener('input', (e) => {
  if (e.target.dataset?.contentScale !== undefined) return setScale(Number(e.target.value) / 100);
  if (e.target.dataset?.splitMe !== undefined) {
    const n = Number(e.target.value);
    const who = spouseLabel(state.settings);
    const out = $('[data-split-out]');
    if (out && Number.isInteger(n)) out.textContent = `나 ${n}% · ${who} ${100 - n}%`;
    e.target.setAttribute('aria-valuetext', `나 ${n}퍼센트`);
    return;
  }
  if (e.target.dataset?.searchQ === undefined) return;
  ui.search.q = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { if (e.isComposing) return; render(); const el = $('[data-search-q]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250);
});
app.addEventListener('compositionend', (e) => e.target.dataset?.searchQ !== undefined && e.target.dispatchEvent(new Event('input', { bubbles: true })));
app.addEventListener('submit', (e) => { if (e.target.matches('[data-search-form]')) { e.preventDefault(); ui.search.q = $('[data-search-q]').value; render(); } });
// 파일 끌어다 놓기: 가져오기 화면의 상자, 또는 PC에서 아무 화면에나 놓으면 가져오기로
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
document.addEventListener('dragover', (e) => { if (!state.user || !hasFiles(e)) return; e.preventDefault(); $('[data-drop]')?.classList.add('over'); });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) $('[data-drop]')?.classList.remove('over'); });
document.addEventListener('drop', (e) => {
  if (!state.user || !hasFiles(e)) return;
  e.preventDefault();
  if (isSheetOpen() || ui.imp?.busy) return;
  impFile(e.dataTransfer.files[0]);
});
app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.target.dataset?.nameFor || e.target.dataset?.accName || e.target.dataset?.ruleMatch)) e.target.blur();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.bar) { e.preventDefault(); ui.barYm = e.target.dataset.bar; render(); }
});
window.matchMedia('(min-width: 1024px)').addEventListener?.('change', () => state.user && render());
document.addEventListener('keydown', (e) => {
  if (!state.user || isSheetOpen() || e.target.matches('input,select,textarea') || document.querySelector('[role=alertdialog],[role=dialog]:not(.sheet)')) return;
  if ((e.key === 'n' || e.key === '+') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openSheet(); }
});

// 새로 고친 직후처럼 아무 곳에도 포커스가 없을 때 PageDown·화살표·스페이스·Home/End 가 본문을 스크롤하도록(QA M7).
// 처음부터 본문에 포커스를 주면 Tab 순서(본문으로 건너뛰기 → 위 메뉴)가 흐트러지므로, 첫 스크롤 키를 누를 때만 본문으로 넘김(테두리 없음)
document.addEventListener('keydown', (e) => {
  const t = document.activeElement;
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || (t && t !== document.body && t !== document.documentElement)) return;
  const main = $('#main');
  if (!main || scroller() !== main || isSheetOpen() || document.querySelector('[role=alertdialog],[role=dialog]:not(.sheet)')) return;
  const page = main.clientHeight * 0.875;
  const dy = { PageDown: page, PageUp: -page, ArrowDown: 40, ArrowUp: -40, ' ': e.shiftKey ? -page : page, Home: -main.scrollHeight, End: main.scrollHeight }[e.key];
  if (dy === undefined) return;
  e.preventDefault();
  main.focus({ preventScroll: true });
  main.scrollBy({ top: dy, behavior: reducedMotionNow() ? 'auto' : 'smooth' });
});
const reducedMotionNow = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// 화면 키보드 감지(QA M5): 입력칸에 포커스가 있고 보이는 높이가 창보다 150px 넘게 줄면 html.kbd-open → 폰에서 아래 메뉴를 숨김
const vv = window.visualViewport;
const kbdCheck = () => {
  const typing = document.activeElement?.matches?.('input:not([type=range]):not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable=true]');
  // 기준: 보이는 높이가 창 높이의 85% 미만으로 줄고(가로 화면처럼 낮은 창도 비율로), 60px 넘게 줄었을 때
  const shrink = vv ? window.innerHeight - vv.height : 0;
  document.documentElement.classList.toggle('kbd-open', !!(vv && typing && shrink > 60 && vv.height < window.innerHeight * 0.85));
};
vv?.addEventListener('resize', kbdCheck);
document.addEventListener('focusin', kbdCheck);
document.addEventListener('focusout', () => setTimeout(kbdCheck, 50));
// 대화상자가 떠 있을 때 휠: 대화상자 안에서 더 스크롤할 곳이 없으면 뒤쪽 본문이 대신 스크롤되지 않게 막음(QA L2)
document.addEventListener('wheel', (e) => {
  const wrap = e.target.closest?.('.dlg-wrap, #sheet-root');
  if (!wrap || e.ctrlKey) return;
  for (let el = e.target; el && el !== wrap.parentElement; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
      if (e.deltaY < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return;
    }
  }
  e.preventDefault();
}, { passive: false });
// PC 세로 메뉴: 본문 스크롤 막대 자리를 양쪽에 두는 경우(scrollbar-gutter both-edges) 그 폭만큼 메뉴도 안쪽으로 → 왼쪽·오른쪽 여백이 같게(QA L5)
function syncRailShift() {
  const m = $('#main');
  const g = m && getComputedStyle(m).scrollbarGutter.includes('both') ? (m.offsetWidth - m.clientWidth) / 2 : 0;
  document.documentElement.style.setProperty('--rail-shift', `${g}px`);
}
// 낮은 화면(높이 500px 이하, 폰·태블릿 폭): 본문을 내리면 아래 메뉴를 숨기고, 올리거나 맨 끝에 닿으면 다시 보임(QA M5)
// 숨김은 transform 만 쓰고 틀(.app-frame)이 overflow: clip 이라 숨김·보임이 바뀌어도 문서 길이가 그대로 → 맨 끝에서 위치가 튀지 않음(QA N7, style.css).
// 맨 끝 판정은 움직임이 6px 미만이어도 먼저 함(마지막 짧은 움직임으로 끝에 닿아도 숨김으로 남아 아래가 비지 않게).
const lowMq = window.matchMedia('(max-height: 500px) and (max-width: 1023px)');
let lastY = window.scrollY;
window.addEventListener('scroll', () => {
  const y = window.scrollY, root = document.documentElement;
  if (!lowMq.matches) { root.classList.remove('nav-autohide'); lastY = y; return; }
  const room = document.scrollingElement.scrollHeight - window.innerHeight - y;
  if (room <= 2) { root.classList.remove('nav-autohide'); lastY = y; return; }
  const dy = y - lastY;
  if (Math.abs(dy) < 6) return;
  root.classList.toggle('nav-autohide', dy > 0 && y > 24);
  lastY = y;
}, { passive: true });
lowMq.addEventListener?.('change', () => document.documentElement.classList.remove('nav-autohide'));
// 창 크기가 바뀌면 큰 금액 한 줄 맞춤·메뉴 여백을 다시
let fitRaf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(() => { fitNums(); syncRailShift(); }); });

// ── 본문 글자 배율(위·아래 메뉴는 그대로, 가운데 본문만) ─────────────
// 설정 슬라이더·가−/가+ 버튼. Ctrl(⌘)+휠·Ctrl(⌘)+/−/0 은 가로채지 않고 브라우저 확대에 맡김(QA M3 결정, scaleShortcuts.js).
// 손가락 핀치 줌도 막지 않음(접근성: 브라우저 확대는 늘 가능).
function setScale(v, { announce = false } = {}) {
  const prev = contentScale;
  const main = $('#main') && scroller();
  const room = main ? main.scrollHeight - main.clientHeight : 0;
  const ratio = main && room > 0 ? main.scrollTop / room : 0;
  contentScale = applyScale(saveScale(v));
  fitNums();
  if (main && room > 0) main.scrollTop = ratio * (main.scrollHeight - main.clientHeight); // 읽던 자리 유지
  syncScaleUi();
  if (announce && contentScale !== prev) {
    toast(`본문 글자 크기 ${scalePct(contentScale)}`, contentScale === 1 ? {} : { action: '기본 크기로', onAction: () => setScale(1, { announce: true }) });
  }
}
function syncScaleUi() {
  const pct = Math.round(contentScale * 100);
  const r = $('[data-content-scale]');
  if (r) { if (Number(r.value) !== pct) r.value = String(pct); r.setAttribute('aria-valuetext', `${pct}%`); }
  const o = $('[data-scale-out]'); if (o) o.textContent = `${pct}%`;
  // disabled 대신 aria-disabled: 누르던 버튼에서 키보드 포커스가 사라지지 않게
  $('[data-scale-step="-1"]')?.setAttribute('aria-disabled', String(contentScale <= SCALE_MIN));
  $('[data-scale-step="1"]')?.setAttribute('aria-disabled', String(contentScale >= SCALE_MAX));
}
const scaleBlocked = () => !state.user || !$('#main') || isSheetOpen() || !!document.querySelector('[role=alertdialog],[role=dialog]:not(.sheet)');
// Ctrl(⌘)+휠·Ctrl(⌘)+/−/0 가로채기: 지금은 꺼짐(브라우저 확대). src/lib/scaleShortcuts.js 의 INTERCEPT_BROWSER_ZOOM 한 줄로 켜고 끔
installScaleShortcuts({ getScale: () => contentScale, setScale: (v) => setScale(v, { announce: true }), blocked: scaleBlocked });
// 다른 탭에서 배율을 바꾸면 이 탭도 따라감(QA L4)
window.addEventListener('storage', (e) => {
  if (e.key !== SCALE_KEY && e.key !== null) return;
  const v = clampScale(e.newValue ?? 1);
  if (v !== contentScale) { contentScale = applyScale(v); syncScaleUi(); fitNums(); }
});

window.addEventListener('online', render);
// 앱을 켜 둔 채 날짜가 바뀌면(자정) 반복 거래 기록·오늘 기준 화면 새로 고침(QA L10)
let lastDay = null;
const dayCheck = () => {
  if (!state?.user) return;
  const t = today();
  if (lastDay && t !== lastDay) { data.postRecurring(t); render(); }
  lastDay = t;
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) dayCheck(); });
setInterval(dayCheck, 60_000);
// 종료 확인: 로그인된 뒤에, 사용자의 첫 입력에서만 센티널 히스토리를 하나 둔다.
// 페이지 로드·로그인 콜백에서 pushState 하면 Chrome 이 그 기록을 뒤로가기에서 건너뛰고
// Android 는 확인 없이 앱을 닫는다. 취소한 뒤에 다시 깔 때도 그 클릭·Escape 안에서 넣는다.
// 시트·확인 창·하위 화면은 뒤로 가기에서 먼저 닫고, 홈에서만 종료를 묻는다. Google 리다이렉트가 끝나기 전에는 켜지 않는다.
const exitGuard = createExitGuard({
  history,
  confirm: () => confirmDialog({ title: EXIT_CONFIRM_TITLE, ok: '종료', cancel: '취소', history: false }),
  closeWindow: () => window.close(),
  isHidden: () => document.visibilityState === 'hidden',
});
const navUrl = (view) => {
  const base = location.href.split('#')[0];
  return view === 'home' ? base : `${base}#${view}`;
};
const nav = createNavHistory(history, navUrl, { onStay: () => exitGuard.noteStay(location.href) });
nav.adopt(ui.view);
bindModalHistory({
  open: () => nav.pushModal('dialog'),
  close: () => nav.closeModal(),
});
// 종료 센티널은 홈(빈 스택)에서만 얹는다. 하위 화면·시트 위의 첫 탭에 얹으면
// 뒤로 가기가 부모 대신 종료 확인을 연다(새로고침 직후가 그 경우).
const onNavGesture = () => {
  if (state.user && nav.prepareFreshTrail(history.length)) {
    exitGuard.claimPushed();
    return;
  }
  if (!nav.atExitRoot()) return;
  exitGuard.onUserGesture();
};
document.addEventListener('pointerdown', onNavGesture, true);
if (import.meta.env.MODE === 'test') globalThis.__gagyebuNav = { nav, exitGuard };
document.addEventListener('keydown', (e) => {
  onNavGesture();
  if (exitGuard.isConfirming() && isExitDismissGesture(e)) exitGuard.rearm();
}, true);
document.addEventListener('click', (e) => {
  if (exitGuard.isConfirming() && isExitDismissGesture(e)) exitGuard.rearm();
}, true);
let redirectDone = false;
let suppressViewHash = false;
function showPlannedView(view) {
  if (ui.view === 'import' && view !== 'import') ui.imp = null;
  if (view === 'search' && ui.view !== 'search') { ui.searchAll = null; refreshSearch(); }
  ui.view = view;
  ui.emojiFor = null;
  if (hashView() !== view) history.replaceState(history.state, '', navUrl(view));
  exitGuard.noteStay(location.href);
  render();
  $('#main')?.focus({ preventScroll: true });
  scrollMainTop();
}
window.addEventListener('popstate', () => {
  const plan = nav.onPop({
    sheet: isSheetOpen(),
    dialog: hasModal(),
    exitReady: exitGuard.willTrap() && !exitGuard.isLeaving(),
    landed: hashView(),
  });
  if (plan.dropExit) exitGuard.forgetSentinel();
  if (plan.kind !== 'exit' && exitGuard.isConfirming()) dismissTopModal();
  if (plan.kind === 'ignore') return;
  if (plan.kind === 'dialog') { dismissTopModal(); return; }
  if (plan.kind === 'sheet') { closeSheet({ fromPop: true }); return; }
  if (plan.kind === 'import-reset') {
    ui.imp = IMP ? IMP.newImport() : null;
    render();
    return;
  }
  if (plan.kind === 'import-step') {
    if (ui.imp) { ui.imp.step = plan.step; ui.imp.error = ''; }
    render();
    return;
  }
  if (plan.kind === 'view') { showPlannedView(plan.view); return; }
  if (plan.kind === 'exit') {
    // 시트가 아직 열려 있으면 종료 확인을 그 위에 띄우지 않고 시트만 닫는다.
    if (isSheetOpen()) { closeSheet({ fromPop: true }); exitGuard.forgetSentinel(); return; }
    if (hasModal()) { dismissTopModal(); exitGuard.forgetSentinel(); return; }
    if (hashView() !== 'home' || ui.view !== 'home') {
      exitGuard.forgetSentinel();
      showPlannedView(hashView());
      return;
    }
    if (exitGuard.willTrap() || exitGuard.isLeaving() || exitGuard.isConfirming()) suppressViewHash = true;
    exitGuard.onPopState();
    queueMicrotask(() => { suppressViewHash = false; });
  }
});
window.addEventListener('hashchange', () => {
  if (suppressViewHash) return;
  if (exitGuard.isConfirming()) dismissTopModal();
  const view = hashView();
  exitGuard.noteStay(location.href);
  if (view === ui.view) return;
  nav.adopt(view);
  ui.view = view;
  render();
});
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
  initSheet({
    getState: () => state, onSave, onDelete,
    onHistory(ev) {
      if (ev === 'open') nav.pushModal('sheet');
      if (ev === 'close') nav.closeModal();
    },
  });
  data.onWriteError((e) => {
    if (e?.code === 'restored-as-new') return toast(e.message || '새 기록으로 살렸어요.');
    if (e?.code === 'permission-denied') {
      // 로그인 만료와 규칙 거부를 구분(반복 id 거부 때 '다시 로그인'은 틀린 안내였음, QA R1)
      const signedIn = !!data.state?.user;
      return toast(signedIn
        ? '저장이 거부됐어요. 문제가 계속되면 알려 주세요.'
        : '로그인이 만료됐어요. 다시 로그인해 주세요.');
    }
    return toast('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  });
  data.onLoginError((e) => { ui.loginError = data.loginErrorText(e); render(); });
  data.subscribe(schedule);
  data.initAuth();
  data.whenAuthRedirectSettled().then(() => {
    redirectDone = true;
    exitGuard.noteStay(location.href);
    exitGuard.sync({ loggedIn: !!state.user });
  });
  pickTip();
}
render();
document.fonts?.ready?.then(() => { if ($('#main')) fitNums(); });

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
