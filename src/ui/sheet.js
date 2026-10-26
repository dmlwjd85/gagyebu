// 10초 입력 시트: 쨈 컵 버튼 → 숫자 → 카테고리 → 저장
import { esc, $, $$, haptic, confirmDialog, fitNums } from './util.js';
import { formatWon } from '../lib/money.js';
import { ymd, prettyDate, parseYmd, WEEK } from '../lib/dates.js';
const longDate = (d, today) => { const x = parseYmd(d); return `${x.getFullYear()}년 ${x.getMonth() + 1}월 ${x.getDate()}일 (${WEEK[x.getDay()]})${d === today ? ' · 오늘' : ''}`; };
import { validateTx, MAX_AMOUNT, MAX_MEMO } from '../lib/validate.js';
import { suggestOrder } from '../lib/defaults.js';
import { withKeptFields } from '../lib/txedit.js';
import {
  smsPasteRow, smsHtml, blankSms, fillFromClipboard, applySmsText, setSmsStatus,
  applySmsInput, smsTx, advanceSms,
} from './smsSheet.js';
import { ownerPickHtml } from './views.js';
import { ownerOf, ownerForSave, spouseLabel } from '../lib/couple.js';
import { createTapBurst } from './fabPop.js';

let el, ctx, s, lastFocus, longPressAt = 0;
const burst = createTapBurst(), keyBurst = createTapBurst();
const recentKey = 'recentCats';
const recentIds = () => { try { return JSON.parse(localStorage.getItem(recentKey)) || []; } catch { return []; } };
const pushRecent = (id) => localStorage.setItem(recentKey, JSON.stringify([id, ...recentIds().filter((x) => x !== id)].slice(0, 8)));

export function initSheet(context) {
  ctx = context; // { getState, onSave, onDelete }
  el = document.createElement('div');
  el.id = 'sheet-root';
  el.innerHTML = `<div class="sheet-backdrop" data-close></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1"></section>`;
  document.body.append(el);
  // 연타 보호(fabPop.js createTapBurst): 쨈 컵 버튼을 누른 손가락이 이어서 시트에 떨어지면 바탕·저장·자판 어디에도 닿지 않게.
  // 가장 먼저 도는 window 캡처 단계에서 pointerdown 을 끊고(길게 누르기 저장도 시작 안 됨) 뒤따르는 click 도 버림.
  let swallowClick = false;
  window.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    const fab = e.target.closest?.('.fab');
    if (fab) { burst.fromButton(e.timeStamp, fab.getBoundingClientRect()); return; }
    if (el.contains(e.target) && burst.swallow(e.timeStamp, e.clientX, e.clientY)) { swallowClick = true; e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  // 키보드: 컵에서 시작된 Enter·Space 연타(키 반복 포함)가 시트로 넘어온 초점에 떨어져 저장 검사를 돌리지 않게(QA 3차 N2).
  // 마지막 Enter·Space 뒤 400ms 안의 Enter·Space 만 무시, 숫자·Tab 등 다른 키를 누르면 묶음이 끝나 그 뒤 Enter 저장은 정상.
  window.addEventListener('keydown', (e) => {
    const act = e.key === 'Enter' || e.key === ' ';
    if (!act) { keyBurst.reset(); return; }
    if (e.target.closest?.('.fab')) { keyBurst.fromButton(e.timeStamp); return; }
    if (el.contains(e.target) && keyBurst.swallow(e.timeStamp)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  el.addEventListener('click', (e) => { if (swallowClick && e.detail > 0) { swallowClick = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);
  el.addEventListener('change', onInput);
  el.addEventListener('paste', onPaste);
  // 저장 길게 누르기(0.6초) = 매달 반복으로 저장
  let lp;
  el.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('[data-save]') || s.id || ctx.getState().features?.recurring === false) return;
    lp = setTimeout(() => { longPressAt = Date.now(); s.repeat = true; haptic(20); save(); }, 600);
  });
  const stop = () => clearTimeout(lp);
  el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop);
  document.addEventListener('keydown', onKey);
}
export const isSheetOpen = () => el?.classList.contains('open');

export function openSheet(tx = null, { date } = {}) {
  const st = ctx.getState();
  lastFocus = document.activeElement;
  const lastAcc = localStorage.getItem('lastAccount');
  s = tx
    ? { id: tx.id, orig: tx, refund: tx.amount < 0, createdAt: tx.createdAt, kind: tx.kind, digits: String(Math.abs(tx.amount)), categoryId: tx.categoryId, date: tx.date, accountId: tx.accountId ?? '', memo: tx.memo ?? '', owner: ownerOf(tx), more: false, showOpts: true, error: '' }
    : { kind: 'expense', digits: '', categoryId: null, date: date ?? ymd(new Date()), accountId: st.accounts.some((a) => a.id === lastAcc) ? lastAcc : st.accounts[0]?.id ?? '', memo: '', owner: '나', more: false, showOpts: false, error: '' };
  render();
  el.classList.add('open');
  document.documentElement.classList.add('sheet-open');
  document.getElementById('app').inert = true;
  ctx.onHistory?.('open');
  requestAnimationFrame(() => $('.sheet', el).focus());
}
export function closeSheet({ fromPop = false } = {}) {
  if (!isSheetOpen()) return;
  el.classList.remove('open');
  document.documentElement.classList.remove('sheet-open');
  document.getElementById('app').inert = false;
  lastFocus?.focus?.();
  if (!fromPop) ctx.onHistory?.('close');
}

const amount = () => (s.digits ? parseInt(s.digits, 10) : 0);
const cats = () => ctx.getState().categories.filter((c) => c.kind === s.kind && !c.archived);

function render() {
  if (s?.sms) {
    $('.sheet', el).innerHTML = smsHtml(s.sms, ctx.getState());
    fitNums($('.sheet', el));
    return;
  }
  const st = ctx.getState();
  const list = suggestOrder(cats(), recentIds());
  if (s.categoryId && !list.slice(0, 7).some((c) => c.id === s.categoryId)) s.more = true;
  const shown = s.more || list.length <= 8 ? list : list.slice(0, 7);
  const amt = amount();
  const canSave = amt > 0 && !!s.categoryId;
  const today = ymd(new Date());
  const acc = st.accounts.find((a) => a.id === s.accountId);
  $('.sheet', el).innerHTML = `
    <div class="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line" aria-hidden="true"></div>
    <div class="flex items-center justify-between px-5 pt-3 gap-2">
      <h2 id="sheet-title" class="sr-only">${s.id ? '기록 고치기' : '새 기록'}</h2>
      <div class="seg" role="radiogroup" aria-label="구분">
        <button role="radio" aria-checked="${s.kind === 'expense'}" data-kind="expense">지출</button>
        <button role="radio" aria-checked="${s.kind === 'income'}" data-kind="income">수입</button>
      </div>
      <div class="flex gap-1">
        ${s.id ? '<button class="icon-btn text-expense" data-del aria-label="이 기록 삭제">🗑️</button>' : ''}
        <button class="icon-btn" data-close aria-label="닫기">✕</button>
      </div>
    </div>
    ${s.id || st.features?.sms === false ? '' : smsPasteRow()}
    <div class="px-5 pt-3 pb-1 text-right">
      <p data-fit class="amount-display tabular-nums ${amt ? '' : 'text-ink-sub'} ${s.shake ? 'shake' : ''}" aria-live="polite" aria-label="금액 ${formatWon(amt)}">
        <span class="${s.kind === 'income' || (s.refund && s.kind === 'expense') ? 'text-income' : 'text-expense'}">${amt ? (s.kind === 'income' || (s.refund && s.kind === 'expense') ? '+' : '−') : ''}</span>${amt.toLocaleString('ko-KR')}<span class="text-head ml-1 text-ink">원</span></p>
      ${s.refund && s.kind === 'expense' && !s.error ? '<p class="h-5 text-caption text-ink-sub">↩️ 카드 환불 · 이 달 지출에서 빼요</p>' : `<p class="h-5 text-caption text-expense" role="alert">${esc(s.error)}</p>`}
    </div>
    <div class="px-4">
      <div class="cat-grid" role="radiogroup" aria-label="카테고리">
        ${shown.map((c) => `<button role="radio" aria-checked="${c.id === s.categoryId}" class="cat-chip" data-cat="${esc(c.id)}">
          <span class="text-2xl leading-none" aria-hidden="true">${esc(c.emoji)}</span><span class="cat-name">${esc(c.name)}</span></button>`).join('')}
        ${list.length > 8 && !s.more ? `<button class="cat-chip" data-more><span class="text-2xl leading-none" aria-hidden="true">⋯</span><span class="cat-name">더보기</span></button>` : ''}
      </div>
    </div>
    ${st.features?.txOwner ? `<div class="px-5 pt-3 flex flex-col gap-2 min-w-0">${ownerPickHtml(s.owner, spouseLabel(st.settings))}
      <p class="text-caption text-ink-sub break-words">${s.kind === 'income' ? '배우자 입금이면 배우자를 고르세요. ' : ''}같이 쓴 지출은 공동이에요. 나는 기록에 누구 돈을 적지 않아요.</p></div>` : ''}
    ${s.showOpts ? `<div class="px-5 pt-3 grid gap-2">
        <label class="opt-row relative"><span aria-hidden="true">📅</span>
          <span class="flex-1 text-body" aria-hidden="true">${esc(longDate(s.date, today))}</span><span class="text-caption text-ink-sub font-semibold" aria-hidden="true">바꾸기 ›</span>
          <input type="date" name="date" lang="ko" value="${s.date}" max="2100-12-31" class="date-overlay" aria-label="날짜, ${esc(longDate(s.date, today))}" /></label>
        <div class="flex gap-2 flex-wrap" role="radiogroup" aria-label="결제수단">
          ${st.accounts.filter((a) => !a.archived).map((a) => `<button role="radio" aria-checked="${a.id === s.accountId}" class="chip" data-acc="${esc(a.id)}"><span aria-hidden="true">${esc(a.emoji ?? '')}</span> ${esc(a.name)}</button>`).join('')}
        </div>
        <label class="opt-row"><span aria-hidden="true">✏️</span><span class="sr-only">메모</span>
          <input name="memo" value="${esc(s.memo)}" maxlength="${MAX_MEMO}" placeholder="메모 (예: 점심 #회사)" class="opt-input" autocomplete="off" enterkeyhint="done" /></label>
        ${s.id || st.features?.recurring === false ? '' : `<button type="button" role="switch" aria-checked="${!!s.repeat}" class="chip self-start" data-repeat><span aria-hidden="true">🔁</span> 매달 반복${s.repeat ? ` · 매달 ${Number(s.date.slice(8))}일` : ''}</button>`}
      </div>`
    : `<button class="mx-5 mt-3 opt-summary" data-opts>
        <span>📅 ${esc(prettyDate(s.date, today))}</span><span>${esc(acc ? `${acc.emoji ?? ''} ${acc.name}` : '💳 결제수단')}</span><span>✏️ ${s.memo ? esc(s.memo) : '메모'}</span>${s.repeat ? '<span>🔁 매달</span>' : ''}</button>`}
    <div class="keypad px-4 pt-3" aria-label="숫자 키패드">
      ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'].map((k) => `<button class="key" data-key="${k}" aria-label="${k === '⌫' ? '지우기' : k}">${k}</button>`).join('')}
    </div>
    <div class="px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
      <button class="btn-primary w-full h-14 text-head ${canSave ? 'pulse' : ''}" data-save ${canSave ? '' : 'aria-disabled="true"'}>${s.id ? '고친 내용 저장' : s.repeat ? '저장 · 매달 반복' : '저장'}</button>
      ${s.id ? '' : '<p class="mt-1 text-center text-caption text-ink-sub">저장을 길게 누르면 매달 반복으로 저장해요</p>'}
    </div>`;
  fitNums($('.sheet', el));
  s.shake = false;
}

function setDigits(next) {
  next = next.replace(/^0+(?=\d)/, '');
  if (next && parseInt(next, 10) > MAX_AMOUNT) { s.error = '한 번에 10억 원까지 입력할 수 있어요.'; s.shake = true; haptic(20); render(); return; }
  s.digits = next === '0' ? '' : next; s.error = '';
  render();
}
function press(k) {
  haptic();
  if (k === '⌫') return setDigits(s.digits.slice(0, -1));
  if (!s.digits && (k === '0' || k === '000')) return;
  setDigits(s.digits + k);
}

async function save() {
  // 카드 환불(음수 지출)은 고쳐도 환불로 남김. 가져오기 지문·묶음 id·카드 끝 4자리·반복 id도 그대로 둠
  const refund = s.refund && s.kind === 'expense';
  const stNow = ctx.getState();
  const base = { id: s.id, createdAt: s.createdAt, kind: s.kind, amount: refund ? -amount() : amount(), categoryId: s.categoryId, date: s.date, accountId: s.accountId || undefined, memo: s.memo.trim() };
  const owner = ownerForSave(s.owner, s.orig, !!stNow.features?.txOwner);
  if (owner) base.owner = owner;
  const tx = withKeptFields(base, s.orig);
  const err = validateTx(tx);
  if (err) { s.error = err; s.shake = true; haptic(20); render(); return; }
  if (!s.id) {
    const dup = ctx.getState().txs.find((t) => t.date === tx.date && t.categoryId === tx.categoryId && t.amount === tx.amount && t.kind === tx.kind);
    if (dup && !(await confirmDialog({ title: '혹시 중복인가요?', body: '같은 날 같은 카테고리·금액 기록이 이미 있어요.', ok: '그래도 저장', cancel: '취소' }))) return;
  }
  pushRecent(tx.categoryId);
  if (tx.accountId) localStorage.setItem('lastAccount', tx.accountId);
  haptic(12);
  closeSheet();
  ctx.onSave(tx, { repeat: !s.id && !!s.repeat });
}

function renderKeep() {
  const a = document.activeElement;
  const name = a?.name;
  const pos = typeof a?.selectionStart === 'number' ? a.selectionStart : null;
  render();
  if (!name) return;
  const n = $(`[name="${CSS.escape(name)}"]`, el);
  if (!n) return;
  n.focus();
  if (pos != null && n.setSelectionRange) {
    const p = Math.min(pos, n.value.length);
    n.setSelectionRange(p, p);
  }
}

async function runSms() {
  if (s.sms) return;
  s.sms = blankSms();
  render();
  const token = s.sms;
  await fillFromClipboard(token, () => ctx.getState());
  if (!isSheetOpen() || s.sms !== token) return;
  render();
  (s.sms.phase === 'paste' ? $('textarea', el) : $('.sheet', el))?.focus?.();
}

function onSmsClick(t) {
  if (t.hasAttribute('data-sms-back')) { s.sms = null; render(); return; }
  if (t.hasAttribute('data-sms-parse')) {
    applySmsText(s.sms, s.sms.pasteText, ctx.getState());
    render();
    (s.sms.phase === 'paste' ? $('textarea', el) : $('#sheet-title', el))?.focus?.();
    return;
  }
  if (t.dataset.smsStatus && s.sms.draft) { setSmsStatus(s.sms.draft, t.dataset.smsStatus, ctx.getState()); return render(); }
  if (t.dataset.smsCat && s.sms.draft) { s.sms.draft.categoryId = t.dataset.smsCat; s.sms.draft.catTouched = true; s.sms.draft.error = ''; return render(); }
  if (t.dataset.smsOwner && s.sms.draft) { s.sms.draft.owner = t.dataset.smsOwner; return render(); }
  if (t.dataset.smsAcc && s.sms.draft) {
    s.sms.draft.accountId = s.sms.draft.accountId === t.dataset.smsAcc ? '' : t.dataset.smsAcc;
    s.sms.draft.accTouched = true;
    return render();
  }
  if (t.hasAttribute('data-sms-save')) return confirmSms();
  if (t.hasAttribute('data-sms-skip')) return skipSms();
}

function confirmSms() {
  const d = s.sms?.draft;
  if (!d) return;
  const { tx, err } = smsTx(d);
  if (err) { d.error = err; render(); return; }
  if (tx.accountId) localStorage.setItem('lastAccount', tx.accountId);
  pushRecent(tx.categoryId);
  haptic(12);
  ctx.onSave(tx, { repeat: false });
  s.sms.saved = [...(s.sms.saved || []), tx];
  if (!advanceSms(s.sms)) return closeSheet();
  render();
  $('#sheet-title', el)?.focus?.();
}
function skipSms() {
  if (!s.sms) return;
  if (!advanceSms(s.sms)) return closeSheet();
  render();
  $('#sheet-title', el)?.focus?.();
}

function onClick(e) {
  const t = e.target.closest('button,[data-close]');
  if (!t) return;
  if (t.hasAttribute('data-close')) return closeSheet();
  if (t.hasAttribute('data-sms')) return runSms();
  if (s.sms) return onSmsClick(t);
  if (t.dataset.key) return press(t.dataset.key);
  if (t.dataset.kind) { if (s.kind !== t.dataset.kind) { s.kind = t.dataset.kind; s.categoryId = null; s.more = false; } return render(); }
  if (t.dataset.cat) { s.categoryId = t.dataset.cat; s.error = ''; haptic(); render(); $(`[data-cat="${CSS.escape(s.categoryId)}"]`, el)?.classList.add('pop'); return; }
  if (t.hasAttribute('data-more')) { s.more = true; return render(); }
  if (t.hasAttribute('data-opts')) { s.showOpts = true; render(); return $('[data-acc]', el)?.focus(); }
  if (t.dataset.owner) { s.owner = t.dataset.owner; haptic(); return render(); }
  if (t.dataset.acc) { s.accountId = s.accountId === t.dataset.acc ? '' : t.dataset.acc; return render(); }
  if (t.hasAttribute('data-repeat')) { s.repeat = !s.repeat; haptic(); return render(); }
  if (t.hasAttribute('data-save')) { if (Date.now() - longPressAt < 400) return; return save(); }
  if (t.hasAttribute('data-del')) { const id = s.id; closeSheet(); return ctx.onDelete(id); }
}
function onInput(e) {
  if (s?.sms) { if (applySmsInput(s.sms, e.target, ctx.getState())) renderKeep(); return; }
  if (e.target.name === 'memo') s.memo = e.target.value;
  if (e.target.name === 'date' && e.type === 'change' && e.target.value) { s.date = e.target.value; render(); $('input[name=date]', el)?.focus(); }
}
function onPaste(e) {
  if (s?.sms || e.target.name === 'memo' || e.target.name === 'date') return;
  e.preventDefault();
  const digits = (e.clipboardData?.getData('text') ?? '').split('.')[0].replace(/[^0-9]/g, '');
  if (digits) setDigits(digits);
}
function onKey(e) {
  if (!isSheetOpen() || document.querySelector('[role=alertdialog]')) return;
  if (s?.sms) {
    if (e.key === 'Escape') { e.preventDefault(); return closeSheet(); }
    if (e.key === 'Tab') {
      const f = $$('button:not([disabled]), input, textarea', $('.sheet', el));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === $('.sheet', el))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if (e.key === 'Enter' && !e.isComposing && e.target.matches?.('[data-sms-save]')) { e.preventDefault(); return confirmSms(); }
    return;
  }
  const inField = e.target.matches?.('input');
  if (e.key === 'Escape') { e.preventDefault(); return closeSheet(); }
  if (e.key === 'Enter' && !e.isComposing) { if (e.target.closest?.('button') && !inField) return; e.preventDefault(); return save(); }
  if (e.key === 'Tab') { // 포커스 가두기
    const f = $$('button:not([disabled]), input', $('.sheet', el));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === $('.sheet', el))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    return;
  }
  if (inField) return;
  if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
  else if (e.key === 'Backspace') { e.preventDefault(); press('⌫'); }
}
