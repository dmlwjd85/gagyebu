import { esc } from './util.js';
import { formatWon, signedWon, shortWon, compactWon } from '../lib/money.js';
import { addDays, parseYmd, prettyDate, WEEK, monthLabel } from '../lib/dates.js';
import { byCategory, byDay, heatLevel } from '../lib/stats.js';
import { donut, trendBars, ring, PALETTE } from './charts.js';
import { EMOJI_CHOICES } from '../lib/defaults.js';

const catOf = (m, id) => m.catMap.get(id) ?? { emoji: '🧾', name: '기타' };

export function txRow(m, t) {
  const c = catOf(m, t.categoryId);
  const acc = m.accMap.get(t.accountId);
  const sub = [t.memo, acc?.name].filter(Boolean).join(' · ');
  return `<li><button class="tx-row" data-tx="${esc(t.id)}" aria-label="${esc(c.name)} ${t.kind === 'income' ? '수입' : '지출'} ${formatWon(t.amount)}${t.memo ? ', ' + esc(t.memo) : ''}">
    <span class="tx-emoji" aria-hidden="true">${esc(c.emoji)}</span>
    <span class="min-w-0 flex-1 text-left"><span class="block text-body truncate">${esc(c.name)}</span>
      ${sub ? `<span class="block text-caption text-ink-sub truncate">${esc(sub)}</span>` : ''}</span>
    <span class="text-body font-semibold tabular-nums ${t.kind === 'income' ? 'text-income' : 'text-expense'}">${signedWon(t.amount, t.kind)}</span>
  </button></li>`;
}

const empty = (icon, text, extra = '') => `<div class="py-8 text-center"><p class="text-4xl" aria-hidden="true">${icon}</p><p class="mt-2 text-body text-ink-sub">${esc(text)}</p>${extra}</div>`;

export function topBar(m) {
  return `<header class="flex items-center justify-between gap-2 pt-[max(12px,env(safe-area-inset-top))]">
    <div class="flex items-center gap-1">
      <button class="icon-btn" data-month="-1" aria-label="이전 달">‹</button>
      <button class="month-btn" data-month="0" aria-label="${esc(monthLabel(m.viewYm, m.sd))}, 이번 달로 이동">${esc(monthLabel(m.viewYm, m.sd))}${m.viewYm !== m.curYm ? '<span class="ml-1 text-caption text-primary">이번 달로</span>' : ''}</button>
      <button class="icon-btn" data-month="1" aria-label="다음 달" ${m.viewYm >= m.curYm ? 'disabled' : ''}>›</button>
    </div>
    <div class="flex items-center gap-1">
      ${m.offline ? '<span class="icon-btn text-base" role="status" title="오프라인: 연결되면 자동으로 올릴게요"><span aria-hidden="true">☁️</span><span class="sr-only">오프라인. 기록은 저장해 두고 연결되면 자동으로 올릴게요.</span></span>' : ''}
      <button class="icon-btn" data-action="theme" aria-label="${m.dark ? '라이트 모드로 전환' : '다크 모드로 전환'}">${m.dark ? '☀️' : '🌙'}</button>
      <button class="icon-btn" data-nav="settings" aria-label="설정">⚙️</button>
    </div></header>`;
}

export function homeView(m) {
  const w = m.weather;
  const isCur = m.viewYm === m.curYm;
  let hero;
  if (isCur && w.hasBudget) {
    hero = `<p class="text-caption font-semibold flex items-center gap-1.5"><span class="wx-icon wx-${w.weather.key}" aria-hidden="true">${w.weather.icon}</span>${w.weather.label} · ${w.weather.text}</p>
      <p class="text-body mt-2">오늘 쓸 수 있는 돈</p>
      <p class="text-display tabular-nums mt-1" id="hero-num" aria-live="polite" data-target="${w.available}">${formatWon(w.available)}</p>
      <div class="mt-3 h-2 rounded-full bg-white/25" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, w.usedPct)}" aria-label="예산 사용률">
        <div class="bar-fill h-2 rounded-full bg-white" style="--w:${Math.min(100, w.usedPct)}%"></div></div>
      <div class="mt-2 flex justify-between text-caption tabular-nums"><span>이번 달 예산 ${w.usedPct}% 사용</span><span>${w.daysLeft}일 남음${w.tomorrow != null && w.remaining > 0 ? ` · 내일 ${formatWon(w.tomorrow)}` : ''}</span></div>`;
  } else if (isCur) {
    hero = `<p class="text-caption font-semibold">🌈 한 달 예산을 정하면 돈 날씨가 떠요</p>
      <p class="text-body mt-2">이번 달 남긴 돈</p>
      <p class="text-display tabular-nums mt-1">${formatWon(m.tot.saved)}</p>
      <button class="hero-btn mt-3" data-action="budget">예산 정하기</button>`;
  } else {
    const used = m.budget?.total ? Math.round((m.tot.expense / m.budget.total) * 100) : null;
    hero = `<p class="text-caption font-semibold">📅 ${esc(monthLabel(m.viewYm, m.sd))} 돌아보기</p>
      <p class="text-body mt-2">이 달 남긴 돈</p>
      <p class="text-display tabular-nums mt-1">${formatWon(m.tot.saved)}</p>
      ${used != null ? `<p class="mt-3 text-caption">예산 ${formatWon(m.budget.total)} 중 ${used}% 사용</p>` : ''}`;
  }
  const recent = m.periodTxs.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)).slice(0, 3);
  return `<div class="view-grid">
    <div class="flex flex-col gap-3">
      <section class="hero-card px-5 pt-[18px] pb-4" aria-label="요약">${hero}</section>
      <section class="grid grid-cols-3 gap-2" aria-label="이번 달 통계">
        ${stat('지출', (m.tot.expense ? '−' : '') + compactWon(m.tot.expense), formatWon(m.tot.expense), 'text-expense')}
        ${stat('수입', (m.tot.income ? '+' : '') + compactWon(m.tot.income), formatWon(m.tot.income), 'text-income')}
        ${stat('남긴 돈', compactWon(m.tot.saved), formatWon(m.tot.saved), m.tot.saved < 0 ? 'text-expense' : '')}
      </section>
      ${m.streak || m.noSpend ? `<div class="glass px-4 py-3 text-body flex items-center gap-2"><span aria-hidden="true">🔥</span><span>${m.streak ? `${m.streak}일째 기록 중` : '오늘 기록하면 연속 기록 시작'}${m.noSpend ? ` · 이번 달 무지출 🌱 ${m.noSpend}일` : ''}</span></div>` : ''}
    </div>
    <section class="card-solid p-4" aria-labelledby="recent-h">
      <div class="flex items-center justify-between"><h2 id="recent-h" class="text-head">최근 기록</h2>
        ${m.periodTxs.length ? '<button class="link-btn" data-nav="calendar" data-mode="list">전체 보기 ›</button>' : ''}</div>
      ${!m.txLoaded ? skeleton(3) : recent.length ? `<ul class="mt-2 -mx-2">${recent.map((t) => txRow(m, t)).join('')}</ul>`
        : empty('🐣', isCur ? '아직 기록이 없어요. ＋를 눌러 첫 지출을 10초 만에 남겨 보세요.' : '이 달에는 기록이 없어요.')}
    </section></div>`;
}
const stat = (k, v, full, cls) => `<div class="glass p-3 min-w-0" aria-label="${k} ${esc(full)}"><p class="text-caption text-ink-sub" aria-hidden="true">${k}</p><p class="stat-v tabular-nums ${cls}" title="${esc(full)}" aria-hidden="true">${esc(v)}</p></div>`;
const skeleton = (n) => `<ul class="mt-2 space-y-2" aria-busy="true" aria-label="불러오는 중">${'<li class="skeleton h-12 rounded-md"></li>'.repeat(n)}</ul>`;

export function calendarView(m, ui) {
  const days = byDay(m.periodTxs);
  const max = Math.max(0, ...Object.values(days).map((d) => d.expense));
  const p = m.p;
  const lead = parseYmd(p.start).getDay();
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span aria-hidden="true"></span>';
  for (let d = p.start; d < p.end; d = addDays(d, 1)) {
    const info = days[d];
    const lv = heatLevel(info?.expense, max);
    const future = d > m.today;
    const noSpend = !future && !info?.expense && d < m.today;
    const label = `${prettyDate(d, m.today)}${info?.expense ? `, 지출 ${formatWon(info.expense)}` : ''}${info?.income ? `, 수입 ${formatWon(info.income)}` : ''}${noSpend ? ', 무지출' : ''}`;
    cells += `<button class="cal-cell heat-${lv} ${d === m.today ? 'is-today' : ''} ${d === ui.selDate ? 'is-sel' : ''} ${future ? 'opacity-50' : ''}" data-date="${d}" aria-label="${esc(label)}" aria-pressed="${d === ui.selDate}">
      <span class="text-caption font-semibold">${Number(d.slice(8))}</span>
      <span class="text-micro tabular-nums ${info?.expense ? '' : 'text-ink-sub'}">${info?.expense ? shortWon(info.expense) : noSpend ? '🌱' : info?.income ? '<span class="text-income">+</span>' : ''}</span></button>`;
  }
  const filterCat = ui.catFilter ? catOf(m, ui.catFilter) : null;
  const filtered = m.periodTxs.filter((t) => !ui.catFilter || t.categoryId === ui.catFilter);
  const head = `<div class="flex items-center justify-between gap-2">
      <h1 class="text-title">${ui.mode === 'list' ? '목록' : '달력'}</h1>
      <div class="seg" role="radiogroup" aria-label="보기 방식"><button role="radio" aria-checked="${ui.mode !== 'list'}" data-mode="cal">달력</button><button role="radio" aria-checked="${ui.mode === 'list'}" data-mode="list">목록</button></div></div>
    ${filterCat ? `<div><button class="chip" data-clear-filter aria-label="${esc(filterCat.name)} 필터 해제"><span aria-hidden="true">${esc(filterCat.emoji)}</span> ${esc(filterCat.name)}만 보는 중 ✕</button></div>` : ''}`;
  if (ui.mode === 'list') {
    const groups = {};
    filtered.forEach((t) => (groups[t.date] ||= []).push(t));
    const dates = Object.keys(groups).sort().reverse();
    return `<div class="flex flex-col gap-3">${head}
      <section class="card-solid p-4">${!m.txLoaded ? skeleton(5) : dates.length ? dates.map((d) => {
        const ex = groups[d].filter((t) => t.kind === 'expense').reduce((a, t) => a + t.amount, 0);
        return `<h2 class="mt-3 first:mt-0 flex justify-between text-caption text-ink-sub"><span>${esc(prettyDate(d, m.today))}</span>${ex ? `<span class="tabular-nums">−${formatWon(ex)}</span>` : ''}</h2>
          <ul class="-mx-2">${groups[d].map((t) => txRow(m, t)).join('')}</ul>`;
      }).join('') : empty('🗒️', '이 기간에는 기록이 없어요.')}</section></div>`;
  }
  const sel = ui.selDate && ui.selDate >= p.start && ui.selDate < p.end ? ui.selDate : null;
  const selTx = sel ? filtered.filter((t) => t.date === sel) : [];
  return `<div class="flex flex-col gap-3">${head}
    <div class="view-grid">
    <section class="card-solid p-3" aria-label="${esc(monthLabel(m.viewYm, m.sd))} 달력">
      <div class="grid grid-cols-7 text-center text-caption text-ink-sub mb-1" aria-hidden="true">${WEEK.map((w, i) => `<span class="${i === 0 ? 'text-expense' : ''}">${w}</span>`).join('')}</div>
      <div class="grid grid-cols-7 gap-1">${cells}</div>
      <div class="mt-3 flex items-center justify-end gap-1 text-micro text-ink-sub" aria-hidden="true">적게 ${[1, 2, 3, 4].map((l) => `<span class="inline-block w-4 h-4 rounded heat-${l}"></span>`).join('')} 많이</div>
    </section>
    <section class="card-solid p-4" aria-live="polite">
      ${sel ? `<div class="flex items-center justify-between"><h2 class="text-head">${esc(prettyDate(sel, m.today))}</h2>
          <button class="link-btn" data-add-on="${sel}">＋ 이날 기록</button></div>
        ${selTx.length ? `<ul class="mt-2 -mx-2">${selTx.map((t) => txRow(m, t)).join('')}</ul>` : empty('🌱', sel < m.today ? '이날은 무지출! 잘했어요.' : '아직 기록이 없어요.')}`
        : empty('👆', '날짜를 누르면 그날 기록만 모아 볼 수 있어요.')}
    </section></div></div>`;
}

export function chartView(m) {
  const exp = m.periodTxs.filter((t) => t.kind === 'expense');
  if (m.txLoaded && m.periodTxs.length < 3) return `<div class="flex flex-col gap-3"><h1 class="text-title">차트</h1><section class="card-solid p-4">${empty('📊', '기록이 3개 이상 모이면 그래프를 그려 드릴게요.')}</section>${trendCard(m)}</div>`;
  const cats = byCategory(exp);
  const top = cats.slice(0, 6);
  const rest = cats.slice(6);
  if (rest.length) top.push({ categoryId: '__rest', amount: rest.reduce((a, c) => a + c.amount, 0), share: rest.reduce((a, c) => a + c.share, 0) });
  const items = top.map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length], label: c.categoryId === '__rest' ? '그 밖의' : catOf(m, c.categoryId).name, emoji: c.categoryId === '__rest' ? '⋯' : catOf(m, c.categoryId).emoji }));
  const ins = m.insight;
  return `<div class="flex flex-col gap-3"><h1 class="text-title">차트</h1>
   <div class="view-grid">
    <section class="card-solid p-4" aria-labelledby="donut-h">
      <h2 id="donut-h" class="text-head">카테고리별 지출</h2>
      ${exp.length ? `<div class="relative mt-3">${donut(items, { total: m.tot.expense })}</div>
      <ol class="mt-4 -mx-2">${items.map((it, i) => `<li><button class="legend-row" ${it.categoryId === '__rest' ? 'disabled' : `data-filter-cat="${esc(it.categoryId)}"`} aria-label="${i + 1}위 ${esc(it.label)} ${formatWon(it.amount)} ${Math.round(it.share * 100)}%${it.categoryId === '__rest' ? '' : ', 거래 보기'}">
        <span class="w-3 h-3 rounded-full shrink-0" style="background:${it.color}" aria-hidden="true"></span>
        <span aria-hidden="true">${esc(it.emoji)}</span><span class="flex-1 text-left truncate">${esc(it.label)}</span>
        <span class="text-caption text-ink-sub tabular-nums w-10 text-right">${Math.round(it.share * 100)}%</span>
        <span class="tabular-nums font-semibold w-28 text-right">${formatWon(it.amount)}</span></button></li>`).join('')}</ol>`
        : empty('🌱', '이 기간에는 지출이 없어요.')}
    </section>
    <div class="flex flex-col gap-3">
      ${trendCard(m)}
      ${ins ? `<section class="glass p-4 flex gap-3 items-start"><span class="text-2xl" aria-hidden="true">💡</span><p class="text-body">지난달보다 <b>${esc(catOf(m, ins.categoryId).emoji)} ${esc(catOf(m, ins.categoryId).name)}</b> 지출이 <b class="text-expense">${ins.pct}%</b>(${formatWon(ins.diff)}) 늘었어요.</p></section>` : ''}
    </div></div></div>`;
}
const trendCard = (m) => `<section class="card-solid p-4" aria-labelledby="trend-h">
  <div class="flex items-center justify-between"><h2 id="trend-h" class="text-head">6개월 추이</h2>
    <span class="flex gap-3 text-caption text-ink-sub"><span><i class="inline-block w-2.5 h-2.5 rounded-sm bg-primary align-middle"></i> 지출</span><span><i class="inline-block w-2.5 h-2.5 rounded-sm bg-income align-middle"></i> 수입</span></span></div>
  <div class="mt-3">${trendBars(m.trend, { currentYm: m.viewYm })}</div>
  <p class="mt-1 text-caption text-ink-sub">이 달 남긴 돈 <b class="tabular-nums ${m.tot.saved < 0 ? 'text-expense' : 'text-ink'}">${formatWon(m.tot.saved)}</b></p></section>`;

export function budgetView(m, ui) {
  const total = m.budget?.total ?? 0;
  const spent = m.tot.expense;
  const pct = total ? spent / total : 0;
  const over = total && spent > total;
  const byCat = m.budget?.byCategory ?? {};
  const showEnv = ui.envelopes || Object.keys(byCat).length > 0;
  const spentBy = new Map(byCategory(m.periodTxs).map((c) => [c.categoryId, c.amount]));
  const w = m.weather;
  return `<div class="flex flex-col gap-3"><h1 class="text-title">예산</h1>
   <div class="view-grid">
    <section class="card-solid p-5 flex flex-col items-center text-center" aria-labelledby="bud-h">
      <h2 id="bud-h" class="sr-only">월 총예산</h2>
      ${total ? `<div class="relative">${ring(pct, { color: over ? 'var(--expense)' : 'var(--primary)' })}
          <div class="absolute inset-0 grid place-items-center"><div><p class="text-title tabular-nums">${Math.round(pct * 100)}%</p><p class="text-caption text-ink-sub">사용</p></div></div></div>
        <p class="mt-3 text-body text-ink-sub">${esc(monthLabel(m.viewYm, m.sd))} 예산</p>
        <p class="text-title tabular-nums">${formatWon(total)}</p>
        <p class="mt-1 text-body ${over ? 'text-expense font-semibold' : ''}">${over ? `${formatWon(spent - total)} 넘쳤어요` : `${formatWon(total - spent)} 남았어요`}</p>
        ${m.viewYm === m.curYm && w.hasBudget ? `<p class="mt-1 text-caption text-ink-sub">${w.daysLeft}일 남음 · 하루 권장 ${formatWon(w.base)}</p>` : ''}
        <button class="btn-ghost mt-4" data-action="budget">예산 바꾸기</button>`
      : `${empty('🌈', '한 달 예산을 정하면 돈 날씨가 떠요.')}<button class="btn-primary" data-action="budget">예산 정하기</button>`}
    </section>
    <section class="card-solid p-4" aria-labelledby="env-h">
      <div class="flex items-center justify-between gap-2"><h2 id="env-h" class="text-head">카테고리별로 나누기</h2>
        <label class="switch"><input type="checkbox" data-toggle-env ${showEnv ? 'checked' : ''} aria-label="카테고리별 예산 사용"><span></span></label></div>
      <p class="mt-1 text-caption text-ink-sub">선택 사항이에요. 봉투처럼 카테고리마다 한도를 둘 수 있어요.</p>
      ${showEnv ? `<ul class="mt-3 flex flex-col gap-3">${m.categories.filter((c) => c.kind === 'expense' && !c.archived).map((c) => {
        const lim = byCat[c.id] ?? 0, sp = spentBy.get(c.id) ?? 0, r = lim ? sp / lim : 0;
        return `<li><button class="w-full text-left" data-env="${esc(c.id)}" aria-label="${esc(c.name)} 예산 ${lim ? formatWon(lim) : '미설정'}, 사용 ${formatWon(sp)}. 누르면 바꾸기">
          <div class="flex items-center gap-2 text-body"><span aria-hidden="true">${esc(c.emoji)}</span><span class="flex-1 truncate">${esc(c.name)}</span>
          <span class="tabular-nums text-caption ${lim && sp > lim ? 'text-expense font-semibold' : 'text-ink-sub'}">${formatWon(sp)} / ${lim ? formatWon(lim) : '한도 없음'}${lim && sp > lim ? ' · 넘쳤어요' : ''}</span></div>
          <div class="mt-1.5 h-2 rounded-full bg-line"><div class="h-2 rounded-full ${lim && sp > lim ? 'bg-expense' : 'bg-primary'}" style="width:${lim ? Math.min(100, r * 100) : 0}%"></div></div></button></li>`;
      }).join('')}</ul>` : ''}
    </section></div></div>`;
}

export function settingsView(m, ui) {
  const kind = ui.catKind ?? 'expense';
  const list = m.categories.filter((c) => c.kind === kind);
  return `<div class="flex flex-col gap-3">
    <div class="flex items-center gap-2"><button class="icon-btn" data-nav="home" aria-label="뒤로">‹</button><h1 class="text-title">설정</h1></div>
    <p class="glass px-4 py-3 text-caption">🔒 광고 0 · 연동 0 · 내 데이터는 내 것. 기록은 내 계정에만 저장돼요.</p>
    <div class="view-grid">
    <div class="flex flex-col gap-3">
    <section class="card-solid p-4 flex flex-col gap-3" aria-labelledby="s-acc"><h2 id="s-acc" class="text-head">계정</h2>
      <p class="text-body">${esc(m.user?.displayName || '이름 없음')}<span class="block text-caption text-ink-sub">${esc(m.user?.email || '')}</span></p>
      <button class="btn-ghost self-start" data-action="logout">로그아웃</button></section>
    <section class="card-solid p-4 flex flex-col gap-3" aria-labelledby="s-view"><h2 id="s-view" class="text-head">화면</h2>
      <div class="seg self-start" role="radiogroup" aria-label="테마">${[['system', '시스템'], ['light', '라이트'], ['dark', '다크']].map(([v, l]) => `<button role="radio" aria-checked="${m.themeMode === v}" data-theme="${v}">${l}</button>`).join('')}</div>
      <label class="flex items-center justify-between gap-2 text-body">한 달 시작일 (월급날)
        <select class="select" data-start-day aria-label="한 달 시작일">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${m.sd === i + 1 ? 'selected' : ''}>${i + 1}일</option>`).join('')}</select></label>
      <label class="flex items-center justify-between gap-2 text-body">진동 피드백<label class="switch"><input type="checkbox" data-haptic ${localStorage.getItem('haptic') !== 'off' ? 'checked' : ''} aria-label="진동 피드백"><span></span></label></label>
      <button class="btn-ghost self-start" data-action="tips-reset">팁 다시 보기</button></section>
    <section class="card-solid p-4 flex flex-col gap-3" aria-labelledby="s-data"><h2 id="s-data" class="text-head">데이터</h2>
      <div class="flex flex-wrap gap-2"><button class="btn-ghost" data-action="csv-month">이 달 CSV 내보내기</button><button class="btn-ghost" data-action="csv-all">전체 CSV 내보내기</button></div>
      <p class="text-caption text-ink-sub">엑셀에서 바로 열 수 있어요. 파일은 이 기기에서만 만들어져요.</p>
      <button class="btn-danger self-start" data-action="delete-all">모든 기록과 계정 삭제</button></section>
    </div>
    <section class="card-solid p-4" aria-labelledby="s-cat">
      <div class="flex items-center justify-between gap-2"><h2 id="s-cat" class="text-head">카테고리</h2>
        <div class="seg" role="radiogroup" aria-label="카테고리 구분"><button role="radio" aria-checked="${kind === 'expense'}" data-cat-kind="expense">지출</button><button role="radio" aria-checked="${kind === 'income'}" data-cat-kind="income">수입</button></div></div>
      <ul class="mt-3 flex flex-col gap-2">${list.map((c, i) => `<li class="cat-edit ${c.archived ? 'opacity-70' : ''}" data-cid="${esc(c.id)}">
          <button class="emoji-btn" data-emoji-for="${esc(c.id)}" aria-label="${esc(c.name)} 이모지 바꾸기">${esc(c.emoji)}</button>
          <input class="name-input" value="${esc(c.name)}${c.archived ? '' : ''}" maxlength="20" data-name-for="${esc(c.id)}" aria-label="${esc(c.name)} 이름" />
          <button class="icon-btn" data-cat-menu="${esc(c.id)}" aria-expanded="${ui.catMenu === c.id}" aria-label="${esc(c.name)} 더 보기">⋯</button>
          ${ui.catMenu === c.id ? `<div class="w-full flex flex-wrap gap-2 pl-12 pt-1">
            <button class="chip" data-move="${esc(c.id)}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑ 위로</button>
            <button class="chip" data-move="${esc(c.id)}" data-dir="1" ${i === list.length - 1 ? 'disabled' : ''}>↓ 아래로</button>
            <button class="chip" data-archive="${esc(c.id)}">${c.archived ? '👁️ 다시 보이기' : '🙈 숨기기'}</button>
            ${c.id === 'etc' || c.id === 'etc-in' ? '' : `<button class="chip !text-expense" data-delcat="${esc(c.id)}">🗑️ 삭제</button>`}</div>` : ''}
          ${ui.emojiFor === c.id ? `<div class="emoji-pick" role="listbox" aria-label="이모지 고르기">${EMOJI_CHOICES.map((e) => `<button role="option" data-pick="${e}" aria-label="${e}">${e}</button>`).join('')}</div>` : ''}
        </li>`).join('')}</ul>
      <button class="btn-ghost mt-3" data-action="add-cat">＋ 카테고리 추가</button>
      <p class="mt-2 text-caption text-ink-sub">지운 카테고리의 기록은 '기타'로 옮겨져요.</p>
    </section></div></div>`;
}

export function loginView({ emulator, error }) {
  return `<main class="min-h-dvh grid place-items-center px-5 py-10"><div class="w-full max-w-sm flex flex-col gap-4">
    <section class="hero-card p-6"><p class="text-caption font-semibold">☀️ 내 돈 날씨</p><h1 class="mt-2 text-display">가계부</h1>
      <p class="mt-3 text-body">10초 기록, 하루 한 번 보는 내 돈 날씨.</p></section>
    <section class="card-solid p-5 flex flex-col gap-3">
      <button class="btn-google" data-action="login"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Google로 시작하기</button>
      ${emulator ? '<button class="btn-ghost" data-action="login-test">테스트 계정으로 로그인 (에뮬레이터)</button>' : ''}
      ${error ? `<p class="text-caption text-expense" role="alert">${esc(error)}</p>` : ''}
      <ul class="text-caption text-ink-sub flex flex-col gap-1"><li>🔒 기록은 내 계정에만 저장돼요. 광고·연동 없음.</li><li>📴 인터넷이 끊겨도 기록할 수 있어요.</li><li>📤 언제든 CSV로 내보낼 수 있어요.</li></ul>
    </section></div></main>`;
}

export function setupView() {
  return `<main class="min-h-dvh grid place-items-center px-5 py-10"><div class="w-full max-w-sm flex flex-col gap-4">
    <section class="hero-card p-6"><p class="text-caption font-semibold">🛠️ 준비 중</p><h1 class="mt-2 text-display">가계부</h1>
      <p class="mt-3 text-body">10초 기록, 하루 한 번 보는 내 돈 날씨.</p></section>
    <section class="card-solid p-5">
      <h2 class="text-head">설정이 필요해요</h2>
      <p class="mt-2 text-body text-ink-sub">로그인과 저장을 위한 Firebase 연결값이 아직 없어요. 관리자가 연결하면 바로 쓸 수 있어요.</p>
      <ol class="mt-3 list-decimal pl-5 text-caption text-ink-sub space-y-1">
        <li>Firebase 콘솔에서 프로젝트·웹 앱 만들기</li><li>Google 로그인과 Firestore 켜기</li><li>GitHub 저장소 Secrets에 <code>VITE_FIREBASE_*</code> 값 넣고 다시 배포</li></ol>
    </section></div></main>`;
}
