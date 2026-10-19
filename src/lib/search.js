// 검색·필터: 메모·#태그·카테고리 이름, 구분, 카테고리, 결제수단, 금액 범위, 기간.
const low = (s) => String(s ?? '').toLowerCase();
/**
 * @param {Array} txs
 * @param {{q?: string, kind?: 'expense'|'income'|'', categoryId?: string, accountId?: string, min?: number, max?: number, from?: string, to?: string}} f
 * @param {Map<string, {name: string}>} catMap
 */
export function searchTxs(txs, f = {}, catMap = new Map()) {
  // '5,600'·'5,600원'처럼 화면 표기대로 쓴 금액도 찾기
  const words = low(f.q).trim().split(/\s+/).filter(Boolean).map((w) => (/^[\d,]+원?$/.test(w) ? w.replace(/[,원]/g, '') : w));
  return txs.filter((t) => {
    if (f.kind && t.kind !== f.kind) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.accountId && t.accountId !== f.accountId) return false;
    if (f.min != null && Math.abs(t.amount) < f.min) return false;
    if (f.max != null && Math.abs(t.amount) > f.max) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (!words.length) return true;
    const hay = `${low(t.memo)} ${low(catMap.get(t.categoryId)?.name)} ${(t.tags || []).map((x) => '#' + low(x)).join(' ')} ${Math.abs(t.amount)}`;
    return words.every((w) => hay.includes(w));
  }).sort((a, b) => b.date.localeCompare(a.date));
}
export const hasFilter = (f) => Boolean(f && (f.q?.trim() || f.kind || f.categoryId || f.accountId || f.min != null || f.max != null || f.from || f.to));
