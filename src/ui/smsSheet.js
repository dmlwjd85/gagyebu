// 빠른 입력의 '문자 붙여넣기'. 읽기·파싱은 이 기기 안에서만 하고, 저장은 사용자가 확인할 때만.
import { esc } from './util.js';
import { formatWon } from '../lib/money.js';
import { parseYmd, WEEK } from '../lib/dates.js';
import { suggestOrder } from '../lib/defaults.js';
import { validateTx, MAX_MEMO } from '../lib/validate.js';
import {
  parseSms, readClipboard, clipboardHint, failMessage, draftFromItem, txFromDraft,
  categorize, composeMemo, signedOf, isLikelyDuplicate, pickAccount,
} from '../lib/sms.js';

const STATUSES = [
  ['approval', '승인'],
  ['cancel', '취소'],
  ['partial-cancel', '부분취소'],
  ['deposit', '입금'],
  ['withdrawal', '출금'],
];

export function smsPasteRow() {
  return `<div class="px-5 pt-3 sms-scale"><button type="button" class="btn-ghost sms-btn w-full" data-sms>문자 붙여넣기</button></div>`;
}

export function smsHtml(sms, st) {
  if (sms.phase === 'reading') {
    return `<div class="sms-scale">
      <div class="flex items-start justify-between gap-2 px-5 pt-4">
        <h2 id="sheet-title" class="text-head min-w-0 flex-1">문자를 읽고 있어요</h2>
        <button type="button" class="icon-btn shrink-0" data-close aria-label="닫기">✕</button>
      </div>
      <p class="px-5 pt-2 pb-8 text-body text-ink-sub">이 기기에만 두고, 어디로도 보내지 않아요.</p>
    </div>`;
  }
  if (sms.phase === 'paste') return pasteHtml(sms);
  return previewHtml(sms, st);
}

function pasteHtml(sms) {
  return `<div class="sms-scale">
    <div class="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line" aria-hidden="true"></div>
    <div class="flex items-start justify-between gap-2 px-5 pt-3">
      <h2 id="sheet-title" class="text-head min-w-0 flex-1">문자 붙여넣기</h2>
      <button type="button" class="icon-btn shrink-0" data-close aria-label="닫기">✕</button>
    </div>
    <div class="px-5 pt-3 flex flex-col gap-3">
      <p class="text-body text-ink-sub">${esc(sms.hint || '카드·은행 문자를 붙여 넣으세요.')}</p>
      ${sms.error ? `<p class="text-body text-expense" role="alert">${esc(sms.error)}</p>` : ''}
      <label class="sms-field"><span class="text-caption text-ink-sub">문자</span>
        <textarea name="smsPaste" class="sms-area text-body" rows="8" maxlength="8000" placeholder="카드·은행 문자를 붙여 넣으세요">${esc(sms.pasteText || '')}</textarea>
      </label>
      <button type="button" class="btn-primary sms-btn w-full" data-sms-parse>이 문자 읽기</button>
      <button type="button" class="btn-ghost sms-btn w-full" data-sms-back>키패드로 돌아가기</button>
    </div>
    <div class="h-[max(16px,env(safe-area-inset-bottom))]"></div>
  </div>`;
}

function longDate(d) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return '날짜를 골라 주세요';
  const x = parseYmd(d);
  return `${x.getFullYear()}년 ${x.getMonth() + 1}월 ${x.getDate()}일 (${WEEK[x.getDay()]})`;
}

function statusNote(d) {
  if (d.status === 'cancel') return '카드 취소 · 이 달 지출에서 빼요';
  if (d.status === 'partial-cancel') return '부분 취소 · 이 금액만큼 지출에서 빼요';
  if (d.status === 'deposit') return '입금 · 수입으로 기록해요';
  if (d.status === 'withdrawal') return '출금 · 지출로 기록해요';
  return d.installment >= 2 ? `${d.installment}개월 할부 · 승인` : '일시불 · 승인';
}

function previewHtml(sms, st) {
  const d = sms.draft;
  const n = Math.abs(parseInt(String(d.amount ?? '').replace(/[^\d]/g, ''), 10) || 0);
  const signed = signedOf(d);
  const plus = d.kind === 'income' || signed < 0;
  const cats = suggestOrder(st.categories.filter((c) => c.kind === d.kind && !c.archived), []);
  const accs = st.accounts.filter((a) => !a.archived);
  const dup = isLikelyDuplicate([...(st.txs || []), ...(sms.saved || [])], { date: d.date, amount: signed });
  const memo = d.memoTouched ? (d.memo ?? '') : composeMemo(d);
  const queue = sms.queue.length > 1 ? `<p class="text-caption text-ink-sub">${sms.index + 1}/${sms.queue.length} · 오래된 것부터</p>` : '';
  return `<div class="sms-scale">
    <div class="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line" aria-hidden="true"></div>
    <div class="flex items-start justify-between gap-2 px-5 pt-3">
      <div class="min-w-0 flex-1">
        <h2 id="sheet-title" class="text-head">문자로 읽은 기록</h2>
        ${queue}
      </div>
      <button type="button" class="icon-btn shrink-0" data-close aria-label="닫기">✕</button>
    </div>
    <div class="px-5 pt-2 flex flex-col gap-3">
      ${sms.note ? `<p class="text-caption text-ink-sub">${esc(sms.note)}</p>` : ''}
      <p class="text-caption text-ink-sub">${esc([d.issuer || (d.channel === 'bank' ? '은행' : '카드'), statusNote(d)].filter(Boolean).join(' · '))}${d.card4 ? ` · 끝자리 ${esc(d.card4)}` : ''}</p>
      ${d.dateInferred ? '<p class="text-caption text-ink-sub">날짜가 문자에 없어 오늘로 넣었어요. 맞는지 확인해 주세요.</p>' : ''}
      ${dup ? `<p class="sms-dup text-body" role="status">같은 날 같은 금액 기록이 이미 있어요. 그래도 맞으면 저장할 수 있어요.</p>` : ''}
      <p data-fit class="amount-display tabular-nums" aria-live="polite" aria-label="금액 ${formatWon(Math.abs(signed))}">
        <span class="${plus ? 'text-income' : 'text-expense'}">${n ? (plus ? '+' : '−') : ''}</span>${n.toLocaleString('ko-KR')}<span class="ml-1">원</span></p>
      <label class="sms-field"><span class="text-caption text-ink-sub">금액</span>
        <input name="amount" inputmode="numeric" class="sms-in text-body tabular-nums" autocomplete="off" value="${esc(String(d.amount ?? '').replace(/[^\d]/g, ''))}" /></label>
      <div class="sms-row">
        <label class="sms-field"><span class="text-caption text-ink-sub">날짜</span>
          <span class="sms-in sms-pick text-body"><span class="min-w-0">${esc(longDate(d.date))}</span>
            <input type="date" name="date" lang="ko" class="date-overlay" value="${esc(d.date || '')}" max="2100-12-31" aria-label="날짜, ${esc(longDate(d.date))}" /></span></label>
        <label class="sms-field"><span class="text-caption text-ink-sub">시각</span>
          <span class="sms-in sms-pick text-body"><span class="min-w-0">${esc(d.time || '없음')}</span>
            <input type="time" name="time" class="date-overlay" value="${esc(d.time || '')}" aria-label="시각${d.time ? `, ${esc(d.time)}` : ''}" /></span></label>
      </div>
      <label class="sms-field"><span class="text-caption text-ink-sub">가맹점 · 보낸 사람</span>
        <input name="merchant" class="sms-in text-body" maxlength="80" autocomplete="off" value="${esc(d.merchant || '')}" /></label>
      <div class="sms-row">
        <label class="sms-field"><span class="text-caption text-ink-sub">할부 개월</span>
          <input name="installment" inputmode="numeric" class="sms-in text-body" maxlength="2" placeholder="비우면 일시불" value="${esc(d.installmentRaw ?? (d.installment >= 2 ? String(d.installment) : ''))}" /></label>
        <label class="sms-field"><span class="text-caption text-ink-sub">카드사 · 은행</span>
          <input name="issuer" class="sms-in text-body" maxlength="20" autocomplete="off" value="${esc(d.issuer || '')}" /></label>
      </div>
      <div class="sms-field"><span class="text-caption text-ink-sub" id="sms-status-l">구분</span>
        <div class="sms-cats" role="radiogroup" aria-labelledby="sms-status-l">
          ${STATUSES.map(([id, label]) => `<button type="button" role="radio" class="chip sms-chip" aria-checked="${d.status === id}" data-sms-status="${id}">${label}</button>`).join('')}
        </div></div>
      <div class="sms-field"><span class="text-caption text-ink-sub" id="sms-cat-l">카테고리</span>
        <div class="sms-cats" role="radiogroup" aria-labelledby="sms-cat-l">
          ${cats.map((c) => `<button type="button" role="radio" class="chip sms-chip" aria-checked="${c.id === d.categoryId}" data-sms-cat="${esc(c.id)}"><span aria-hidden="true">${esc(c.emoji)}</span><span>${esc(c.name)}</span></button>`).join('')}
        </div></div>
      <div class="sms-field"><span class="text-caption text-ink-sub" id="sms-acc-l">결제수단</span>
        <div class="sms-cats" role="radiogroup" aria-labelledby="sms-acc-l">
          ${accs.map((a) => `<button type="button" role="radio" class="chip sms-chip" aria-checked="${a.id === d.accountId}" data-sms-acc="${esc(a.id)}"><span aria-hidden="true">${esc(a.emoji ?? '')}</span><span>${esc(a.name)}</span></button>`).join('')}
        </div></div>
      <label class="sms-field"><span class="text-caption text-ink-sub">메모</span>
        <input name="memo" class="sms-in text-body" maxlength="${MAX_MEMO}" autocomplete="off" value="${esc(memo)}" /></label>
      ${d.error ? `<p class="text-body text-expense" role="alert">${esc(d.error)}</p>` : ''}
      <button type="button" class="btn-primary sms-btn w-full" data-sms-save>이 내용으로 저장</button>
      <button type="button" class="btn-ghost sms-btn w-full" data-sms-skip>${sms.index + 1 < sms.queue.length ? '건너뛰고 다음' : '저장하지 않기'}</button>
    </div>
    <div class="h-[max(16px,env(safe-area-inset-bottom))]"></div>
  </div>`;
}

export function blankSms() {
  return { phase: 'reading', pasteText: '', hint: '', error: '', queue: [], index: 0, draft: null, note: '', saved: [] };
}

/** 클립보드를 읽고 sms 상태를 채운다. getState는 읽은 뒤에 부른다. */
export async function fillFromClipboard(sms, getState) {
  const clip = await readClipboard();
  if (!clip.ok) {
    sms.phase = 'paste';
    sms.hint = clipboardHint(clip.reason);
    sms.error = '';
    return sms;
  }
  return applySmsText(sms, clip.text, typeof getState === 'function' ? getState() : getState);
}

export function applySmsText(sms, text, st = null) {
  sms.pasteText = text ?? '';
  const parsed = parseSms(text, { now: new Date() });
  if (!parsed.ok) {
    sms.phase = 'paste';
    sms.error = failMessage(parsed.reason);
    sms.queue = [];
    sms.draft = null;
    return sms;
  }
  sms.queue = st ? parsed.items.map((item) => draftFromItem(item, st)) : parsed.items;
  sms.index = 0;
  sms.phase = 'preview';
  sms.error = '';
  sms.note = parsed.skipped ? '승인되지 않은 안내는 빼 두었어요.' : '';
  sms.saved = [];
  sms.draft = { ...sms.queue[0] };
  return sms;
}

export function setSmsStatus(d, status, st) {
  const prev = d.kind;
  d.status = status;
  if (status === 'deposit') { d.kind = 'income'; d.channel = 'bank'; }
  else d.kind = 'expense';
  if (status === 'withdrawal') d.channel = 'bank';
  if (status === 'approval' || status === 'cancel' || status === 'partial-cancel') {
    if (!/은행$/.test(d.issuer || '')) d.channel = 'card';
  }
  if (prev !== d.kind) d.catTouched = false;
  if (!d.catTouched) {
    const cat = categorize(d, st.rules, st.categories);
    d.categoryId = cat.categoryId;
    d.categoryBy = cat.by;
  }
  if (!d.accTouched) d.accountId = pickAccount(st.accounts, d);
  d.error = '';
}

/** 입력 한 번에 다시 그릴지. 메모·붙여넣기 칸은 커서만 유지하려고 다시 그리지 않는다. */
export function applySmsInput(sms, target, st) {
  if (sms.phase === 'paste') {
    if (target.name === 'smsPaste') sms.pasteText = target.value;
    return false;
  }
  const d = sms.draft;
  if (!d) return false;
  const name = target.name;
  if (name === 'amount') d.amount = target.value.replace(/[^\d]/g, '').slice(0, 10);
  else if (name === 'date' && target.value) d.date = target.value;
  else if (name === 'time') d.time = target.value;
  else if (name === 'merchant') {
    d.merchant = target.value;
    if (!d.catTouched) {
      const cat = categorize(d, st.rules, st.categories);
      d.categoryId = cat.categoryId;
      d.categoryBy = cat.by;
    }
  } else if (name === 'issuer') d.issuer = target.value.slice(0, 20);
  else if (name === 'installment') {
    d.installmentRaw = target.value.replace(/[^\d]/g, '').slice(0, 2);
    const n = parseInt(d.installmentRaw, 10);
    d.installment = n >= 2 && n <= 60 ? n : null;
  } else if (name === 'memo') {
    d.memo = target.value;
    d.memoTouched = true;
    return false;
  } else return false;
  d.dateInferred = false;
  d.error = '';
  return true;
}

export function smsTx(d) {
  const tx = txFromDraft(d);
  return { tx, err: validateTx(tx) };
}

export function advanceSms(sms) {
  sms.index += 1;
  if (sms.index >= sms.queue.length) return false;
  sms.draft = { ...sms.queue[sms.index] };
  sms.phase = 'preview';
  return true;
}
