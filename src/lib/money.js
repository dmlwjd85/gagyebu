// 금액은 항상 정수 원(KRW). 부동소수 금지.
export function formatKRW(n) {
  const v = Math.trunc(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  return sign + '₩' + Math.abs(v).toLocaleString('ko-KR');
}
// 사용자 입력("₩1,234", "1 234원", "-500") → 정수. 숫자가 없으면 null.
export function parseKRW(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.trunc(input) : null;
  if (typeof input !== 'string') return null;
  const s = input.trim();
  const neg = /^-/.test(s) || /^₩\s*-/.test(s);
  const digits = s.split('.')[0].replace(/[^0-9]/g, '');
  if (!digits) return null;
  const v = parseInt(digits, 10);
  if (!Number.isSafeInteger(v)) return null;
  return neg ? -v : v;
}
export function sumKRW(amounts) {
  return (amounts || []).reduce((acc, a) => {
    if (!Number.isInteger(a)) throw new TypeError(`정수 원 금액이 아닙니다: ${a}`);
    return acc + a;
  }, 0);
}
// 화면 표기: "12,300원" / 부호 표기: "−12,300원"(지출), "+12,300원"(수입)
export function formatWon(n) {
  const v = Math.trunc(Number(n) || 0);
  return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('ko-KR') + '원';
}
export const signedWon = (amount, kind) => (kind === 'income' ? '+' : '−') + formatWon(Math.abs(amount));
// 짧은 표기(달력 칸): 12,300 → "1.2만", 9,800 → "9,800"
export function shortWon(n) {
  const v = Math.abs(Math.trunc(n));
  if (v >= 100_000_000) return `${+(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${+(v / 10_000).toFixed(v >= 100_000 ? 0 : 1)}만`;
  return v.toLocaleString('ko-KR');
}
// 좁은 칸용 금액: 10만 원 미만은 그대로, 이상은 만 단위 ("108.7만원", "310만원")
export function compactWon(n) {
  const v = Math.trunc(Number(n) || 0), a = Math.abs(v), sign = v < 0 ? '−' : '';
  if (a < 100_000) return sign + a.toLocaleString('ko-KR') + '원';
  if (a >= 100_000_000) return sign + (+(a / 100_000_000).toFixed(2)).toLocaleString('ko-KR') + '억원';
  const man = a / 10_000;
  return sign + (a < 1_000_000 ? +man.toFixed(1) : Math.round(man)).toLocaleString('ko-KR') + '만원';
}
