// 중복 감지 (design-spec 11절 ③)
//  확실 중복: importHash 같음 또는 승인번호 같음
//  중복 의심: 날짜·금액 같고 가맹점 유사도 0.8 이상 / 파일 안에서 같은 줄 반복
export const normText = (s) => String(s ?? '').toLowerCase().replace(/[\s()\[\]·,.\-_/]|주식회사|\(주\)|㈜/g, '');

/** FNV-1a 64비트 → 16자리 hex (동기, 원문 복원 불가) */
export function fnv1a64(str) {
  let h = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(str);
  for (const b of bytes) { h ^= BigInt(b); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return h.toString(16).padStart(16, '0');
}

/** 거래 지문: 승인번호가 있으면 그것 우선, 없으면 날짜·금액·구분·가맹점 */
export function importHash(x) {
  const key = x.approval ? `a|${x.date}|${x.approval}` : `t|${x.date}|${x.amount}|${x.kind}|${normText(x.desc ?? x.memo)}`;
  return fnv1a64(key);
}

/** 두 글의 비슷한 정도 0~1 (글자 2개 묶음 Dice 계수) */
export function similarity(a, b) {
  const x = normText(a), y = normText(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;
  const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const gx = grams(x), gy = grams(y);
  let inter = 0;
  for (const [g, n] of gx) inter += Math.min(n, gy.get(g) || 0);
  // 한쪽이 다른 쪽을 포함하면(예: '스타벅스' ⊂ '스타벅스강남R점') 의심으로 봄
  const contain = x.includes(y) || y.includes(x) ? 0.8 : 0;
  return Math.max(contain, (2 * inter) / (x.length - 1 + y.length - 1));
}

/**
 * @param {Array} items 가져올 후보(toCandidates 결과)
 * @param {Array} existing 이미 있는 거래({date, amount, kind, memo, importHash})
 * @returns {{ fresh: Array, sure: Array, suspect: Array<{item, match, reason}> }}
 */
export function findDuplicates(items, existing, threshold = 0.8) {
  const hashes = new Set(existing.map((t) => t.importHash).filter(Boolean));
  const byKey = new Map();
  for (const t of existing) {
    const k = `${t.date}|${t.amount}|${t.kind}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(t);
  }
  const count = new Map(), first = new Map();
  const fresh = [], sure = [], suspect = [];
  for (const raw of items) {
    // 같은 날 같은 곳에서 같은 금액을 두 번 쓴 경우: 두 번째부터는 '#2'를 붙인 지문 → 다시 가져와도 정확히 중복 판정
    const base = raw.importHash ?? importHash(raw);
    const n = (count.get(base) || 0) + 1; count.set(base, n);
    const item = { ...raw, importHash: n === 1 ? base : fnv1a64(`${base}#${n}`) };
    if (hashes.has(item.importHash)) { sure.push(item); continue; }
    const same = (byKey.get(`${item.date}|${item.amount}|${item.kind}`) || []).find((t) => similarity(t.memo, item.desc || item.memo) >= threshold);
    if (same) { suspect.push({ item, match: same, reason: 'existing' }); continue; }
    if (n > 1) { suspect.push({ item, match: first.get(base), reason: 'file' }); continue; }
    first.set(base, item);
    fresh.push(item);
  }
  return { fresh, sure, suspect };
}
