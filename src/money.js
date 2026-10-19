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
