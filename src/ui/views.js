import { esc, numSpan } from './util.js';
import { formatWon, signedWon, shortWon, compactWon, isPlus, spendParts, spendText, minusWon, percents, rateNote } from '../lib/money.js';
import { addDays, parseYmd, prettyDate, WEEK, monthLabel, period, periodRangeLabel, shiftYm } from '../lib/dates.js';
import { byCategory, byDay, heatLevel, envelope, totals, trend } from '../lib/stats.js';
import { donut, trendBars, ring, PALETTE, REST_COLOR } from './charts.js';
import { EMOJI_CHOICES } from '../lib/defaults.js';
import { symbol } from './brand.js';
import { goalsCard, rulesCard } from './m2views.js';
import { summarizeAll } from '../lib/assets.js';
import { featureOn, MODES, FEATURES, allowanceFrom } from '../lib/modes.js';
import { ownerOf, spouseLabel, splitMeOf, personTotals, settleJoint, OWNERS } from '../lib/couple.js';
import { josa } from '../lib/classify.js';
import { weekDailyLeft, spentByDateFrom } from '../lib/pace.js';
import { allowanceStatus } from '../lib/allowance.js';
import { limitWarnings } from '../lib/budget.js';
import { sanitizeLook, MOOD_OPTIONS, FONT_OPTIONS, TONE_OPTIONS } from '../lib/look.js';

const feat = (m, id) => featureOn(m.features, id);

export function ownerPickHtml(selected, who, dataAttr = 'data-owner') {
  const cur = selected === '배우자' || selected === '공동' ? selected : '나';
  const label = who || '배우자';
  const opts = [['나', '나'], ['배우자', label], ['공동', '공동']];
  return `<div class="owner-picks" role="radiogroup" aria-label="누구 돈">${opts.map(([v, l]) => `<button type="button" role="radio" class="chip" aria-checked="${cur === v}" ${dataAttr}="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
}
function ownerBadge(m, t) {
  if (!feat(m, 'txOwner')) return '';
  const o = ownerOf(t);
  if (o === '나') return '';
  const who = spouseLabel(m.settings);
  if (o === '배우자' && t.kind === 'income') return `<span class="owner-chip is-deposit">${esc(who)} 입금</span>`;
  if (o === '배우자') return `<span class="owner-chip">${esc(who)}</span>`;
  return `<span class="owner-chip is-shared">공동</span>`;
}
function ownerFilterBar(m, ui) {
  if (!feat(m, 'txOwner')) return '';
  const who = spouseLabel(m.settings);
  const cur = ui?.ownerFilter && OWNERS.includes(ui.ownerFilter) ? ui.ownerFilter : '';
  const opts = [['', '전체'], ['나', '나'], ['배우자', who], ['공동', '공동']];
  const note = cur ? '<p class="text-caption text-ink-sub break-words">아래 목록·차트는 고른 사람만이에요. 누구 돈 합계는 세 사람 모두예요.</p>' : '';
  return `<div class="flex flex-col gap-2 min-w-0"><div class="seg owner-seg" role="radiogroup" aria-label="누구 돈 필터">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${cur === v}" data-owner-filter="${esc(v)}">${esc(l)}</button>`).join('')}</div>${note}</div>`;
}
function personStrip(m) {
  if (!feat(m, 'txOwner')) return '';
  const who = spouseLabel(m.settings);
  const rows = personTotals(m.periodTxs || []);
  const line = (key, label) => {
    const r = rows[key];
    return `<li class="who-row"><span class="who-name">${esc(label)}</span><span class="who-amt text-caption tabular-nums text-income">수입 ${r.income ? '+' : ''}${formatWon(r.income)}</span><span class="who-amt text-caption tabular-nums text-expense">지출 ${spendText(r.expense)}</span></li>`;
  };
  return `<section class="card-solid p-4" aria-labelledby="who-h"><h2 id="who-h" class="text-head">누구 돈</h2>
    <p class="mt-1 text-caption text-ink-sub break-words">표시가 없는 기록은 나예요. 예전 기록은 고치지 않아요.</p>
    <ul class="who-list mt-2">${line('나', '나')}${line('배우자', who)}${line('공동', '공동')}</ul></section>`;
}
function settleCard(m) {
  if (!feat(m, 'txOwner')) return '';
  const who = spouseLabel(m.settings);
  const s = settleJoint(m.periodTxs || [], splitMeOf(m.settings));
  const owe = !s.owes ? '서로 줄 돈 없음'
    : s.owes.from === '배우자' ? `${esc(josa(who, '이가'))} 나에게 ${formatWon(s.owes.amount)}`
    : `내가 ${esc(who)}에게 ${formatWon(s.owes.amount)}`;
  return `<section class="card-solid p-4" aria-labelledby="settle-h"><h2 id="settle-h" class="text-head">공동 지출 정산</h2>
    <p class="mt-1 text-caption text-ink-sub break-words">${esc(who)} 입금과 공동 수입은 정산에 넣지 않아요.</p>
    <p class="mt-1 text-body break-words">공동 지출 ${formatWon(s.joint)} · 나 ${s.splitMe}% · ${esc(who)} ${s.splitSpouse}%</p>
    <div class="who-list mt-2">
      <p class="who-row"><span class="who-name">나 부담</span><span class="who-amt tabular-nums font-semibold">${formatWon(s.me)}</span></p>
      <p class="who-row"><span class="who-name break-words">${esc(who)} 부담</span><span class="who-amt tabular-nums font-semibold">${formatWon(s.spouse)}</span></p>
    </div>
    <p class="mt-2 text-body font-semibold break-words">${owe}</p>
    <p class="mt-2 text-caption text-ink-sub break-words">공동으로 적은 지출은 이 장부를 쓰는 내가 먼저 낸 돈으로 봐요. 나의 부담은 공동 순지출 × 나의 비율 ÷ 100 을 반올림한 원이고, 0.5원은 0에서 먼 정수로 올립니다. ${esc(who)} 부담은 공동 순지출에서 나의 부담을 뺀 값이라 둘을 더하면 공동 순지출과 같습니다.</p></section>`;
}
function scopeOwner(m, ui) {
  const id = ui?.ownerFilter;
  if (!feat(m, 'txOwner') || !OWNERS.includes(id)) return m;
  const match = (t) => ownerOf(t) === id;
  const txs = (m.txs || []).filter(match);
  const periodTxs = (m.periodTxs || []).filter(match);
  let nextTrend = m.trend;
  if (m.viewYm && Number.isInteger(m.sd)) nextTrend = trend(txs, [-5, -4, -3, -2, -1, 0].map((d) => period(shiftYm(m.viewYm, d), m.sd)));
  return { ...m, txs, periodTxs, tot: totals(periodTxs), trend: nextTrend, insight: null };
}

// 설정 아래 버전 표시(package.json version, vite.config의 define)
const VERSION = typeof __APP_VERSION__ === 'string' ? `v${__APP_VERSION__}` : '';

const ACC_EMOJI = ['💳', '💵', '🏦', '📱', '🪙', '💰', '🎫', '🧾', '👛', '🏧'];
const catOf = (m, id) => m.catMap.get(id) ?? { emoji: '🧾', name: '기타' };

export function txRow(m, t) {
  const c = catOf(m, t.categoryId);
  const acc = m.accMap.get(t.accountId);
  const sub = [t.memo, acc?.name].filter(Boolean).join(' · ');
  return `<li class="swipe-li"><span class="swipe-bg" aria-hidden="true">🗑️ 삭제</span><button class="tx-row" data-tx="${esc(t.id)}">
    <span class="tx-emoji" aria-hidden="true">${esc(c.emoji)}</span>
    <span class="min-w-0 flex-1 text-left"><span class="block text-body truncate">${esc(c.name)}</span>
      ${ownerBadge(m, t)}
      ${sub ? `<span class="block text-caption text-ink-sub truncate">${esc(sub)}</span>` : ''}</span>
    <span data-fit class="num ml-auto text-body font-semibold tabular-nums ${isPlus(t) ? 'text-income' : 'text-expense'}">${signedWon(t.amount, t.kind)}</span>
  </button></li>`;
}

const empty = (icon, text, extra = '') => `<div class="py-8 text-center"><p class="text-4xl" aria-hidden="true">${icon}</p><p class="mt-2 text-body text-ink-sub">${esc(text)}</p>${extra}</div>`;

// month: 달 이동 막대(가져오기·검색·반복·설정처럼 달과 상관없는 화면에서는 숨김)
export function topBar(m, { month = true, back = null } = {}) {
  const monthName = `${Number(String(m.viewYm || '').slice(5, 7))}월`;
  const range = month && m.sd > 1 ? periodRangeLabel(m.viewYm, m.sd) : '';
  const monthText = range ? `${monthName} (${range})` : monthName;
  return `<header class="flex flex-wrap items-center justify-between gap-x-2 pt-3 ${m.offline ? 'is-offline' : ''} ${month && m.viewYm !== m.curYm ? 'is-past' : ''}">
    <div class="flex flex-wrap items-center gap-1 max-[419px]:gap-0 min-w-0">
      ${back ? `<button type="button" class="nav-home" data-nav="${esc(back.to)}" aria-label="${esc(back.label)}"><span aria-hidden="true">‹</span>${esc(back.text || '홈')}</button>` : ''}
      ${symbol('S', { cls: 'hsym mr-0.5', label: '쨈 가계부' })}
      ${month ? `<button class="icon-btn" data-month="-1" aria-label="이전 달">‹</button>
      <button class="month-btn" data-month="0" aria-label="${esc(monthText)}, 이번 달로 이동">${esc(monthName)}${m.viewYm !== m.curYm ? '<span class="ml-1 text-caption text-primary" aria-hidden="true"><span class="max-[479px]:hidden">이번 달로</span><span class="min-[480px]:hidden">↩</span></span>' : ''}</button>
      <button class="icon-btn" data-month="1" aria-label="다음 달" ${m.viewYm >= m.curYm ? 'disabled' : ''}>›</button>` : ''}
    </div>
    <div class="relative flex flex-wrap items-center gap-1 max-[419px]:gap-0 ml-auto">
      ${m.offline ? '<span class="offline-badge" role="status" title="오프라인: 연결되면 자동으로 올릴게요"><span aria-hidden="true">오프라인</span><span class="sr-only">오프라인. 기록은 저장해 두고 연결되면 자동으로 올릴게요.</span></span>' : ''}
      <button class="icon-btn" data-nav="search" aria-label="검색">🔍</button>
      <button class="icon-btn" data-action="theme" aria-label="${m.dark ? '라이트 모드로 전환' : '다크 모드로 전환'}">${m.dark ? '☀️' : '🌙'}</button>
      <button class="icon-btn" data-nav="settings" aria-label="설정">⚙️</button>
    </div>
    ${range ? `<p class="period-label" data-period-range>${esc(range)}</p>` : ''}
    </header>`;
}

export function homeView(m) {
  const w = m.weather;
  const isCur = m.viewYm === m.curYm;
  let hero;
  if (isCur && w.hasBudget) {
    hero = `<p class="text-caption font-semibold flex items-center gap-1.5"><span class="wx-icon wx-${w.weather.key}" aria-hidden="true">${w.weather.icon}</span>${w.weather.label} · ${w.weather.text}</p>
      <p class="text-body mt-2">오늘 쓸 수 있는 돈</p>
      <p data-fit class="text-display tabular-nums mt-1" id="hero-num" aria-live="polite" data-target="${w.available}">${formatWon(w.available)}</p>
      <div class="mt-3 h-2 rounded-full bg-white/25" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, w.usedPct)}" aria-label="예산 사용률">
        <div class="bar-fill h-2 rounded-full bg-white" style="--w:${Math.min(100, w.usedPct)}%"></div></div>
      <div class="mt-2 flex flex-wrap justify-between gap-x-3 text-caption tabular-nums"><span>이번 달 예산 ${w.usedPct}% 사용</span><span>${w.daysLeft}일 남음${w.tomorrow != null && w.remaining > 0 ? ` · 내일 ${formatWon(w.tomorrow)}` : ''}</span></div>`;
  } else if (isCur) {
    hero = `<p class="text-caption font-semibold">🌈 한 달 예산을 정하면 돈 날씨가 떠요</p>
      <p class="text-body mt-2">이번 달 남긴 돈</p>
      <p data-fit class="text-display tabular-nums mt-1">${formatWon(m.tot.saved)}</p>
      <button class="hero-btn mt-3" data-action="budget">예산 정하기</button>`;
  } else {
    const used = m.budget?.total ? Math.round((spendParts(m.tot.expense).spent / m.budget.total) * 100) : null;
    hero = `<p class="text-caption font-semibold">📅 ${esc(monthLabel(m.viewYm, m.sd))} 돌아보기</p>
      <p class="text-body mt-2">이 달 남긴 돈</p>
      <p data-fit class="text-display tabular-nums mt-1">${formatWon(m.tot.saved)}</p>
      ${used != null ? `<p class="mt-3 text-caption">예산 ${numSpan(formatWon(m.budget.total))} 중 ${used}% 사용</p>` : ''}`;
  }
  const recent = m.periodTxs.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)).slice(0, m.wide ? 6 : 3);
  const top3 = byCategory(m.periodTxs).filter((c) => c.amount > 0).slice(0, 3);
  return `<h1 class="sr-only">홈</h1><div class="view-grid">
    <div class="flex flex-col gap-3">
      <section class="hero-card px-5 pt-[18px] pb-4" aria-label="요약">${hero}</section>
      <section class="stat-grid" aria-label="이번 달 통계">
        ${spendStat(m.tot.expense)}
        ${stat('수입', (m.tot.income ? '+' : '') + compactWon(m.tot.income), formatWon(m.tot.income), 'text-income')}
        ${stat('남긴 돈', compactWon(m.tot.saved), formatWon(m.tot.saved), m.tot.saved < 0 ? 'text-expense' : '')}
      </section>
      ${modeHomeCards(m)}
      ${m.streak || m.noSpend ? `<div class="glass px-4 py-3 text-body flex items-center gap-2"><span aria-hidden="true">🔥</span><span>${m.streak ? `${m.streak}일째 기록 중` : '오늘 기록하면 연속 기록 시작'}${m.noSpend ? ` · 이번 달 무지출 🌱 ${m.noSpend}일` : ''}</span></div>` : ''}
      ${assetHomeLink(m)}
      <div id="tip-slot"></div>
      ${m.wide && top3.length ? `<section class="card-solid p-4" aria-labelledby="top-h"><h2 id="top-h" class="text-head">많이 쓴 곳 TOP 3</h2>
        <ol class="mt-2 -mx-2">${top3.map((c, i) => `<li><button class="legend-row" data-filter-cat="${esc(c.categoryId)}"><span class="min-w-[1.5rem] shrink-0 text-caption text-ink-sub">${i + 1}</span><span aria-hidden="true">${esc(catOf(m, c.categoryId).emoji)}</span><span class="flex-1 text-left">${esc(catOf(m, c.categoryId).name)}</span><span class="tabular-nums font-semibold">${formatWon(c.amount)}</span></button></li>`).join('')}</ol></section>` : ''}
    </div>
    <section class="card-solid p-4" aria-labelledby="recent-h">
      <div class="flex items-center justify-between"><h2 id="recent-h" class="text-head">최근 기록</h2>
        ${m.periodTxs.length ? '<button class="link-btn" data-nav="calendar" data-mode="list">전체 보기 ›</button>' : ''}</div>
      ${!m.txLoaded ? skeleton(3) : recent.length ? `<ul class="mt-2 -mx-2">${recent.map((t) => txRow(m, t)).join('')}</ul>`
        : empty('🐣', isCur ? '아직 기록이 없어요. 아래 가운데 둥근 버튼을 눌러 첫 지출을 10초 만에 남겨 보세요.' : '이 달에는 기록이 없어요.')}
    </section></div>`;
}
// 지출 칸: 환불이 더 많은 달은 '0원' + 아랫줄 '환불 +49,000원'(빼기 기호 겹침·말줄임 없음, QA N10)
// 환불이 더 많은 달: 짧은 '+4.9만'으로 한 줄 유지 → 세 칸 높이 68px(360px, QA R4)
const spendStat = (net) => {
  const { spent, refund } = spendParts(net);
  if (!refund) return stat('지출', minusWon(net, compactWon), formatWon(spent), 'text-expense');
  const short = '+' + shortWon(refund);
  return `<div class="glass p-3" role="group" aria-label="지출 0원, 환불 ${esc(formatWon(refund))}이 더 많아요"><p class="text-caption text-ink-sub" aria-hidden="true">지출</p>
    <p data-fit class="stat-v tabular-nums whitespace-nowrap" aria-hidden="true" title="환불 ${esc(formatWon(refund))}">0원 <span class="text-micro font-semibold text-income">${esc(short)}</span></p></div>`;
};
const stat = (k, v, full, cls) => `<div class="glass p-3" role="group" aria-label="${k} ${esc(full)}"><p class="text-caption text-ink-sub" aria-hidden="true">${k}</p><p data-fit class="stat-v tabular-nums ${cls}" title="${esc(full)}" aria-hidden="true">${esc(v)}</p></div>`;
const skeleton = (n) => `<ul class="mt-2 space-y-2" aria-busy="true" aria-label="불러오는 중">${'<li class="skeleton h-12 rounded-md"></li>'.repeat(n)}</ul>`;
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
function modeHomeCards(m) {
  return [feat(m, 'txOwner') ? personStrip(m) + settleCard(m) : '', feat(m, 'weekDaily') ? paceCard(m) : '', feat(m, 'allowance') ? allowanceCard(m) : '', m.mode && feat(m, 'categoryLimits') ? limitCard(m) : ''].join('');
}
function paceCells(leftLabel, leftValue, leftCls, rightLabel, rightValue, rightCls) {
  return `<div class="pace-grid mt-2">
      <p class="text-caption text-ink-sub">${leftLabel}</p>
      <p class="text-caption text-ink-sub">${rightLabel}</p>
      <p data-fit class="text-head tabular-nums ${leftCls}">${leftValue}</p>
      <p data-fit class="text-head tabular-nums ${rightCls}">${rightValue}</p>
    </div>`;
}
function paceCard(m) {
  const total = m.budget?.total ?? 0;
  if (!(total > 0)) return `<section class="card-solid p-4" aria-labelledby="pace-h"><h2 id="pace-h" class="text-head">오늘·이번 주 몫</h2><p class="mt-1 text-body text-ink-sub break-words">예산을 정하면 이번 주 몫과 오늘 몫에서 쓴 돈을 뺀 남은 돈을 보여 드려요.</p><button class="btn-ghost mt-3" data-action="budget">예산 정하기</button></section>`;
  const w = weekDailyLeft({ budget: total, p: m.p, today: m.today, spentByDate: spentByDateFrom(m.periodTxs) });
  if (!w.inPeriod) return '';
  const tone = (n) => (n < 0 ? 'text-expense' : '');
  return `<section class="card-solid p-4" aria-labelledby="pace-h"><h2 id="pace-h" class="text-head">오늘·이번 주 몫</h2>
    ${paceCells('이번 주 몫 중 남은 돈', formatWon(w.weekLeft), tone(w.weekLeft), '오늘 몫 중 남은 돈', formatWon(w.todayLeft), tone(w.todayLeft))}
    <p class="mt-2 text-caption text-ink-sub break-words">몫에서 오늘까지 쓴 돈을 뺀 남은 돈이에요. 한 달 예산을 기간의 모든 날로 나눈 뒤, 그날까지 쓴 지출을 빼요. 위의 큰 숫자는 남은 예산을 남은 날로 나눈 값이라 금액이 다를 수 있어요.</p></section>`;
}
function allowanceCard(m) {
  const a = allowanceFrom(m.settings);
  if (!(a.amount > 0)) return `<section class="card-solid p-4" aria-labelledby="alw-h"><h2 id="alw-h" class="text-head">용돈</h2><p class="mt-1 text-body text-ink-sub break-words">용돈 날과 금액을 정하면 다음 용돈까지 하루 몫을 보여 드려요.</p><button class="btn-ghost mt-3" data-action="allowance">용돈 정하기</button></section>`;
  const st = allowanceStatus({ ...a, today: m.today, txs: m.txs ?? m.periodTxs });
  const when = a.cycle === 'week' ? `매주 ${WEEKDAY[a.weekday]}요일` : `매달 ${a.day}일`;
  const next = `${Number(st.next.slice(5, 7))}월 ${Number(st.next.slice(8))}일`;
  const left = Math.max(0, st.left);
  return `<section class="card-solid p-4" aria-labelledby="alw-h"><h2 id="alw-h" class="text-head">용돈</h2>
    <p class="mt-1 text-caption text-ink-sub break-words">${when} · 다음 용돈 ${next} · ${st.days}일 남음</p>
    ${paceCells('용돈 하루 몫', formatWon(st.perDay), '', '남은 용돈', st.left < 0 ? formatWon(st.left) : formatWon(left), st.left < 0 ? 'text-expense' : '')}
    ${st.remainder > 0 && st.perDay > 0 ? `<p class="mt-2 text-caption text-ink-sub break-words">나누고 남은 ${formatWon(st.remainder)}은 마지막 날에 더해요.</p>` : ''}
    <button class="btn-ghost mt-3" data-action="allowance">용돈 고치기</button></section>`;
}
function limitCard(m) {
  const by = m.budget?.byCategory ?? {};
  if (!Object.keys(by).length) return '';
  const spent = Object.fromEntries(byCategory(m.periodTxs).map((c) => [c.categoryId, c.amount]));
  const warns = limitWarnings(by, spent, m.categories);
  if (!warns.length) return '';
  return `<section class="card-solid p-4" aria-labelledby="lim-h"><h2 id="lim-h" class="text-head">한도 알림</h2>
    <ul class="mt-2 flex flex-col gap-2">${warns.map((w) => `<li class="text-body break-words">${w.emoji} ${esc(w.name)} ${w.level === 'over' ? `한도를 ${formatWon(w.used - w.limit)} 넘겼어요` : '한도에 가까워요'}</li>`).join('')}</ul></section>`;
}
const assetHomeLink = (m) => {
  const roll = summarizeAll(m.assetAccounts, m.holdings);
  const sub = roll.rows.length ? `평가 ${formatWon(roll.valuation)}` : '계좌·납입·세액공제';
  return `<button class="glass w-full px-4 py-3 text-left flex items-center gap-2 min-h-[44px] min-w-0" data-nav="assets"><span class="shrink-0" aria-hidden="true">📈</span><span class="min-w-0 flex-1"><span class="block text-body">주식·연금</span><span class="block text-caption text-ink-sub break-words">${esc(sub)}</span></span><span class="shrink-0" aria-hidden="true">›</span></button>`;
};

export function calendarView(m, ui) {
  const days = byDay(m.periodTxs);
  const max = Math.max(0, ...Object.values(days).map((d) => d.expense));
  // 환불이 더 많은 날: 히트맵 0, 칸에 '+금액'(수입색), 읽기 문구 '환불'. 무지출은 noSpendDays와 같은 기준(양수 지출이 없는 날)
  const p = m.p;
  const lead = parseYmd(p.start).getDay();
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span aria-hidden="true"></span>';
  for (let d = p.start; d < p.end; d = addDays(d, 1)) {
    const info = days[d];
    const lv = heatLevel(info?.expense, max);
    const future = d > m.today;
    const noSpend = !future && !info?.spent && d < m.today;
    const ex = info?.expense ?? 0;
    const label = `${prettyDate(d, m.today)}${ex > 0 ? `, 지출 ${formatWon(ex)}` : ex < 0 ? `, 환불 ${formatWon(-ex)}` : ''}${info?.income ? `, 수입 ${formatWon(info.income)}` : ''}${noSpend ? ', 무지출' : ''}`;
    cells += `<button class="cal-cell heat-${lv} ${d === m.today ? 'is-today' : ''} ${d === ui.selDate ? 'is-sel' : ''} ${future ? 'is-future' : ''}" data-date="${d}" aria-pressed="${d === ui.selDate}"><span class="sr-only">${esc(label)}</span>
      <span class="text-caption font-semibold" aria-hidden="true">${Number(d.slice(8))}</span>
      <span aria-hidden="true" class="text-micro tabular-nums ${ex > 0 ? '' : ex < 0 ? 'text-income' : 'text-ink-sub'}">${ex > 0 ? shortWon(ex) : ex < 0 ? `+${shortWon(-ex)}` : noSpend ? '🌱' : info?.income ? '<span class="text-income">+</span>' : ''}</span></button>`;
  }
  const filterCat = ui.catFilter ? catOf(m, ui.catFilter) : null;
  const pool = scopeOwner(m, ui).periodTxs;
  const filtered = pool.filter((t) => !ui.catFilter || t.categoryId === ui.catFilter);
  const head = `<div class="flex flex-col gap-2 min-w-0">${ownerFilterBar(m, ui)}<div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-title">${ui.mode === 'list' ? '목록' : '달력'}</h1>
      <div class="seg" role="radiogroup" aria-label="보기 방식"><button role="radio" aria-checked="${ui.mode !== 'list'}" data-mode="cal">달력</button><button role="radio" aria-checked="${ui.mode === 'list'}" data-mode="list">목록</button></div></div>
    ${filterCat ? `<div><button class="chip" data-clear-filter aria-label="${esc(filterCat.name)} 필터 해제"><span aria-hidden="true">${esc(filterCat.emoji)}</span> ${esc(filterCat.name)}만 보는 중 ✕</button></div>` : ''}</div>`;
  if (ui.mode === 'list') {
    const groups = {};
    filtered.forEach((t) => (groups[t.date] ||= []).push(t));
    const dates = Object.keys(groups).sort().reverse();
    return `<div class="flex flex-col gap-3 lg:max-w-[560px] lg:mx-auto lg:w-full">${head}
      ${ui.mode === 'list' ? personStrip(m) : ''}
      <section class="card-solid p-4">${!m.txLoaded ? skeleton(5) : dates.length ? dates.map((d) => {
        const ex = groups[d].filter((t) => t.kind === 'expense').reduce((a, t) => a + t.amount, 0);
        return `<h2 class="mt-3 first:mt-0 flex flex-wrap justify-between gap-x-3 gap-y-1 text-caption text-ink-sub"><span class="break-words">${esc(prettyDate(d, m.today))}</span>${ex > 0 ? `<span class="tabular-nums">−${formatWon(ex)}</span>` : ex < 0 ? `<span class="tabular-nums text-income">환불 +${formatWon(-ex)}</span>` : ''}</h2>
          <ul class="-mx-2">${groups[d].map((t) => txRow(m, t)).join('')}</ul>`;
      }).join('') : empty('🗒️', '이 기간에는 기록이 없어요.')}</section></div>`;
  }
  const sel = ui.selDate && ui.selDate >= p.start && ui.selDate < p.end ? ui.selDate : null;
  const selTx = sel ? filtered.filter((t) => t.date === sel) : [];
  return `<div class="flex flex-col gap-3 lg:max-w-[560px] lg:mx-auto lg:w-full">${head}
    <div class="flex flex-col gap-3">
    <section class="card-solid p-1.5 min-[420px]:p-2.5 sm:p-3" aria-label="${esc(monthLabel(m.viewYm, m.sd))} 달력">
      <div class="grid grid-cols-7 text-center text-caption text-ink-sub mb-1" aria-hidden="true">${WEEK.map((w, i) => `<span class="${i === 0 ? 'text-expense' : ''}">${w}</span>`).join('')}</div>
      <div class="grid grid-cols-7 gap-0.5 min-[420px]:gap-1">${cells}</div>
      <div class="mt-3 flex items-center justify-end gap-1 text-micro text-ink-sub" aria-hidden="true">적게 ${[1, 2, 3, 4].map((l) => `<span class="inline-block w-4 h-4 rounded heat-${l}"></span>`).join('')} 많이</div>
    </section>
    <section class="card-solid p-4" aria-live="polite">
      ${sel ? `<div class="flex items-center justify-between"><h2 class="text-head">${esc(prettyDate(sel, m.today))}</h2>
          <button class="link-btn" data-add-on="${sel}">＋ 이날 기록</button></div>
        ${selTx.length ? `<ul class="mt-2 -mx-2">${selTx.map((t) => txRow(m, t)).join('')}</ul>` : empty('🌱', sel < m.today ? '이날은 무지출! 잘했어요.' : '아직 기록이 없어요.')}`
        : empty('👆', '날짜를 누르면 그날 기록만 모아 볼 수 있어요.')}
    </section></div></div>`;
}

export function chartView(m0, ui) {
  const m = scopeOwner(m0, ui);
  const kind = ui.chartKind ?? 'expense';
  const pills = `<div class="seg" role="radiogroup" aria-label="차트 종류">${[['expense', '지출'], ['income', '수입'], ['saved', '남긴 돈']].map(([k, l]) => `<button role="radio" aria-checked="${kind === k}" data-chart-kind="${k}">${l}</button>`).join('')}</div>`;
  const shareOn = feat(m, 'monthShare');
  const head = `<div class="flex flex-col gap-2 min-w-0"><div class="flex flex-wrap items-center justify-between gap-2"><h1 class="text-title">차트</h1>${pills}</div>
    ${ownerFilterBar(m0, ui)}${personStrip(m0)}</div>
    ${shareOn && m.periodTxs.length ? `<button class="report-btn" data-action="report"><span class="text-2xl" aria-hidden="true">📤</span><span class="flex-1 text-left min-w-0"><span class="block text-body font-semibold break-words">${Number(m.viewYm.slice(5))}월 리포트 카드 만들기</span><span class="block text-caption text-ink-sub break-words">남긴 돈·TOP 3를 이미지 한 장으로 공유해요</span></span><span aria-hidden="true">›</span></button>` : ''}
    ${shareOn && m.mode && m.periodTxs.length ? `<button class="report-btn" data-action="share-text"><span class="text-2xl shrink-0" aria-hidden="true">📝</span><span class="flex-1 text-left min-w-0"><span class="block text-body font-semibold break-words">이 달 요약을 글로 공유</span><span class="block text-caption text-ink-sub break-words">글과 이미지. 공유가 안 되면 복사하고 저장해요</span></span></button>` : ''}`;
  if (m.txLoaded && m.periodTxs.length < 3) return `<div class="flex flex-col gap-3">${head}<section class="card-solid p-4">${empty('📊', '기록이 3개 이상 모이면 그래프를 그려 드릴게요.')}</section>${trendCard(m, ui)}</div>`;
  if (kind === 'saved') return `<div class="flex flex-col gap-3">${head}<div class="view-grid">${savedCard(m)}${trendCard(m, ui)}</div></div>`;
  const sel = m.periodTxs.filter((t) => t.kind === kind);
  // 순지출(환불 차감 후)이 남은 카테고리만 도넛·비율에. 환불이 더 크거나 상쇄된 카테고리는 아래에 따로
  const all = byCategory(sel, kind);
  const cats = all.filter((c) => c.amount > 0), overs = all.filter((c) => c.over && sel.some((t) => t.categoryId === c.categoryId && t.amount < 0));
  const posSum = cats.reduce((a, c) => a + c.amount, 0);
  const top = cats.slice(0, 6), rest = cats.slice(6);
  if (rest.length) top.push({ categoryId: '__rest', amount: rest.reduce((a, c) => a + c.amount, 0), share: rest.reduce((a, c) => a + c.share, 0) });
  const pct = percents(top.map((c) => c.amount)); // 보이는 비율 합 = 100(최대 나머지 방식, QA N11)
  const items = top.map((c, i) => ({ ...c, pct: pct[i], color: c.categoryId === '__rest' ? REST_COLOR : PALETTE[i], label: c.categoryId === '__rest' ? '그 밖의' : catOf(m, c.categoryId).name, emoji: c.categoryId === '__rest' ? '⋯' : catOf(m, c.categoryId).emoji }));
  const ins = kind === 'expense' ? m.insight : null;
  const net = kind === 'expense' ? m.tot.expense : m.tot.income;
  const total = Math.max(0, net), refundOver = kind === 'expense' ? spendParts(net).refund : 0;
  const overList = overs.length ? `<h3 class="mt-4 text-caption font-semibold text-ink-sub">환불이 더 많은 카테고리(비율에서 뺐어요)</h3>
      <ul class="mt-1 -mx-2">${overs.map((c) => `<li><button class="legend-row" data-filter-cat="${esc(c.categoryId)}">
        <span class="w-3 h-3 rounded-full shrink-0 border-2" style="border-color:var(--income)" aria-hidden="true"></span>
        <span aria-hidden="true">${esc(catOf(m, c.categoryId).emoji)}</span><span class="flex-1 text-left truncate">${esc(catOf(m, c.categoryId).name)}</span>
        <span class="text-caption text-income font-semibold whitespace-nowrap">${c.amount < 0 ? '환불 초과' : '환불로 상쇄'}</span>
        <span data-fit class="num tabular-nums font-semibold min-w-[5.5rem] text-right text-income">${c.amount < 0 ? '+' : ''}${formatWon(Math.abs(c.amount))}</span></button></li>`).join('')}</ul>` : '';
  // 순지출이 남은 카테고리가 없는 달(환불만·전부 상쇄): 빈 도넛 대신 안내 문구 하나(QA N12)
  const onlyRefund = sel.length && !items.length;
  return `<div class="flex flex-col gap-3">${head}
   <div class="view-grid">
    <div class="flex flex-col gap-3">
    <section class="card-solid p-4" aria-labelledby="donut-h">
      <h2 id="donut-h" class="text-head">카테고리별 ${kind === 'expense' ? '지출' : '수입'}</h2>
      ${onlyRefund ? `<div class="py-6 text-center" role="status"><p class="text-4xl" aria-hidden="true">↩️</p>
        <p class="mt-2 text-body font-semibold">${refundOver ? `이 달에는 환불만 있어요 <span class="text-income tabular-nums whitespace-nowrap">(+${formatWon(refundOver)})</span>` : '이 달 지출은 환불로 모두 상쇄됐어요'}</p>
        <p class="mt-1 text-caption text-ink-sub">돌려받은 돈은 지출에서 빼서 봐요. 그래서 그릴 비율이 없어요.</p></div>${overList}`
      : sel.length ? `<div class="relative mt-3">${donut(items, { total, center: kind === 'expense' ? '총지출' : '총수입' })}</div>
      ${refundOver ? `<p class="mt-3 text-caption text-ink-sub">환불이 지출보다 ${numSpan(formatWon(refundOver))} 많아서 이 달 총지출은 0원으로 봐요. 비율은 지출이 남은 카테고리 합 ${numSpan(formatWon(posSum))} 기준이에요.</p>`
        : overs.length || posSum !== total ? `<p class="mt-3 text-caption text-ink-sub">비율은 환불을 뺀 뒤 지출이 남은 카테고리 합 ${numSpan(formatWon(posSum))} 기준이에요.</p>` : ''}
      <ol class="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-x-2 -mx-2">${items.map((it, i) => `<li><button class="legend-row" ${it.categoryId === '__rest' ? 'disabled' : `data-filter-cat="${esc(it.categoryId)}"`}>
        <span class="w-3 h-3 rounded-full shrink-0" style="background:${it.color}" aria-hidden="true"></span>
        <span aria-hidden="true">${esc(it.emoji)}</span><span class="flex-1 text-left truncate">${esc(it.label)}</span>
        <span class="num text-caption text-ink-sub tabular-nums min-w-[2.5rem] text-right">${it.pct}%</span>
        <span data-fit class="num tabular-nums font-semibold min-w-[5.5rem] text-right">${formatWon(it.amount)}</span></button></li>`).join('')}</ol>
      ${overList}`
        : empty('🌱', `이 기간에는 ${kind === 'expense' ? '지출' : '수입'}이 없어요.`)}
    </section>
      ${ins ? `<section class="glass p-4 flex flex-wrap gap-3 items-start"><span class="text-2xl" aria-hidden="true">💡</span><p class="flex-1 min-w-[min(100%,8em)] text-body">지난달보다 <b>${esc(catOf(m, ins.categoryId).emoji)} ${esc(catOf(m, ins.categoryId).name)}</b> 지출이 <b class="text-expense tabular-nums">${ins.pct}%</b>(${numSpan(formatWon(ins.diff))}) 늘었어요.</p></section>` : ''}
    </div>
    ${trendCard(m, ui)}
   </div></div>`;
}
const savedCard = (m) => {
  const { income, expense, saved } = m.tot;
  const rate = income ? Math.round((saved / income) * 100) : null;
  const avg = m.trend.slice(0, -1).filter((r) => r.income || r.expense);
  const avgSaved = avg.length ? Math.round(avg.reduce((a, r) => a + r.saved, 0) / avg.length) : null;
  return `<section class="card-solid p-5" aria-labelledby="saved-h">
    <h2 id="saved-h" class="text-head">이 달 남긴 돈</h2>
    <p data-fit class="mt-2 text-display tabular-nums ${saved < 0 ? 'text-expense' : 'text-income'}">${formatWon(saved)}</p>
    <dl class="mt-4 grid grid-cols-2 gap-3 text-body">
      <div><dt class="text-caption text-ink-sub">수입</dt><dd class="tabular-nums font-semibold">${formatWon(income)}</dd></div>
      <div><dt class="text-caption text-ink-sub">지출</dt><dd class="tabular-nums font-semibold">${formatWon(spendParts(expense).spent)}${spendParts(expense).refund ? `<span class="block text-caption text-income">환불 +${formatWon(spendParts(expense).refund)}</span>` : ''}</dd></div>
    </dl>
    ${rate != null ? `<div class="mt-4"><div class="flex justify-between text-caption text-ink-sub"><span>저축률</span><span class="tabular-nums font-semibold text-ink">${rate}%</span></div>
      <div class="mt-1.5 h-3 rounded-full bg-line" role="progressbar" aria-label="저축률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.max(0, Math.min(100, rate))}"><div class="h-3 rounded-full ${saved < 0 ? 'bg-expense' : 'bg-income'}" style="width:${Math.max(0, Math.min(100, rate))}%"></div></div>
      ${rateNote(m.tot) ? `<p class="mt-2 text-caption text-ink-sub">💡 ${esc(rateNote(m.tot))}</p>` : ''}</div>` : `<p class="mt-4 text-caption text-ink-sub">수입을 기록하면 저축률을 계산해 드려요.</p>`}
    ${avgSaved != null ? `<p class="mt-4 glass px-4 py-3 text-body">지난 ${avg.length}개월 평균보다 <b class="tabular-nums ${saved - avgSaved < 0 ? 'text-expense' : 'text-income'}">${saved - avgSaved < 0 ? '' : '+'}${formatWon(saved - avgSaved)}</b> ${saved - avgSaved < 0 ? '덜 남겼어요' : '더 남겼어요'}.</p>` : ''}
  </section>`;
};
const trendCard = (m, ui) => {
  const selYm = ui?.barYm && m.trend.some((r) => r.ym === ui.barYm) ? ui.barYm : m.viewYm;
  const r = m.trend.find((x) => x.ym === selYm);
  const partial = m.viewYm === m.curYm && selYm === m.curYm ? ` (${Number(m.today.slice(8))}일까지)` : '';
  return `<section class="card-solid p-4" aria-labelledby="trend-h">
  <div class="flex items-center justify-between"><h2 id="trend-h" class="text-head">6개월 추이</h2>
    <span class="flex gap-3 text-caption text-ink-sub"><span><i class="inline-block w-2.5 h-2.5 rounded-sm bg-chart-1 align-middle"></i> 지출</span><span><i class="inline-block w-2.5 h-2.5 rounded-sm bg-income align-middle"></i> 남긴 돈</span></span></div>
  <div class="mt-3">${trendBars(m.trend, { currentYm: m.viewYm, selectedYm: selYm })}</div>
  <p class="mt-2 text-body" aria-live="polite"><b>${Number(selYm.slice(5))}월${partial}</b> · 지출 <b class="tabular-nums text-chart-1">${compactWon(spendParts(r.expense).spent)}</b>${spendParts(r.expense).refund ? ` · 환불 <b class="tabular-nums text-income">+${compactWon(spendParts(r.expense).refund)}</b>` : ''} · 남긴 돈 <b class="tabular-nums ${r.saved < 0 ? 'text-expense' : 'text-income'}">${compactWon(r.saved)}</b></p></section>`;
};

export function budgetView(m, ui) {
  const total = m.budget?.total ?? 0;
  const { spent, refund: budRefund } = spendParts(m.tot.expense); // 환불이 더 많아도 사용은 0원(QA N10)
  const pct = total ? spent / total : 0;
  const over = total && spent > total;
  const byCat = m.budget?.byCategory ?? {};
  const showEnv = ui.envelopes || Object.keys(byCat).length > 0;
  const spentBy = new Map(byCategory(m.periodTxs).map((c) => [c.categoryId, c.amount]));
  const w = m.weather;
  // 하루 금액 계산은 기존과 같음: 남은 예산 ÷ 남은 일수(오늘 포함). 화면만 큰 숫자로 바꿈
  const daily = m.viewYm === m.curYm && w.hasBudget && w.remaining > 0 ? Math.floor(w.remaining / w.daysLeft) : null;
  const tone = over ? 'over' : 'ok';
  const ink = over ? 'text-expense' : 'text-income';
  const statusPhrase = over ? `${numSpan(formatWon(spent - total))} 넘쳤어요` : `${numSpan(formatWon(total - spent))} 남았어요`;
  const statusWon = formatWon(over ? spent - total : total - spent);
  const statusBlock = (numCls) => `<p class="sr-only">${statusPhrase}</p>
        <p class="bud-kicker" aria-hidden="true">${over ? '예산보다' : '남은 돈'}</p>
        <p data-fit class="${numCls}" aria-hidden="true">${statusWon}</p>
        <p class="bud-sub ${ink}" aria-hidden="true">${over ? '넘쳤어요' : '남았어요'}</p>`;
  const summary = daily != null
    ? `<div class="bud-hero">
        <p class="bud-kicker">하루</p>
        <p data-fit class="bud-hero-num">${formatWon(daily)}</p>
        <p class="bud-sub">씩 쓰면 딱 맞아요</p>
        <p class="bud-meta">${w.daysLeft}일 남음</p>
      </div>
      <div class="bud-chip is-${tone}">${statusBlock('bud-chip-num')}</div>`
    : `<div class="bud-hero is-${tone}">${statusBlock('bud-hero-num')}</div>`;
  return `<div class="flex flex-col gap-3"><h1 class="text-title">예산</h1>
   <div class="view-grid">
    <section class="card-solid p-4 flex flex-col items-stretch text-center" aria-labelledby="bud-h">
      <h2 id="bud-h" class="sr-only">월 총예산</h2>
      ${total ? `<div class="bud-summary">${summary}
        <div class="bud-use">
          <div class="bud-ring" aria-hidden="true">${ring(pct, { size: 84, stroke: 9, color: over ? 'var(--expense)' : 'var(--primary)' })}</div>
          <div class="bud-facts">
            <p class="bud-fact"><span class="bud-fact-num tabular-nums">${Math.round(pct * 100)}%</span> <span class="bud-fact-k">사용</span></p>
            <p class="bud-fact"><span class="bud-fact-k">${esc(monthLabel(m.viewYm, m.sd))} 예산</span> <span class="bud-fact-num tabular-nums">${formatWon(total)}</span></p>
          </div>
        </div>
        ${budRefund ? `<p class="bud-meta text-income font-semibold">환불 +${numSpan(formatWon(budRefund))}이 지출보다 많아 사용 0원으로 봐요</p>` : ''}
        <button class="btn-ghost self-center" data-action="budget">예산 바꾸기</button></div>`
      : `${empty('🌈', '한 달 예산을 정하면 돈 날씨가 떠요.')}<button class="btn-primary self-center" data-action="budget">예산 정하기</button>`}
    </section>
    ${feat(m, 'categoryLimits') ? `<section class="card-solid p-4" aria-labelledby="env-h">
      <div class="flex items-center justify-between gap-2"><h2 id="env-h" class="text-head">나눠서 관리</h2>
        <label class="switch"><input type="checkbox" data-toggle-env ${showEnv ? 'checked' : ''} aria-label="카테고리별로 나눠서 관리"><span></span></label></div>
      <p class="mt-1 text-caption text-ink-sub">선택 사항이에요. 봉투처럼 카테고리마다 한도를 둘 수 있어요.</p>
      ${showEnv ? `<ul class="mt-3 flex flex-col gap-3">${m.categories.filter((c) => c.kind === 'expense' && !c.archived).map((c) => {
        const lim = byCat[c.id] ?? 0, sp = spentBy.get(c.id) ?? 0, e = envelope(sp, lim);
        return `<li><button class="w-full min-h-[44px] py-1 text-left" data-env="${esc(c.id)}">
          <div class="bud-env-row text-body"><span aria-hidden="true">${esc(c.emoji)}</span><span class="bud-env-name">${esc(c.name)}</span>
          <span class="bud-env-amt tabular-nums text-caption ${e.over ? 'text-expense font-semibold' : 'text-ink-sub'}">${formatWon(e.used)} / ${lim ? formatWon(lim) : '한도 없음'}</span></div>
          <div class="mt-1.5 h-2 rounded-full bg-line overflow-hidden"><div class="h-2 rounded-full ${e.over ? 'bg-expense' : e.near ? 'bg-chart-3' : 'bg-primary'}" style="width:${e.width}%"></div></div>
          ${e.over ? `<p class="mt-1 text-caption text-expense font-semibold">${numSpan(formatWon(e.used - lim))} 넘쳤어요</p>` : e.near ? `<p class="mt-1 text-caption text-chart-3 font-semibold">한도의 ${e.pct}%예요</p>` : ''}
          ${e.refund ? `<p class="mt-1 text-caption text-income font-semibold">환불 +${numSpan(formatWon(e.refund))}이 더 많아 사용 0원으로 봐요</p>` : ''}</button></li>`;
      }).join('')}</ul>` : ''}
    </section>` : ''}
    ${feat(m, 'piggy') ? goalsCard(m, { piggy: !!m.mode }) : ''}</div></div>`;
}

// 본문 글자 크기: 위·아래 메뉴는 그대로 두고 가운데 내용만(설정값은 이 기기에만 저장)
const scaleControl = (v) => {
  const pct = Math.round(v * 100);
  return `<div class="flex flex-col gap-1" role="group" aria-labelledby="s-scale">
      <div class="flex items-center justify-between gap-2 text-body"><label id="s-scale" for="content-scale">본문 글자 크기</label><output for="content-scale" class="text-caption font-semibold text-primary tabular-nums" data-scale-out>${pct}%</output></div>
      <div class="flex items-center gap-2">
        <button class="scale-btn text-caption" data-scale-step="-1" aria-label="본문 글자 작게" aria-disabled="${v <= 0.85}">가−</button>
        <input id="content-scale" class="range flex-1" type="range" min="85" max="160" step="5" value="${pct}" aria-valuetext="${pct}%" data-content-scale />
        <button class="scale-btn text-body" data-scale-step="1" aria-label="본문 글자 크게" aria-disabled="${v >= 1.6}">가+</button>
      </div>
      <p class="text-caption text-ink-sub">위·아래 메뉴는 그대로 두고 가운데 내용만 커지거나 작아져요. 화면 전체를 키우려면 브라우저 확대(Ctrl(맥은 ⌘) + +/−)를 쓰면 돼요. Ctrl + <span class="tabular-nums">0</span>은 브라우저 확대를 기본으로 돌려요.</p>
      <button class="btn-ghost self-start" data-scale-reset>기본 크기로</button>
    </div>`;
};

function lookControls(m) {
  const look = sanitizeLook(m.look);
  const swatch = (colors) => colors.map((c, i) => `--sw${i + 1}:${c}`).join(';');
  return `<div class="flex flex-col gap-2 min-w-0">
      <p id="s-mood" class="text-body">분위기</p>
      <div class="look-grid" role="radiogroup" aria-labelledby="s-mood">${MOOD_OPTIONS.map((o) => `<button type="button" class="look-pick" role="radio" aria-checked="${look.mood === o.id}" data-mood="${o.id}">
        <span class="look-swatch" style="${swatch(o.sw)}" aria-hidden="true"></span><span class="look-name">${o.label}</span></button>`).join('')}</div>
      <p id="s-tone" class="text-body">톤 적용 부분</p>
      <div class="look-grid" role="group" aria-labelledby="s-tone">${TONE_OPTIONS.map((o) => `<label class="look-pick"><input class="sr-only" type="checkbox" data-tone-part="${o.id}" ${look.tone[o.id] ? 'checked' : ''}><span class="look-name">${o.label}</span></label>`).join('')}</div>
      <p id="s-font" class="text-body">글꼴</p>
      <div class="look-grid" role="radiogroup" aria-labelledby="s-font">${FONT_OPTIONS.map((o) => `<button type="button" class="look-pick" role="radio" aria-checked="${look.font === o.id}" data-font-pick="${o.id}"><span class="look-name">${o.label}</span></button>`).join('')}</div>
      <p class="text-caption text-ink-sub">시스템 기본은 이 기기 글꼴이에요. Pretendard와 나눔스퀘어라운드(나눔라운드)는 SIL OFL 1.1이라 앱에 실어 배포해요. 예전에 손글씨로 저장한 설정도 이 글꼴로 보여요.</p>
    </div>`;
}

function selectedStartDay(m) {
  const n = m.settings?.monthStartDay;
  if (Number.isInteger(n) && n >= 1 && n <= 31) return n;
  if (Number.isInteger(m.storedStart) && m.storedStart >= 1 && m.storedStart <= 28) return m.storedStart;
  if (Number.isInteger(m.sd) && m.sd >= 1 && m.sd <= 31) return m.sd;
  return 1;
}

function startDayPicker(m) {
  const sel = selectedStartDay(m);
  const tiles = Array.from({ length: 31 }, (_, i) => {
    const n = i + 1;
    return `<button type="button" class="day-tile" role="radio" data-start-day="${n}" aria-checked="${n === sel}">${n}</button>`;
  }).join('');
  return `<div class="flex flex-col gap-2 min-w-0">
      <p id="s-start" class="text-body">한 달 시작일 (월급날)</p>
      <div class="day-grid" role="radiogroup" aria-labelledby="s-start">${tiles}</div>
      <p class="text-caption text-ink-sub">이 날부터 다음 달 전날까지를 한 달로 봐요. 그 날이 없는 달은 그 달 마지막 날부터예요.</p>
    </div>`;
}

export function settingsView(m, ui) {
  const kind = ui.catKind ?? 'expense';
  const list = m.categories.filter((c) => c.kind === kind);
  return `<div class="flex flex-col gap-3">
    <h1 class="text-title">설정</h1>
    <p class="glass px-4 py-3 text-caption">🔒 광고 0 · 알림 스팸 0 · 내 데이터는 내 것. 기록은 내 계정에만 저장돼요.</p>
    <div class="view-grid">
    <div class="flex flex-col gap-3">
    ${modeSettings(m)}
    <section class="card-solid p-4 flex flex-col gap-3" aria-labelledby="s-acc"><h2 id="s-acc" class="text-head">계정</h2>
      <p class="text-body">${esc(m.user?.displayName || '이름 없음')}<span class="block text-caption text-ink-sub">${esc(m.user?.email || '')}</span></p>
      <button class="btn-ghost self-start" data-action="logout">로그아웃</button></section>
    <section class="card-solid p-4 flex flex-col gap-3" aria-labelledby="s-view"><h2 id="s-view" class="text-head">화면</h2>
      <div class="seg self-start" role="radiogroup" aria-label="테마">${[['system', '시스템'], ['light', '라이트'], ['dark', '다크']].map(([v, l]) => `<button role="radio" aria-checked="${m.themeMode === v}" data-theme="${v}">${l}</button>`).join('')}</div>
      ${lookControls(m)}
      ${feat(m, 'monthStart') ? startDayPicker(m) : ''}
      <label class="flex items-center justify-between gap-2 text-body">진동 피드백<label class="switch"><input type="checkbox" data-haptic ${localStorage.getItem('haptic') !== 'off' ? 'checked' : ''} aria-label="진동 피드백"><span></span></label></label>
      ${scaleControl(m.contentScale ?? 1)}
      <button class="btn-ghost self-start" data-action="tips-reset">팁 다시 보기</button></section>
    <section class="card-solid p-4 flex flex-col gap-3" aria-labelledby="s-data"><h2 id="s-data" class="text-head">데이터</h2>
      <button class="set-link" data-nav="assets"><span aria-hidden="true">📈</span><span class="flex-1 text-left min-w-0">주식·연금 계좌<span class="block text-caption text-ink-sub break-words">평가·납입·세액공제·ISA 만기</span></span><span aria-hidden="true">›</span></button>
      <button class="set-link" data-nav="import"><span aria-hidden="true">📥</span><span class="flex-1 text-left">카드사·은행 파일 가져오기<span class="block text-caption text-ink-sub">엑셀·CSV · 중복은 알아서 걸러요</span></span><span aria-hidden="true">›</span></button>
      ${feat(m, 'recurring') ? `<button class="set-link" data-nav="recurring"><span aria-hidden="true">🔁</span><span class="flex-1 text-left min-w-0">반복 거래<span class="block text-caption text-ink-sub break-words">${m.recurring.length ? `${m.recurring.filter((r) => r.active).length}개 켜짐 · 월세·구독 자동 기록` : '월세·구독 자동 기록'}</span></span><span aria-hidden="true">›</span></button>` : ''}
      <div class="flex flex-wrap gap-2"><button class="btn-ghost" data-action="csv-month">이 달 CSV 내보내기</button><button class="btn-ghost" data-action="csv-all">전체 CSV 내보내기</button><button class="btn-ghost" data-action="json-all">JSON 백업</button><button class="btn-ghost" data-action="json-in">JSON 복원</button></div>
      <p class="text-caption text-ink-sub">엑셀에서 바로 열 수 있어요. 파일은 이 기기에서만 만들어져요.</p>
      <button class="btn-danger self-start" data-action="delete-all">모든 기록과 계정 삭제</button></section>
    </div>
    <div class="flex flex-col gap-3">
    <section class="card-solid p-4" aria-labelledby="s-pay">
      <h2 id="s-pay" class="text-head">결제수단</h2>
      <p class="mt-1 text-caption text-ink-sub">카드·계좌 번호는 저장하지 않아요. 이름만 적어 주세요(예: 생활비 카드).</p>
      <ul class="mt-3 flex flex-col gap-2">${m.accounts.map((a) => `<li class="cat-edit">
          <button class="emoji-btn" data-acc-emoji="${esc(a.id)}" aria-label="${esc(a.name)} 이모지 바꾸기">${esc(a.emoji || '💳')}</button>
          <input class="name-input" value="${esc(a.name)}" maxlength="20" data-acc-name="${esc(a.id)}" aria-label="${esc(a.name)} 이름" />
          <select class="select !min-h-[44px] w-[88px]" data-acc-type="${esc(a.id)}" aria-label="${esc(a.name)} 종류">${[['card', '카드'], ['cash', '현금'], ['bank', '계좌']].map(([v, l]) => `<option value="${v}" ${a.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <button class="icon-btn" data-acc-del="${esc(a.id)}" aria-label="${esc(a.name)} 삭제" ${m.accounts.length <= 1 ? 'disabled' : ''}>🗑️</button>
          ${ui.accEmojiFor === a.id ? `<div class="emoji-pick" role="listbox" aria-label="이모지 고르기">${ACC_EMOJI.map((e) => `<button role="option" data-acc-pick="${e}" aria-label="${e}">${e}</button>`).join('')}</div>` : ''}
        </li>`).join('')}</ul>
      <button class="btn-ghost mt-3" data-action="add-acc">＋ 결제수단 추가</button>
    </section>
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
    </section>
    ${rulesCard(m)}</div></div>
    <p class="flex items-center justify-center gap-1.5 mt-2 text-caption text-ink-sub">${symbol('S', { cls: 'versym' })}쨈 가계부 ${VERSION}</p></div>`;
}

function couplePrefs(m) {
  if (!feat(m, 'txOwner')) return '';
  const name = typeof m.settings?.spouseName === 'string' ? m.settings.spouseName : '';
  const split = splitMeOf(m.settings);
  const who = spouseLabel(m.settings);
  return `<div class="flex flex-col gap-2 min-w-0">
    <label class="opt-row"><span class="opt-k">배우자 이름</span>
      <input class="name-input" maxlength="20" data-spouse-name value="${esc(name)}" placeholder="배우자" aria-label="배우자 이름" /></label>
    <div class="min-w-0">
      <p id="s-split" class="text-body">공동 지출 비율</p>
      <p class="text-caption font-semibold break-words tabular-nums" data-split-out>나 ${split}% · ${esc(who)} ${100 - split}%</p>
      <input class="range" type="range" min="0" max="100" step="1" value="${split}" data-split-me aria-labelledby="s-split" aria-valuetext="나 ${split}퍼센트" />
      <p class="text-caption text-ink-sub break-words">공동으로 적은 지출만 나눕니다. 나의 부담은 공동 순지출 × 이 비율 ÷ 100 을 반올림한 원이고, 0.5원은 0에서 먼 정수로 올립니다. 나머지 원은 ${esc(who)} 부담이에요.</p>
    </div>
    <p class="text-caption text-ink-sub break-words">기록에 나·배우자·공동을 붙일 수 있어요. 표시가 없는 예전 기록은 나로 보고, 그 문서에는 필드를 쓰지 않아요.</p>
  </div>`;
}
function modeSettings(m) {
  const mode = m.mode || null;
  const cur = MODES.find((x) => x.id === mode);
  return `<section class="card-solid p-4 flex flex-col gap-3" aria-labelledby="s-mode"><h2 id="s-mode" class="text-head">쓰는 방식</h2>
    <p class="text-caption text-ink-sub break-words">${cur ? `${cur.label}에 필요한 메뉴만 보여요. 기능은 아래에서 하나씩 켜고 끌 수 있어요.` : '아직 고르지 않았어요. 고르기 전에는 지금 메뉴가 그대로예요.'}</p>
    <div class="mode-grid" role="radiogroup" aria-label="쓰는 방식">${MODES.map((md) => `<button type="button" class="mode-pick ${mode === md.id ? 'on' : ''}" role="radio" aria-checked="${mode === md.id}" data-set-mode="${md.id}">
      <span class="text-2xl shrink-0" aria-hidden="true">${md.emoji}</span>
      <span class="mode-copy"><span class="text-body font-semibold">${md.label}</span><span class="text-caption text-ink-sub">${md.blurb}</span></span>
    </button>`).join('')}</div>
    ${couplePrefs(m)}
    <ul class="flex flex-col">${FEATURES.map((f) => `<li class="feat-row"><span class="feat-copy"><span class="block text-body">${f.label}</span><span class="block text-caption text-ink-sub">${f.hint}</span></span>
      <label class="switch shrink-0"><input type="checkbox" data-feat="${f.id}" ${feat(m, f.id) ? 'checked' : ''} aria-label="${f.label}" /><span></span></label></li>`).join('')}</ul>
  </section>`;
}

export function onboardingView() {
  return `<div class="max-w-[420px] mx-auto flex flex-col gap-3"><h1 class="text-title">어떻게 쓰시나요?</h1>
    <p class="text-body text-ink-sub break-words">쓰는 방식에 맞춰 메뉴를 줄여 드려요. 설정에서 언제든 바꿀 수 있고, 기능은 하나씩 섞을 수 있어요.</p>
    <div class="mode-grid">${MODES.map((md) => `<button type="button" class="mode-pick" data-pick-mode="${md.id}">
      <span class="text-2xl shrink-0" aria-hidden="true">${md.emoji}</span>
      <span class="mode-copy"><span class="text-body font-semibold">${md.label}</span><span class="text-caption text-ink-sub">${md.blurb}</span></span>
    </button>`).join('')}</div>
    <button type="button" class="btn-ghost mode-later" data-mode-later>나중에 고를게요. 지금 메뉴는 그대로 둘게요.</button></div>`;
}

export function loginView({ emulator, error }) {
  return { caption: '☀️ 내 돈 날씨', card: `
      <button class="btn-google" data-action="login"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Google로 시작하기</button>
      ${emulator ? '<button class="btn-ghost" data-action="login-test">테스트 계정으로 로그인 (에뮬레이터)</button>' : ''}
      ${error ? `<p class="text-caption text-expense" role="alert">${esc(error)}</p>` : ''}
      <ul class="text-caption text-ink-sub flex flex-col gap-1"><li>🔒 기록은 내 계정에만 저장돼요. 광고·연동 없음.</li><li>📴 인터넷이 끊겨도 기록할 수 있어요.</li><li>📤 언제든 CSV로 내보낼 수 있어요.</li></ul>` };
}

export function setupView() {
  return { caption: '🛠️ 준비 중', card: `
      <h2 class="text-head">설정이 필요해요</h2>
      <p class="text-body text-ink-sub">로그인과 저장을 위한 Firebase 연결값이 아직 없어요. 관리자가 연결하면 바로 쓸 수 있어요.</p>
      <ol class="list-decimal pl-5 text-caption text-ink-sub space-y-1">
        <li>Firebase 콘솔에서 프로젝트·웹 앱 만들기</li><li>Google 로그인과 Firestore 켜기</li><li>GitHub 저장소 Secrets에 <code>VITE_FIREBASE_*</code> 값 넣고 다시 배포</li></ol>` };
}
