// 계산기 계산 로직(화면과 분리, eval 쓰지 않음).
// - 연산: + − × ÷, 괄호 없이 곱셈·나눗셈 먼저(연산 우선순위).
// - 결과는 원 단위 정수로 반올림(0.5는 0에서 먼 쪽으로: 2.5 → 3, −2.5 → −3).
// - 0으로 나누기·아주 큰 수·잘못된 식은 값 대신 오류 이유를 돌려줌.
// - 입력은 press(상태, 키)로 한 글자씩: 연산자를 연달아 누르면 마지막 것으로 바꿈, 맨 앞·×·÷ 뒤의 −는 음수 부호.

export const OPS = ['+', '−', '×', '÷'];
/** 숫자 하나에 넣을 수 있는 정수 자리 수(1,000조 미만) */
export const MAX_INT_DIGITS = 15;
/** 소수 자리 수 */
export const MAX_FRAC_DIGITS = 4;
/** 식 전체 길이(글자) */
export const MAX_EXPR = 80;
/** 결과로 받는 가장 큰 크기(원). 이보다 크면 'overflow' */
export const MAX_RESULT = 999_999_999_999_999;

export const ERRORS = {
  div0: '0으로 나눌 수 없어요.',
  overflow: '숫자가 너무 커요. 1,000조 원 아래로 계산해 주세요.',
  syntax: '식을 다시 확인해 주세요.',
  empty: '',
};

/** 키보드·붙여넣기 글자를 계산기 연산자로 */
export function normalizeOp(ch) {
  if (ch === '+') return '+';
  if (ch === '-' || ch === '−' || ch === '–' || ch === '—') return '−';
  if (ch === '*' || ch === '×' || ch === 'x' || ch === 'X' || ch === '✕') return '×';
  if (ch === '/' || ch === '÷') return '÷';
  return null;
}

const isOp = (c) => OPS.includes(c);

/** 식 → [{n}, {op}, {n}, …]. 쉼표·빈칸은 무시. 맨 앞·연산자 뒤의 −는 다음 숫자의 부호. 잘못되면 null */
export function tokenize(expr) {
  const src = String(expr ?? '').replace(/[,\s원]/g, '');
  const out = [];
  let i = 0;
  let sign = 1;
  let expectNum = true;
  while (i < src.length) {
    const ch = src[i];
    const op = normalizeOp(ch);
    if (expectNum) {
      if (op === '−') { sign = -sign; i += 1; continue; }
      if (op === '+') { i += 1; continue; } // 맨 앞의 +는 그냥 양수
      const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
      if (!m) return null;
      const n = Number(m[1]);
      if (!Number.isFinite(n)) return null;
      out.push({ n: sign * n });
      sign = 1;
      expectNum = false;
      i += m[1].length;
    } else {
      if (!op) return null;
      out.push({ op });
      expectNum = true;
      i += 1;
    }
  }
  return out;
}

/** 식을 계산. { ok: true, value } 또는 { ok: false, error: 'empty'|'syntax'|'div0'|'overflow' }.
    끝에 남은 연산자(예: '5+')는 무시하고 계산합니다. */
export function evaluate(expr) {
  const toks = tokenize(expr);
  if (!toks) return { ok: false, error: 'syntax' };
  if (toks.length && toks.at(-1).op) toks.pop();
  if (!toks.length) return { ok: false, error: 'empty' };
  // 1단계: × ÷ 먼저 묶어 항으로, 2단계: 항을 더하고 뺌
  const terms = [];
  let cur = toks[0].n;
  let addSign = 1;
  for (let k = 1; k < toks.length; k += 2) {
    const op = toks[k].op;
    const n = toks[k + 1].n;
    if (op === '×') cur *= n;
    else if (op === '÷') {
      if (n === 0) return { ok: false, error: 'div0' };
      cur /= n;
    } else {
      terms.push(addSign * cur);
      addSign = op === '−' ? -1 : 1;
      cur = n;
    }
    if (!Number.isFinite(cur) || Math.abs(cur) > 1e21) return { ok: false, error: 'overflow' };
  }
  terms.push(addSign * cur);
  let sum = 0;
  for (const t of terms) sum += t;
  if (!Number.isFinite(sum) || Math.abs(sum) > 1e21) return { ok: false, error: 'overflow' };
  return { ok: true, value: sum };
}

/** 원 단위 정수로 반올림(0.5는 0에서 먼 쪽). 부동소수 오차(0.1+0.2 등)는 15자리로 다듬은 뒤 반올림. −0은 0 */
export function roundWon(x) {
  const v = Number(Number(x).toPrecision(15));
  const r = Math.sign(v) * Math.round(Math.abs(v));
  return r === 0 ? 0 : r;
}

/** 식 → 원 단위 결과. { ok: true, won } 또는 { ok: false, error } */
export function calcWon(expr) {
  const r = evaluate(expr);
  if (!r.ok) return r;
  const won = roundWon(r.value);
  if (Math.abs(won) > MAX_RESULT) return { ok: false, error: 'overflow' };
  return { ok: true, won };
}

/** 원 금액을 식 글자로(음수는 계산기 부호 −) */
export const exprFromWon = (won) => {
  const n = Math.trunc(Number(won) || 0);
  return n === 0 ? '' : n < 0 ? `−${-n}` : String(n);
};

/** 화면용: 정수 부분에 천 단위 쉼표 */
export function formatExpr(expr) {
  return String(expr ?? '').replace(/\d+(\.\d*)?/g, (m) => {
    const [a, b] = m.split('.');
    const int = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return b === undefined ? int : `${int}.${b}`;
  });
}

/** 화면 읽기 프로그램용 */
export function speakExpr(expr) {
  return formatExpr(expr).replace(/\+/g, ' 더하기 ').replace(/−/g, ' 빼기 ').replace(/×/g, ' 곱하기 ').replace(/÷/g, ' 나누기 ').replace(/\s+/g, ' ').trim();
}

/** 지금 쓰는 숫자 조각(마지막 연산자 뒤) */
const lastNumber = (expr) => /(\d*\.?\d*)$/.exec(expr)[1];

/**
 * 키 하나 누르기. state = { expr, fresh } (fresh: 방금 = 으로 결과를 낸 상태 → 숫자를 누르면 새 식, 연산자를 누르면 결과에 이어서)
 * key: '0'~'9', '00', '000', '.', '+', '−', '×', '÷'(또는 - * / x), '⌫', 'C'. '='는 화면 쪽에서 calcWon 으로 처리.
 * 새 상태를 돌려줌(받은 상태는 바꾸지 않음).
 */
export function press(state, key) {
  let expr = String(state?.expr ?? '');
  const fresh = !!state?.fresh;
  if (key === 'C') return { expr: '', fresh: false };
  if (key === '⌫') return { expr: fresh ? '' : expr.slice(0, -1), fresh: false };
  const op = normalizeOp(key);
  if (op) {
    if (!expr) return op === '−' ? { expr: '−', fresh: false } : { expr: '', fresh: false };
    if (expr.endsWith('.')) expr = expr.slice(0, -1);
    const last = expr.at(-1);
    if (isOp(last)) {
      const prev = expr.at(-2);
      // '5×−' 처럼 부호로 붙은 − 뒤에서 다른 연산자 → 부호와 앞 연산자를 함께 바꿈
      if (last === '−' && (prev === undefined || prev === '×' || prev === '÷')) {
        if (prev === undefined) return { expr: op === '−' ? '−' : '', fresh: false };
        if (op === '−') return { expr, fresh: false };
        return { expr: expr.slice(0, -2) + op, fresh: false };
      }
      // × ÷ 뒤의 −는 음수 부호로 붙임(5×−3). 나머지는 마지막 연산자를 바꿈
      if (op === '−' && (last === '×' || last === '÷')) return { expr: expr + '−', fresh: false };
      return { expr: expr.slice(0, -1) + op, fresh: false };
    }
    if (expr.length >= MAX_EXPR) return { expr, fresh: false };
    return { expr: expr + op, fresh: false };
  }
  if (key === '.' || key === ',') {
    if (fresh) expr = '';
    const num = lastNumber(expr);
    if (num.includes('.')) return { expr, fresh: false };
    if (expr.length + 2 > MAX_EXPR) return { expr, fresh: false };
    return { expr: expr + (num === '' ? '0.' : '.'), fresh: false };
  }
  if (/^\d+$/.test(key)) {
    if (fresh) expr = '';
    const num = lastNumber(expr);
    const [intPart, frac] = num.split('.');
    if (frac !== undefined) {
      const room = MAX_FRAC_DIGITS - frac.length;
      if (room <= 0) return { expr, fresh: false };
      return { expr: (expr + key.slice(0, room)).slice(0, MAX_EXPR), fresh: false };
    }
    // 앞자리 0 정리: '0' 뒤에 숫자를 누르면 0을 바꿈, 빈 칸에 '00'은 '0'
    let base = expr;
    let digits = key;
    if (intPart === '0') { base = expr.slice(0, -1); digits = key.replace(/^0+(?=\d)/, '') || '0'; }
    else if (intPart === '') digits = key.replace(/^0+(?=\d)/, '') || '0';
    if (intPart === '0' && /^0+$/.test(key)) return { expr, fresh: false };
    const nextInt = (intPart === '0' ? '' : intPart) + digits;
    if (nextInt.length > MAX_INT_DIGITS) {
      const room = MAX_INT_DIGITS - (intPart === '0' ? 0 : intPart.length);
      if (room <= 0) return { expr, fresh: false };
      digits = digits.slice(0, room);
    }
    if ((base + digits).length > MAX_EXPR) return { expr, fresh: false };
    return { expr: base + digits, fresh: false };
  }
  return { expr, fresh };
}

/** 여러 키를 차례로(시험·붙여넣기용) */
export function pressAll(keys, state = { expr: '', fresh: false }) {
  let s = state;
  for (const k of keys) s = press(s, k);
  return s;
}

/** 붙여넣은 글자(예: '12,000 + 3,500원')를 계산기 식으로. 숫자·연산자·점 말고는 버림 */
export function exprFromText(text) {
  let s = { expr: '', fresh: false };
  for (const ch of String(text ?? '')) {
    if (/\d/.test(ch) || ch === '.' || normalizeOp(ch)) s = press(s, ch);
  }
  return s.expr;
}
