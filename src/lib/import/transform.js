// 원본 줄 → 앱 거래 후보. 원본 파일은 저장하지 않고, 필요한 칸만 뽑는다.
import { parseDate, parseAmount, last4 } from './normalize.js';
import { normMerchant } from './dedupe.js';

// '부분취소'는 취소가 아님(남은 금액은 이용금액 열에 있음)
const PARTIAL = /부분\s*취소|부분\s*환불/;
const CANCEL = /취소|환불|거절|부도|반려/;
const SUMMARY = /^(합\s*계|총\s*계|소\s*계|총\s*합계|합계금액|total)$/i;

/**
 * @param {string[][]} rows 머리글 아래 데이터 줄
 * @param {{cols: string[]}} mapping 열 용도
 * @param {{sign?: 'expense'|'income'|'flip', excludeCancelled?: boolean}} opt
 *   sign: 금액 열 하나일 때 양수를 지출로 볼지(카드 기본) 수입으로 볼지, flip은 부호 뒤집기
 * @returns {{ items, cancelled, invalid, reasons: {date, amount, zero, tooBig}, offset, summary }}
 *
 * 카드 파일(sign='expense', 금액 열 하나)의 음수 줄 = 취소·환불:
 *  ① 같은 승인번호(없으면 같은 가맹점·같은 금액·같은 날이나 이전)의 원거래가 파일에 있으면 원거래 금액에서 뺌(상계).
 *     다 빠지면 둘 다 없앰 → 취소된 결제가 지출로 남지 않음
 *  ② 원거래가 파일에 없으면(지난달 결제의 환불 등) '지출 차감'(음수 지출)으로 넣음
 *     → 수입·저축률이 부풀지 않고, 그 가맹점 카테고리 지출이 줄어듦
 */
export function toCandidates(rows, mapping, opt = {}) {
  const { sign = 'expense', excludeCancelled = true } = opt;
  const idx = (r) => mapping.cols.indexOf(r);
  const at = (row, r) => (idx(r) >= 0 ? row[idx(r)] : undefined);
  const split = idx('out') >= 0 || idx('in') >= 0;
  const card = !split && sign === 'expense';
  const reasons = { date: 0, amount: 0, zero: 0, tooBig: 0 };
  let items = []; let cancelled = 0; let summary = 0;
  rows.forEach((row, i) => {
    const rawDate = at(row, 'date');
    const desc = String(at(row, 'desc') ?? '').trim().slice(0, 100);
    // 마지막 '합계' 줄 등은 조용히 건너뜀
    if (row.some((c) => SUMMARY.test(String(c ?? '').trim())) && !parseDate(rawDate)) { summary++; return; }
    const date = parseDate(rawDate);
    const status = String(at(row, 'status') ?? '');
    const partial = PARTIAL.test(status);
    if (excludeCancelled && !partial && CANCEL.test(status)) { cancelled++; return; }
    let signed = null; // 양수 = 지출, 음수 = 수입(카드 파일은 환불)
    if (split) {
      const o = parseAmount(at(row, 'out')) || 0, n = parseAmount(at(row, 'in')) || 0;
      signed = o - n;
      if (!o && !n && at(row, 'out') == null && at(row, 'in') == null) signed = null;
    } else {
      const a = parseAmount(at(row, 'amount'));
      if (a != null) signed = sign === 'income' ? -a : sign === 'flip' ? -a : a;
    }
    if (!date) { reasons.date++; return; }
    if (signed == null) { reasons.amount++; return; }
    if (signed === 0) { if (partial) cancelled++; else reasons.zero++; return; } // 부분취소인데 남은 금액 0 = 전부 취소
    const amount = Math.abs(signed);
    if (amount > 1_000_000_000) { reasons.tooBig++; return; }
    const extra = String(at(row, 'memo') ?? '').trim();
    const refund = card && signed < 0;
    items.push({
      row: i, date, amount: refund ? -amount : amount, kind: signed > 0 || refund ? 'expense' : 'income', desc, refund: refund || undefined, partial: (refund && partial) || undefined,
      memo: [desc, extra && extra !== '일시불' ? extra : '', partial ? '부분취소' : ''].filter(Boolean).join(' · ').slice(0, 200),
      approval: String(at(row, 'approval') ?? '').replace(/\D/g, '').slice(0, 20) || null,
      card4: idx('card') >= 0 ? last4(at(row, 'card')) : null,
    });
  });
  // 취소·환불 줄 상계
  let offset = 0;
  const gone = new Set();
  for (const r of items.filter((x) => x.refund)) {
    const cands = items.filter((o) => !o.refund && !gone.has(o) && o.kind === 'expense' && o.amount > 0 && o.date <= r.date);
    const same = cands.filter((x) => (!r.approval || !x.approval || x.approval === r.approval) && normMerchant(x.desc) === normMerchant(r.desc));
    // 부분취소 줄은 금액이 달라도 같은 가맹점의 가장 최근 원거래(남은 금액이 더 큰)에서 뺌
    const o = (r.approval && cands.find((x) => x.approval === r.approval))
      || same.find((x) => x.amount === -r.amount)
      || (r.partial && same.filter((x) => x.amount > -r.amount).sort((a, b) => (a.date < b.date ? 1 : -1))[0]);
    if (!o) continue;
    const left = o.amount + r.amount;
    if (left < 0) continue; // 원거래보다 큰 환불은 상계하지 않음(지출 차감으로 둠)
    o.amount = left; gone.add(r); offset++;
    if (left === 0) gone.add(o);
    else o.memo = [o.memo, '부분취소 반영'].join(' · ').slice(0, 200);
  }
  items = items.filter((x) => !gone.has(x));
  for (const x of items) delete x.partial;
  const invalid = reasons.date + reasons.amount + reasons.zero + reasons.tooBig;
  return { items, cancelled, invalid, reasons, offset, summary };
}

/** 확정 화면 요약: 기간·지출 합계(환불 차감 후)·환불·수입 합계 */
export function summarize(items) {
  if (!items.length) return { count: 0, from: null, to: null, expense: 0, refund: 0, income: 0 };
  const dates = items.map((x) => x.date).sort();
  const exp = items.filter((x) => x.kind === 'expense');
  return {
    count: items.length, from: dates[0], to: dates[dates.length - 1],
    expense: exp.reduce((a, x) => a + x.amount, 0),
    refund: -exp.filter((x) => x.amount < 0).reduce((a, x) => a + x.amount, 0),
    income: items.filter((x) => x.kind === 'income').reduce((a, x) => a + x.amount, 0),
  };
}

/** 건너뛴 줄 안내 문구(사유별) */
export function skipReasonText(r = {}) {
  const out = [];
  if (r.date) out.push(`날짜를 읽을 수 없는 줄 ${r.date}개`);
  if (r.amount) out.push(`금액을 읽을 수 없는 줄 ${r.amount}개`);
  if (r.zero) out.push(`0원인 줄 ${r.zero}개`);
  if (r.tooBig) out.push(`10억 원이 넘는 줄 ${r.tooBig}개`);
  return out.length ? `${out.join(', ')}는 뺐어요.` : '';
}
