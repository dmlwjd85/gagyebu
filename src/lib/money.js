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
// 음수 지출 = 카드 환불(지출 차감) → '+'로 보임
export const signedWon = (amount, kind) => (kind === 'income' || amount < 0 ? '+' : '−') + formatWon(Math.abs(amount));
export const isPlus = (t) => t.kind === 'income' || t.amount < 0;
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

/**
 * 순지출(환불 차감 후)을 '쓴 돈'과 '더 돌려받은 환불'로 나눔(QA N10).
 * 지출은 0 밑으로 내려가지 않음: −49,000원 대신 '지출 0원 · 환불 +49,000원'
 */
export function spendParts(net) {
  const v = Math.trunc(Number(net) || 0);
  return { spent: Math.max(0, v), refund: Math.max(0, -v) };
}
/** 한 줄 지출 표기: '40,000원' 또는 '0원 · 환불 +49,000원'. fmt로 compactWon 등 짧은 표기도 가능 */
export function spendText(net, fmt = formatWon) {
  const { spent, refund } = spendParts(net);
  return refund ? `${fmt(0)} · 환불 +${fmt(refund)}` : fmt(spent);
}
/** 나간 돈 표기(앞에 '−'): 0원이면 기호 없음. 음수(환불 초과)는 0원으로 보고 환불은 따로 */
export const minusWon = (net, fmt = formatWon) => { const { spent } = spendParts(net); return (spent ? '−' : '') + fmt(spent); };

/** 퍼센트 정수로 나누기(최대 나머지 방식): 합이 정확히 100(값이 하나라도 있으면). 음수·NaN은 0 */
export function percents(values) {
  const v = values.map((x) => Math.max(0, Number(x) || 0));
  const sum = v.reduce((a, x) => a + x, 0);
  if (!sum) return v.map(() => 0);
  const raw = v.map((x) => (x / sum) * 100), out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, x) => a + x, 0);
  raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0 && v[i] > 0) { out[i]++; left--; } });
  return out;
}

/** 저축률 설명: 100%를 넘으면(환불이 지출보다 많은 달) 사람 말로 이유를 알려 줌. 그 밖엔 null */
export function rateNote({ income, expense }) {
  if (!income) return null;
  const { refund } = spendParts(expense);
  const rate = Math.round(((income - expense) / income) * 100);
  if (rate <= 100 || !refund) return null;
  return `이 달엔 환불받은 돈이 쓴 돈보다 ${formatWon(refund)} 더 많았어요. 그래서 번 돈보다 많이 남은 셈이 되어 저축률이 ${rate}%로 나와요. 예전에 결제한 걸 이 달에 돌려받은 거라, 다음 달부터는 평소 저축률로 돌아올 거예요.`;
}
