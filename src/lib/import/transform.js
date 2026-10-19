// 원본 줄 → 앱 거래 후보. 원본 파일은 저장하지 않고, 필요한 칸만 뽑는다.
import { parseDate, parseAmount, last4 } from './normalize.js';

const CANCEL = /취소|환불|거절|부도|반려/;

/**
 * @param {string[][]} rows 머리글 아래 데이터 줄
 * @param {{cols: string[]}} mapping 열 용도
 * @param {{sign?: 'expense'|'income'|'flip', excludeCancelled?: boolean}} opt
 *   sign: 금액 열 하나일 때 양수를 지출로 볼지(카드 기본) 수입으로 볼지, flip은 부호 뒤집기
 */
export function toCandidates(rows, mapping, opt = {}) {
  const { sign = 'expense', excludeCancelled = true } = opt;
  const idx = (r) => mapping.cols.indexOf(r);
  const at = (row, r) => (idx(r) >= 0 ? row[idx(r)] : undefined);
  const items = []; let cancelled = 0; let invalid = 0;
  rows.forEach((row, i) => {
    const date = parseDate(at(row, 'date'));
    const status = String(at(row, 'status') ?? '');
    if (excludeCancelled && CANCEL.test(status)) { cancelled++; return; }
    let signed = null; // 양수 = 지출, 음수 = 수입
    if (idx('out') >= 0 || idx('in') >= 0) {
      const o = parseAmount(at(row, 'out')) || 0, n = parseAmount(at(row, 'in')) || 0;
      signed = o - n;
      if (!o && !n) signed = null;
    } else {
      const a = parseAmount(at(row, 'amount'));
      if (a != null) signed = sign === 'income' ? -a : sign === 'flip' ? -a : a;
    }
    if (!date || signed == null || signed === 0) { invalid++; return; }
    const amount = Math.abs(signed);
    if (amount > 1_000_000_000) { invalid++; return; }
    const desc = String(at(row, 'desc') ?? '').trim().slice(0, 100);
    const extra = String(at(row, 'memo') ?? '').trim();
    items.push({
      row: i, date, amount, kind: signed > 0 ? 'expense' : 'income', desc,
      memo: [desc, extra && extra !== '일시불' ? extra : ''].filter(Boolean).join(' · ').slice(0, 200),
      approval: String(at(row, 'approval') ?? '').replace(/\D/g, '').slice(0, 20) || null,
      card4: idx('card') >= 0 ? last4(at(row, 'card')) : null,
    });
  });
  return { items, cancelled, invalid };
}

/** 확정 화면 요약: 기간·지출 합계·수입 합계 */
export function summarize(items) {
  if (!items.length) return { count: 0, from: null, to: null, expense: 0, income: 0 };
  const dates = items.map((x) => x.date).sort();
  return {
    count: items.length, from: dates[0], to: dates[dates.length - 1],
    expense: items.filter((x) => x.kind === 'expense').reduce((a, x) => a + x.amount, 0),
    income: items.filter((x) => x.kind === 'income').reduce((a, x) => a + x.amount, 0),
  };
}
