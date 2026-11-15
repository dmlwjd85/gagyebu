import { esc } from './util.js';
import { formatWon } from '../lib/money.js';
import {
  ACCOUNT_TYPES, HOLDING_KINDS, contributed, formatPct, formatQty, formatRateBp, isaReminder,
  priceDateSummary, progressPct, summarizeAll, taxCredit, taxPrefs,
} from '../lib/assets.js';

const money = (n, cls = '') => `<span data-fit class="tabular-nums font-bold ${cls}">${esc(formatWon(n))}</span>`;
const diffText = (n) => (n > 0 ? `+${formatWon(n)}` : formatWon(n));
const pctCls = (p) => (p > 0 ? 'text-income' : p < 0 ? 'text-expense' : '');

function priceBanner(holdings) {
  const s = priceDateSummary(holdings);
  const line = s.has
    ? `시세 기준일 ${s.newest}${s.mixed ? ` · 가장 오래된 종목 ${s.oldest}` : ''}`
    : '시세 기준일 없음. 종목을 입력하면 여기에 날짜가 보여요.';
  return `<p class="glass px-4 py-3 text-body" role="status">${esc(line)}<span class="block text-caption text-ink-sub mt-1">시세는 금융위원회 주식시세정보·증권상품시세정보(한국거래소, 공공누리 4유형)예요. 이 계정 안에만 두고 바깥에 다시 올리지 않아요. 펀드 기준가는 직접 입력해요.</span></p>`;
}

function metric(label, value, cls = '') {
  return `<div class="asset-line min-w-0" role="group" aria-label="${esc(label)} ${esc(value)}"><span class="text-caption text-ink-sub shrink-0">${esc(label)}</span><span data-fit class="text-body font-bold tabular-nums min-w-0 ${cls}">${esc(value)}</span></div>`;
}

function bar(label, used, limit, detail) {
  const pct = progressPct(used, limit);
  const width = Math.min(100, pct);
  return `<div class="min-w-0"><div class="asset-line"><p class="text-body t-quiet min-w-0">${esc(label)}</p><p class="text-caption tabular-nums text-ink-sub">${esc(formatWon(used))} / ${esc(formatWon(limit))}</p></div>
    <div class="mt-1.5 h-2 rounded-full bg-line overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="${limit}" aria-valuenow="${Math.min(used, limit)}" aria-label="${esc(label)} ${pct}%"><div class="h-2 rounded-full ${pct > 100 ? 'bg-expense' : 'bg-primary'}" style="width:${width}%"></div></div>
    <p class="mt-1 text-caption text-ink-sub">${esc(detail)}</p></div>`;
}

function holdingBlock(h) {
  const priced = Number.isInteger(h.lastPrice) && h.priceDate;
  const gainCls = priced && h.lastPrice > h.avgPrice ? 'text-income' : priced && h.lastPrice < h.avgPrice ? 'text-expense' : '';
  const now = priced ? formatWon(h.lastPrice) : '시세 없음';
  const dateLine = priced ? `시세 기준일 ${h.priceDate}${h.priceSource === 'dataGoKr' ? ' · 자동' : ' · 직접'}` : '시세 기준일 없음';
  return `<div class="py-3 border-t min-w-0" style="border-color:var(--line)">
    <div class="asset-line"><p class="text-body t-quiet min-w-0 break-words">${esc(h.name)}</p><p class="text-caption text-ink-sub">${esc(HOLDING_KINDS[h.kind] || '')}${h.code ? ` ${esc(h.code)}` : ''}</p></div>
    <p class="text-caption text-ink-sub break-words">${esc(formatQty(h.qtyE4))} · 평균 ${esc(formatWon(h.avgPrice))} · 현재 <span class="${gainCls}">${esc(now)}</span></p>
    <p class="text-caption">${esc(dateLine)}</p>
    <div class="asset-actions mt-2">
      <button class="btn-ghost" data-holding-price="${esc(h.id)}">시세 고치기</button>
      <button class="btn-ghost" data-holding-edit="${esc(h.id)}">고치기</button>
      <button class="btn-ghost" data-holding-del="${esc(h.id)}">지우기</button>
    </div></div>`;
}

export function assetsView(m, ui) {
  const today = m.today;
  const year = today.slice(0, 4);
  const all = summarizeAll(m.assetAccounts, m.holdings);
  const reminders = (m.assetAccounts ?? []).map((a) => ({ account: a, reminder: isaReminder(a, today) })).filter((x) => x.reminder);
  const open = ui.assetOpen;
  const rows = all.rows.map((r) => {
    const paid = contributed(r.account.id, m.contributions, year);
    const deductible = contributed(r.account.id, m.contributions, year, { deductible: true });
    return { ...r, paid, deductible };
  });
  const accountCard = (r) => {
    const a = r.account;
    const opened = a.opened ? `개설 ${a.opened}` : '';
    const maturity = a.maturity ? `만기 ${a.maturity}` : '';
    const meta = [ACCOUNT_TYPES[a.type] || a.type, a.institution, opened, maturity].filter(Boolean).join(' · ');
    const isOpen = open === a.id;
    const contribs = (m.contributions ?? []).filter((c) => c.assetAccountId === a.id).slice().sort((x, y) => y.date.localeCompare(x.date));
    return `<section class="card-solid p-4 min-w-0" aria-labelledby="acc-${esc(a.id)}">
      <div class="asset-line gap-y-1"><h2 id="acc-${esc(a.id)}" class="text-head min-w-0 break-words">${esc(a.name)}</h2><p class="text-body font-bold tabular-nums ${pctCls(r.returnPct)}">${esc(formatPct(r.returnPct))}</p></div>
      <p class="text-caption text-ink-sub break-words">${esc(meta)}</p>
      <div class="mt-3 flex flex-col gap-1 min-w-0">
        ${metric('투자원금', formatWon(r.invested))}
        ${metric('평가', formatWon(r.valuation))}
        ${metric('손익', diffText(r.gain), pctCls(r.gain))}
      </div>
      ${r.unpriced ? `<p class="mt-2 text-caption text-ink-sub">시세 없는 종목 ${r.unpriced}개는 평가·수익률에서 빠져 있어요.</p>` : ''}
      ${a.type === 'civil' ? `<p class="mt-2 text-body">예상 연금 월 ${a.expectedPension > 0 ? money(a.expectedPension) : '—'} <span class="text-caption text-ink-sub">(총자산에 더하지 않아요)</span></p>` : ''}
      <p class="mt-2 text-caption text-ink-sub">올해 납입 ${esc(formatWon(r.paid))}${a.type === 'pension' || a.type === 'irp' || a.type === 'dc' ? ` · 세액공제 ${esc(formatWon(r.deductible))}` : ''}</p>
      <div class="asset-actions mt-3">
        <button class="btn-ghost" data-asset-open="${esc(a.id)}" aria-expanded="${isOpen}">${isOpen ? '접기' : '보유·납입'}</button>
        <button class="btn-ghost" data-holding-add="${esc(a.id)}">종목 추가</button>
        <button class="btn-ghost" data-contrib-add="${esc(a.id)}">납입 추가</button>
        <button class="btn-ghost" data-asset-edit="${esc(a.id)}">계좌 고치기</button>
        <button class="btn-ghost" data-asset-del="${esc(a.id)}">계좌 지우기</button>
      </div>
      ${isOpen ? `<div class="mt-3">
        <h3 class="text-body t-label">보유</h3>
        ${r.holdings.length ? r.holdings.map(holdingBlock).join('') : '<p class="mt-1 text-caption text-ink-sub">아직 종목이 없어요.</p>'}
        <h3 class="mt-4 text-body t-label">납입</h3>
        ${contribs.length ? `<ul class="mt-1">${contribs.map((c) => `<li class="asset-line py-2 border-t min-w-0" style="border-color:var(--line)"><span class="text-body tabular-nums">${esc(c.date)} ${esc(formatWon(c.amount))}${c.deductible ? ' · 세액공제' : ''}</span><button class="btn-ghost" data-contrib-del="${esc(c.id)}">지우기</button></li>`).join('')}</ul>` : '<p class="mt-1 text-caption text-ink-sub">납입 기록이 없어요.</p>'}
      </div>` : ''}
    </section>`;
  };
  return `<div class="flex flex-col gap-3 lg:max-w-[560px] lg:mx-auto lg:w-full">
    <div class="flex flex-wrap items-center gap-2 min-w-0"><button class="icon-btn shrink-0" data-nav="settings" aria-label="설정으로">‹</button><h1 class="text-title min-w-0">주식·연금</h1>
      <button class="btn-ghost ml-auto" data-nav="tax">올해 세액공제</button></div>
    ${priceBanner(m.holdings)}
    <section class="hero-card px-5 pt-[18px] pb-4" aria-label="총자산">
      <p class="text-caption t-label">평가 자산</p>
      <p data-fit class="text-display tabular-nums mt-1">${esc(formatWon(all.valuation))}</p>
      <p class="mt-2 text-caption">투자원금 ${esc(formatWon(all.invested))} · 손익 ${esc(diffText(all.gain))} (${esc(formatPct(all.returnPct))})</p>
      ${all.unpriced ? `<p class="mt-1 text-caption">시세 없는 종목 ${all.unpriced}개는 빠졌어요.</p>` : ''}
      ${all.civilCount ? `<p class="mt-1 text-caption">공무원연금 예상 월 ${esc(formatWon(all.civilMonthly))} · 총자산에 포함하지 않음</p>` : ''}
    </section>
    ${reminders.map(({ account, reminder }) => `<section class="card-solid p-4" role="status"><p class="text-head">ISA 만기 · ${esc(account.name)}</p><p class="mt-1 text-body break-words">만기 ${esc(reminder.maturity)}. ${esc(reminder.text)}</p></section>`).join('')}
    ${rows.length ? rows.map(accountCard).join('') : `<section class="card-solid p-4"><p class="text-body">아직 계좌가 없어요. 일반 주식, 연금저축, IRP, ISA, DC, 공무원연금을 추가해 보세요.</p></section>`}
    <button class="btn-primary self-start" data-asset-add>계좌 추가</button>
  </div>`;
}

export function taxView(m) {
  const year = m.today.slice(0, 4);
  const t = taxCredit({ accounts: m.assetAccounts, contributions: m.contributions, prefs: m.assetPrefs, year });
  const prefs = taxPrefs(m.assetPrefs);
  const rows = (m.contributions ?? [])
    .filter((c) => String(c.date || '').startsWith(year))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  const nameOf = (id) => m.assetAccounts?.find((a) => a.id === id)?.name || '계좌';
  const overPension = t.pensionPaid > t.pensionBase;
  const overExtra = t.extraPaid > t.extraBase;
  return `<div class="flex flex-col gap-3 lg:max-w-[560px] lg:mx-auto lg:w-full">
    <div class="flex items-center gap-2 min-w-0"><button class="icon-btn shrink-0" data-nav="assets" aria-label="자산으로">‹</button><h1 class="text-title min-w-0 break-words">${esc(year)}년 세액공제</h1></div>
    <p class="text-caption text-ink-sub">1월~12월 납입이에요. 세액공제에 체크한 연금저축·IRP·DC만 계산해요. 일반 주식·ISA·공무원연금은 이 한도에 넣지 않아요.</p>
    <section class="hero-card px-5 pt-[18px] pb-4" aria-label="예상 환급">
      <p class="text-caption t-label">예상 환급</p>
      <p data-fit class="text-display tabular-nums mt-1">${esc(formatWon(t.refund))}</p>
      <p class="mt-2 text-caption">공제 대상 ${esc(formatWon(t.base))} · 세율 ${esc(formatRateBp(t.rateBp))}</p>
    </section>
    <section class="card-solid p-4 flex flex-col gap-4">
      <div class="seg self-start" role="radiogroup" aria-label="세액공제율">
        <button role="radio" aria-checked="${prefs.rateChoice !== 'low'}" data-tax-rate="high">${esc(formatRateBp(prefs.rateHigh))}</button>
        <button role="radio" aria-checked="${prefs.rateChoice === 'low'}" data-tax-rate="low">${esc(formatRateBp(prefs.rateLow))}</button>
      </div>
      <p class="text-caption text-ink-sub">총급여 5,500만 원 이하(종합소득 4,500만 원 이하)면 보통 높은 세율, 넘으면 낮은 세율이에요. 법이 바뀌면 한도와 세율을 고치면 돼요.</p>
      ${bar('연금저축', t.pensionPaid, t.pensionLimit, overPension ? `납입 ${formatWon(t.pensionPaid)} 중 ${formatWon(t.pensionBase)}만 공제돼요.` : `공제에 들어가는 금액 ${formatWon(t.pensionBase)}`)}
      ${bar('연금저축+IRP+DC', t.pensionPaid + t.extraPaid, t.combinedLimit, overExtra ? `IRP·DC 납입 ${formatWon(t.extraPaid)} 중 ${formatWon(t.extraBase)}만 남은 한도에 들어가요.` : `공제 대상 합계 ${formatWon(t.base)}`)}
      <button class="btn-ghost self-start" data-tax-edit>한도·세율 고치기</button>
    </section>
    <section class="card-solid p-4" aria-labelledby="tax-list"><h2 id="tax-list" class="text-head">올해 납입</h2>
      ${rows.length ? `<ul class="mt-2">${rows.map((c) => `<li class="py-2 border-t min-w-0" style="border-color:var(--line)"><p class="text-body break-words">${esc(c.date)} · ${esc(nameOf(c.assetAccountId))}</p><p class="text-caption tabular-nums">${esc(formatWon(c.amount))}${c.deductible ? ' · 세액공제' : ' · 공제 아님'}</p></li>`).join('')}</ul>` : '<p class="mt-2 text-caption text-ink-sub">올해 납입이 없어요.</p>'}
    </section>
  </div>`;
}
