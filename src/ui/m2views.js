// M2 화면: 검색·필터, 반복 거래, 저축 목표(진행 링), 자동 분류 규칙
import { esc, numSpan } from './util.js';
import { formatWon, signedWon, shortWon, spendText } from '../lib/money.js';
import { searchTxs, hasFilter } from '../lib/search.js';
import { nextDue, monthlyFixed, detectSubscriptions } from '../lib/recurring.js';
import { goalProgress } from '../lib/goals.js';
import { ring } from './charts.js';
import { txRow } from './views.js';

const back = (to, label) => `<button class="icon-btn" data-nav="${to}" aria-label="${label}">‹</button>`;
/** 기간 고르기 → { from, to } (to 포함) */
export function rangeOf(range, m) {
  if (range === 'all') return {};
  if (range === 'month') { const e = new Date(m.p.end); e.setDate(e.getDate() - 1); return { from: m.p.start, to: e.toISOString().slice(0, 10) }; }
  const n = Number(range) || 6, d = new Date(m.today);
  d.setMonth(d.getMonth() - n);
  return { from: d.toISOString().slice(0, 10) };
}
const md = (d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;

// ── 검색·필터 ──────────────────────────────────────
export function searchView(m, ui) {
  const f = ui.search;
  const has = hasFilter(f);
  const list = has ? searchTxs(m.searchPool, { ...f, ...rangeOf(f.range, m) }, m.catMap) : [];
  const exp = list.filter((t) => t.kind === 'expense').reduce((a, t) => a + t.amount, 0);
  const inc = list.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0);
  const cats = m.categories.filter((c) => !f.kind || c.kind === f.kind);
  return `<div class="max-w-[640px] mx-auto flex flex-col gap-3">
    <div class="flex items-center gap-2">${back('home', '홈으로')}<h1 class="text-title">검색</h1></div>
    <form class="search-box" data-search-form role="search">
      <span aria-hidden="true">🔍</span>
      <input type="search" class="opt-input" data-search-q value="${esc(f.q)}" placeholder="가맹점·메모·#태그·카테고리" aria-label="검색어" enterkeyhint="search" autocomplete="off" />
    </form>
    <div class="flex flex-wrap gap-2" aria-label="필터">
      <div class="seg" role="radiogroup" aria-label="구분">${[['', '전체'], ['expense', '지출'], ['income', '수입']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${(f.kind || '') === v}" data-search-kind="${v}">${l}</button>`).join('')}</div>
      <select class="select" data-search-f="categoryId" aria-label="카테고리"><option value="">모든 카테고리</option>${cats.map((c) => `<option value="${esc(c.id)}" ${f.categoryId === c.id ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select>
      <select class="select" data-search-f="accountId" aria-label="결제수단"><option value="">모든 결제수단</option>${m.accounts.map((a) => `<option value="${esc(a.id)}" ${f.accountId === a.id ? 'selected' : ''}>${esc(a.emoji || '')} ${esc(a.name)}</option>`).join('')}</select>
      <select class="select" data-search-f="range" aria-label="기간">${[['3', '최근 3개월'], ['6', '최근 6개월'], ['month', '보고 있는 달'], ['all', '전체 기간']].map(([v, l]) => `<option value="${v}" ${f.range === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="inline-flex flex-wrap max-w-full items-center gap-1 text-caption text-ink-sub"><input class="amount-in" inputmode="numeric" data-search-amt="min" value="${f.min ?? ''}" placeholder="최소" aria-label="최소 금액(원)" />~<input class="amount-in" inputmode="numeric" data-search-amt="max" value="${f.max ?? ''}" placeholder="최대" aria-label="최대 금액(원)" />원</span>
      ${has ? '<button type="button" class="chip" data-search-clear>✕ 필터 지우기</button>' : ''}
    </div>
    ${m.searchLoading ? '<p class="text-body text-ink-sub" role="status">기록을 불러오는 중…</p>' : ''}
    <section class="card-solid p-4" aria-live="polite" aria-labelledby="sr-h">
      ${has ? `<div class="flex flex-wrap items-baseline justify-between gap-2"><h2 id="sr-h" class="text-head">${list.length}건</h2>
          <p class="text-caption tabular-nums"><span class="text-expense font-semibold">지출 ${spendText(exp)}</span> · <span class="text-income font-semibold">수입 ${formatWon(inc)}</span></p></div>
        ${list.length ? `<ul class="mt-2 flex flex-col gap-1">${list.slice(0, 200).map((t) => `<li class="flex items-center gap-2"><span class="text-caption text-ink-sub tabular-nums num min-w-[3rem]">${Number(t.date.slice(5, 7))}.${t.date.slice(8)}</span><ul class="flex-1 min-w-0">${txRow(m, t)}</ul></li>`).join('')}</ul>
          ${list.length > 200 ? '<p class="mt-2 text-caption text-ink-sub">앞의 200건만 보여 드려요. 조건을 더 좁혀 보세요.</p>' : ''}`
        : '<div class="py-8 text-center"><p class="text-4xl" aria-hidden="true">🔎</p><p class="mt-2 text-body text-ink-sub">맞는 기록이 없어요.</p></div>'}`
      : `<h2 id="sr-h" class="sr-only">검색 결과</h2><div class="py-6 text-center"><p class="text-4xl" aria-hidden="true">🔍</p><p class="mt-2 text-body text-ink-sub">가맹점 이름, 메모, #태그로 찾아보세요.</p>
          <div class="mt-3 flex flex-wrap justify-center gap-2">${['스타벅스', '#여행', '택시'].map((q) => `<button type="button" class="chip" data-search-try="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`}
    </section></div>`;
}

// ── 반복 거래 ───────────────────────────────────────
export function recurringView(m) {
  const list = m.recurring;
  const subs = detectSubscriptions(m.txs, list);
  return `<div class="max-w-[640px] mx-auto flex flex-col gap-3">
    <div class="flex items-center gap-2">${back('settings', '설정으로')}<h1 class="text-title">반복 거래</h1></div>
    <p class="glass px-4 py-3 text-caption">🔁 월세·구독처럼 매달 나가는 돈을 정해 두면 그날 자동으로 기록해요. 앱을 며칠 안 열어도 열 때 밀린 것까지 채워요.</p>
    <section class="card-solid p-4" aria-labelledby="rc-h">
      <div class="flex items-baseline justify-between gap-2"><h2 id="rc-h" class="text-head">매달 나가는 돈</h2><span class="text-caption text-ink-sub tabular-nums">고정비 월 ${formatWon(monthlyFixed(list))}</span></div>
      ${list.length ? `<ul class="mt-2 flex flex-col">${list.map((r) => {
        const c = m.catMap.get(r.categoryId) ?? { emoji: '🧾', name: '기타' };
        const nd = nextDue(r, m.today);
        return `<li class="flex flex-wrap items-center gap-2 min-h-[64px] py-1 border-b last:border-0" style="border-color:var(--line)">
          <span class="tx-emoji shrink-0" aria-hidden="true">${esc(c.emoji)}</span>
          <button class="flex-1 min-w-[min(100%,7em)] text-left min-h-[44px]" data-rec-edit="${esc(r.id)}">
            <span class="block text-body font-semibold break-words">${esc(r.name)}</span>
            <span class="block text-body font-semibold tabular-nums ${r.kind === 'income' ? 'text-income' : 'text-expense'}">${signedWon(r.amount, r.kind)}</span>
            <span class="block text-caption text-ink-sub">매달 ${r.dayOfMonth}일 · ${nd && r.active ? `다음 ${md(nd)}` : '꺼짐'} · ${esc(c.name)}</span><span class="sr-only">, 고치기</span></button>
          <label class="switch"><input type="checkbox" data-rec-active="${esc(r.id)}" ${r.active ? 'checked' : ''} aria-label="${esc(r.name)} 자동 기록" /><span></span></label>
          <button class="icon-btn" data-rec-del="${esc(r.id)}" aria-label="${esc(r.name)} 삭제">🗑️</button></li>`;
      }).join('')}</ul>` : '<div class="py-6 text-center"><p class="text-4xl" aria-hidden="true">🔁</p><p class="mt-2 text-body text-ink-sub">아직 반복 거래가 없어요.</p></div>'}
      <button class="btn-ghost mt-3" data-action="add-rec">＋ 반복 거래 추가</button>
      <p class="mt-2 text-caption text-ink-sub">입력 시트에서 '매달 반복'을 켜거나 저장 버튼을 길게 눌러도 만들 수 있어요.</p>
    </section>
    ${subs.length ? `<section class="card-solid p-4" aria-labelledby="sub-h"><h2 id="sub-h" class="text-head">구독 같아요</h2>
      <p class="mt-1 text-caption text-ink-sub">같은 곳에 같은 금액이 매달 비슷한 날에 나갔어요. 반복으로 등록할까요?</p>
      <ul class="mt-2 flex flex-col">${subs.map((s) => `<li class="flex flex-wrap items-center gap-x-3 min-h-[52px]"><span class="flex-1 min-w-[min(100%,9em)] text-body break-words">${esc(s.name)}<span class="block text-caption text-ink-sub">${s.months}달 · 매달 ${s.day}일쯤 · ${numSpan(formatWon(s.amount))}</span></span>
        <button class="chip" data-rec-from="${esc(s.name)}" data-amount="${s.amount}" data-day="${s.day}" data-cat="${esc(s.categoryId ?? '')}" aria-label="${esc(s.name)} 반복으로 등록">등록</button></li>`).join('')}</ul></section>` : ''}
  </div>`;
}

// ── 저축 목표(예산 화면 안 카드) ─────────────────────
export function goalsCard(m) {
  return `<section class="card-solid p-4" aria-labelledby="goal-h">
    <div class="flex items-center justify-between gap-2"><h2 id="goal-h" class="text-head">저축 목표</h2><button class="link-btn" data-action="add-goal">＋ 목표 추가</button></div>
    ${m.goals.length ? `<ul class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">${m.goals.map((g) => {
      const p = goalProgress(g, m.today);
      return `<li class="goal">
        <div class="relative w-[72px] h-[72px] shrink-0">${ring(p.pct / 100, { size: 72, stroke: 8, color: p.done ? 'var(--income)' : 'var(--primary)' })}
          <span class="absolute inset-0 grid place-items-center text-2xl" aria-hidden="true">${esc(g.emoji || '🎯')}</span></div>
        <div class="min-w-0 flex-1">
          <button class="relative block w-full text-left min-h-[44px] text-body font-semibold break-words" data-goal-edit="${esc(g.id)}" aria-label="${esc(g.name)} 목표 고치기">${esc(g.name)}</button>
          <p class="tabular-nums" role="progressbar" aria-label="${esc(g.name)} 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}" aria-valuetext="${p.pct}%, ${formatWon(g.saved || 0)} / ${formatWon(g.target)}"><b class="text-head">${p.pct}%</b> <span class="text-caption">${shortWon(g.saved || 0)} / ${shortWon(g.target)}원</span></p>
          <p class="text-caption text-ink-sub">${p.done ? '🎉 목표를 이뤘어요!' : p.perMonth ? (p.overdue ? `목표일이 지났어요 · ${numSpan(formatWon(p.left))} 남음` : `한 달에 ${numSpan(formatWon(p.perMonth))}씩 · ${p.months}달 남음`) : `${numSpan(formatWon(p.left))} 남았어요`}</p>
          <button class="chip mt-1" data-goal-add="${esc(g.id)}">＋ 모으기</button></div></li>`;
    }).join('')}</ul>` : '<p class="mt-2 text-body text-ink-sub">여행·비상금처럼 모으고 싶은 돈을 정해 보세요. 진행 링으로 보여 드려요.</p>'}
  </section>`;
}

// ── 자동 분류 규칙(설정 안 카드) ──────────────────────
export function rulesCard(m) {
  const cats = m.categories.filter((c) => c.kind === 'expense' || c.kind === 'income');
  return `<section class="card-solid p-4" aria-labelledby="s-rule">
    <h2 id="s-rule" class="text-head">자동 분류 규칙</h2>
    <p class="mt-1 text-caption text-ink-sub">메모(가맹점)에 이 글자가 있으면 가져올 때 이 카테고리로 넣어요. 분류를 고치면 규칙을 만들지 물어봐요.</p>
    ${m.rules.length ? `<ul class="mt-3 flex flex-col gap-2">${m.rules.map((r) => `<li class="cat-edit">
        <input class="name-input" value="${esc(r.match)}" maxlength="40" data-rule-match="${esc(r.id)}" aria-label="규칙 글자 ${esc(r.match)}" />
        <span aria-hidden="true">→</span>
        <select class="select !min-h-[44px] max-w-[46%]" data-rule-cat="${esc(r.id)}" aria-label="${esc(r.match)} 카테고리">${cats.map((c) => `<option value="${esc(c.id)}" ${r.categoryId === c.id ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select>
        <button class="icon-btn" data-rule-del="${esc(r.id)}" aria-label="${esc(r.match)} 규칙 삭제">🗑️</button></li>`).join('')}</ul>` : ''}
    <button class="btn-ghost mt-3" data-action="add-rule">＋ 규칙 추가</button>
  </section>`;
}
