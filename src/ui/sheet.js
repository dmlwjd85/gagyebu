// 10초 입력 시트: ＋ → 숫자 → 카테고리 → 저장
import { esc, $, $$, haptic, confirmDialog } from './util.js';
import { formatWon } from '../lib/money.js';
import { ymd, prettyDate, parseYmd, WEEK } from '../lib/dates.js';
const longDate = (d, today) => { const x = parseYmd(d); return `${x.getFullYear()}년 ${x.getMonth() + 1}월 ${x.getDate()}일 (${WEEK[x.getDay()]})${d === today ? ' · 오늘' : ''}`; };
import { validateTx, MAX_AMOUNT, MAX_MEMO } from '../lib/validate.js';
import { suggestOrder } from '../lib/defaults.js';

let el, ctx, s, lastFocus;
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
  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);
  el.addEventListener('change', onInput);
  el.addEventListener('paste', onPaste);
  document.addEventListener('keydown', onKey);
}
export const isSheetOpen = () => el?.classList.contains('open');

export function openSheet(tx = null, { date } = {}) {
  const st = ctx.getState();
  lastFocus = document.activeElement;
  const lastAcc = localStorage.getItem('lastAccount');
  s = tx
    ? { id: tx.id, createdAt: tx.createdAt, kind: tx.kind, digits: String(tx.amount), categoryId: tx.categoryId, date: tx.date, accountId: tx.accountId ?? '', memo: tx.memo ?? '', more: false, showOpts: true, error: '' }
    : { kind: 'expense', digits: '', categoryId: null, date: date ?? ymd(new Date()), accountId: st.accounts.some((a) => a.id === lastAcc) ? lastAcc : st.accounts[0]?.id ?? '', memo: '', more: false, showOpts: false, error: '' };
  render();
  el.classList.add('open');
  document.documentElement.classList.add('sheet-open');
  document.getElementById('app').inert = true;
  requestAnimationFrame(() => $('.sheet', el).focus());
}
export function closeSheet() {
  if (!isSheetOpen()) return;
  el.classList.remove('open');
  document.documentElement.classList.remove('sheet-open');
  document.getElementById('app').inert = false;
  lastFocus?.focus?.();
}

const amount = () => (s.digits ? parseInt(s.digits, 10) : 0);
const cats = () => ctx.getState().categories.filter((c) => c.kind === s.kind && !c.archived);

function render() {
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
    <div class="flex items-center justify-between px-5 pt-3">
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
    <div class="px-5 pt-3 pb-1 text-right">
      <p class="amount-display tabular-nums ${amt ? '' : 'text-ink-sub'} ${s.shake ? 'shake' : ''}" aria-live="polite" aria-label="금액 ${formatWon(amt)}">
        <span class="${s.kind === 'income' ? 'text-income' : 'text-expense'}">${amt ? (s.kind === 'income' ? '+' : '−') : ''}</span>${amt.toLocaleString('ko-KR')}<span class="text-head ml-1 text-ink">원</span></p>
      <p class="h-5 text-caption text-expense" role="alert">${esc(s.error)}</p>
    </div>
    <div class="px-4">
      <div class="cat-grid" role="radiogroup" aria-label="카테고리">
        ${shown.map((c) => `<button role="radio" aria-checked="${c.id === s.categoryId}" class="cat-chip" data-cat="${esc(c.id)}">
          <span class="text-2xl leading-none" aria-hidden="true">${esc(c.emoji)}</span><span class="cat-name">${esc(c.name)}</span></button>`).join('')}
        ${list.length > 8 && !s.more ? `<button class="cat-chip" data-more><span class="text-2xl leading-none" aria-hidden="true">⋯</span><span class="cat-name">더보기</span></button>` : ''}
      </div>
    </div>
    ${s.showOpts ? `<div class="px-5 pt-3 grid gap-2">
        <label class="opt-row relative"><span aria-hidden="true">📅</span>
          <span class="flex-1 text-body" aria-hidden="true">${esc(longDate(s.date, today))}</span><span class="text-caption text-ink-sub font-semibold" aria-hidden="true">바꾸기 ›</span>
          <input type="date" name="date" lang="ko" value="${s.date}" max="2100-12-31" class="date-overlay" aria-label="날짜, ${esc(longDate(s.date, today))}" /></label>
        <div class="flex gap-2 flex-wrap" role="radiogroup" aria-label="결제수단">
          ${st.accounts.filter((a) => !a.archived).map((a) => `<button role="radio" aria-checked="${a.id === s.accountId}" class="chip" data-acc="${esc(a.id)}"><span aria-hidden="true">${esc(a.emoji ?? '')}</span> ${esc(a.name)}</button>`).join('')}
        </div>
        <label class="opt-row"><span aria-hidden="true">✏️</span><span class="sr-only">메모</span>
          <input name="memo" value="${esc(s.memo)}" maxlength="${MAX_MEMO}" placeholder="메모 (예: 점심 #회사)" class="opt-input" autocomplete="off" enterkeyhint="done" /></label>
      </div>`
    : `<button class="mx-5 mt-3 opt-summary" data-opts>
        <span>📅 ${esc(prettyDate(s.date, today))}</span><span>${esc(acc ? `${acc.emoji ?? ''} ${acc.name}` : '💳 결제수단')}</span><span>✏️ ${s.memo ? esc(s.memo) : '메모'}</span></button>`}
    <div class="keypad px-4 pt-3" aria-label="숫자 키패드">
      ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'].map((k) => `<button class="key" data-key="${k}" aria-label="${k === '⌫' ? '지우기' : k}">${k}</button>`).join('')}
    </div>
    <div class="px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
      <button class="btn-primary w-full h-14 text-head ${canSave ? 'pulse' : ''}" data-save ${canSave ? '' : 'aria-disabled="true"'}>${s.id ? '고친 내용 저장' : '저장'}</button>
    </div>`;
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
  const tx = { id: s.id, createdAt: s.createdAt, kind: s.kind, amount: amount(), categoryId: s.categoryId, date: s.date, accountId: s.accountId || undefined, memo: s.memo.trim() };
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
  ctx.onSave(tx);
}

function onClick(e) {
  const t = e.target.closest('button,[data-close]');
  if (!t) return;
  if (t.hasAttribute('data-close')) return closeSheet();
  if (t.dataset.key) return press(t.dataset.key);
  if (t.dataset.kind) { if (s.kind !== t.dataset.kind) { s.kind = t.dataset.kind; s.categoryId = null; s.more = false; } return render(); }
  if (t.dataset.cat) { s.categoryId = t.dataset.cat; s.error = ''; haptic(); render(); $(`[data-cat="${CSS.escape(s.categoryId)}"]`, el)?.classList.add('pop'); return; }
  if (t.hasAttribute('data-more')) { s.more = true; return render(); }
  if (t.hasAttribute('data-opts')) { s.showOpts = true; render(); return $('[data-acc]', el)?.focus(); }
  if (t.dataset.acc) { s.accountId = s.accountId === t.dataset.acc ? '' : t.dataset.acc; return render(); }
  if (t.hasAttribute('data-save')) return save();
  if (t.hasAttribute('data-del')) { const id = s.id; closeSheet(); return ctx.onDelete(id); }
}
function onInput(e) {
  if (e.target.name === 'memo') s.memo = e.target.value;
  if (e.target.name === 'date' && e.type === 'change' && e.target.value) { s.date = e.target.value; render(); $('input[name=date]', el)?.focus(); }
}
function onPaste(e) {
  if (e.target.name === 'memo' || e.target.name === 'date') return;
  e.preventDefault();
  const digits = (e.clipboardData?.getData('text') ?? '').split('.')[0].replace(/[^0-9]/g, '');
  if (digits) setDigits(digits);
}
function onKey(e) {
  if (!isSheetOpen() || document.querySelector('[role=alertdialog]')) return;
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
