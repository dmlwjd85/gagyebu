// CSV 내보내기. 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM, 수식 주입 방지.
const HEADER = ['날짜', '구분', '카테고리', '금액', '결제수단', '메모'];
export function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // 엑셀 수식 주입 방지
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCSV(txs, { categories = [], accounts = [] } = {}) {
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const rows = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .map((t) => [t.date, t.kind === 'income' ? '수입' : '지출', cat.get(t.categoryId) ?? '기타', t.amount,
      acc.get(t.accountId) ?? '', t.memo ?? '']);
  return '\uFEFF' + [HEADER, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
