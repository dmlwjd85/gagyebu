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

// 가맹점 이름 정규화: 영문 ↔ 한글 별칭을 한글로 맞추고, '해외'·법인 표기·지점명을 뗌
// (카드 파일은 'NETFLIX.COM', 직접 기록은 '넷플릭스'처럼 서로 다르게 적는 일이 많음)
export const ALIASES = [
  ['넷플릭스', ['netflix']], ['스타벅스', ['starbucks']], ['유튜브', ['youtube']], ['쿠팡이츠', ['coupangeats']], ['쿠팡', ['coupang']],
  ['배달의민족', ['배민', 'baemin', 'woowa', '우아한형제들']], ['애플', ['apple', 'itunes']], ['구글', ['google']], ['스포티파이', ['spotify']],
  ['디즈니플러스', ['disneyplus', 'disney+', 'disney']], ['카카오', ['kakao']], ['네이버', ['naver']], ['이마트', ['emart']],
  ['다이소', ['daiso']], ['맥도날드', ['mcdonalds', 'mcdonald']], ['올리브영', ['oliveyoung']], ['메가박스', ['megabox']],
  ['아마존', ['amazon']], ['우버', ['uber']], ['에어비앤비', ['airbnb']], ['투썸플레이스', ['투썸', 'twosome']], ['이디야', ['ediya']],
  ['버거킹', ['burgerking']], ['써브웨이', ['subway', '서브웨이']], ['티빙', ['tving']], ['왓챠', ['watcha']], ['멜론', ['melon']],
];
export function normMerchant(s) {
  // 띄어 쓴 지점명('GS25 역삼점', '스타벅스 강남R점')은 마지막 낱말을 뗌
  const words = String(s ?? '').split(' · ')[0].trim().split(/\s+/);
  if (words.length > 1 && /(점|지점|본점)$/.test(words[words.length - 1])) words.pop();
  let t = normText(words.join(' ')).replace(/^(해외|국내|온라인)/, '').replace(/\.?(com|co\.kr|kr|net)$/, '').replace(/(inc|corp|ltd|korea|코리아)$/, '');
  for (const [ko, list] of ALIASES) {
    const k = [ko, ...list].map(normText).filter((x) => t.startsWith(x)).sort((a, b) => b.length - a.length)[0];
    if (k) { t = ko + t.slice(k.length); break; }
  }
  // 붙여 쓴 지점명: 알려진 상호로 시작하면 상호만('스타벅스강남r점' → '스타벅스'), 아니면 끝의 한글 2~4자+점을 뗌
  const brand = ALIASES.map(([ko]) => ko).filter((ko) => t.startsWith(ko)).sort((a, b) => b.length - a.length)[0];
  if (brand) return t.length === brand.length || /점$/.test(t) || /^[가-힣]{0,2}$/.test(t.slice(brand.length)) ? brand : t;
  const m = t.match(/^(.{2,}?)([가-힣]{2,4}(점|지점))$/);
  return m ? m[1] : t;
}

/** 두 가맹점 이름이 같은 곳인지 0~1 (별칭·지점명 정규화 뒤 similarity) */
export const merchantSimilarity = (a, b) => {
  const x = normMerchant(a), y = normMerchant(b);
  if (x && y && x === y) return 1;
  return similarity(x, y);
};

const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

/**
 * @param {Array} items 가져올 후보(toCandidates 결과, categoryId가 붙어 있으면 더 정확)
 * @param {Array} existing 이미 있는 거래({date, amount, kind, memo, categoryId, importHash})
 * @returns {{ fresh: Array, sure: Array, suspect: Array<{item, match, reason}> }}
 *  중복 의심 기준(같은 금액·같은 구분, 날짜 ±1일 안):
 *   ① 가맹점 이름이 비슷함(별칭·지점명 정규화 뒤 0.8 이상)
 *   ② 기존 기록이 직접 남긴 것(importHash 없음)이고 메모가 비었거나 카테고리가 같음
 *      → '평소 10초 기록 + 월말 카드 파일 가져오기'에서 같은 돈이 두 번 들어가는 것을 막음
 */
export function findDuplicates(items, existing, threshold = 0.8) {
  const hashes = new Set(existing.map((t) => t.importHash).filter(Boolean));
  const byAmt = new Map();
  for (const t of existing) {
    const k = `${Math.abs(t.amount)}|${t.kind}`;
    if (!byAmt.has(k)) byAmt.set(k, []);
    byAmt.get(k).push(t);
  }
  const used = new Set(); // 기존 기록 하나는 후보 하나와만 짝지음
  const count = new Map(), first = new Map();
  const fresh = [], sure = [], suspect = [];
  for (const raw of items) {
    // 같은 날 같은 곳에서 같은 금액을 두 번 쓴 경우: 두 번째부터는 '#2'를 붙인 지문 → 다시 가져와도 정확히 중복 판정
    const base = raw.importHash ?? importHash(raw);
    const n = (count.get(base) || 0) + 1; count.set(base, n);
    const item = { ...raw, importHash: n === 1 ? base : fnv1a64(`${base}#${n}`) };
    if (hashes.has(item.importHash)) { sure.push(item); continue; }
    const cands = (byAmt.get(`${Math.abs(item.amount)}|${item.kind}`) || [])
      .filter((t) => !used.has(t) && Math.abs(dayDiff(t.date, item.date)) <= 1 && Math.sign(t.amount) === Math.sign(item.amount));
    const score = (t) => {
      const sim = merchantSimilarity(t.memo, item.desc || item.memo);
      if (sim >= threshold) return 3 + sim - Math.abs(dayDiff(t.date, item.date)) * 0.1;
      if (!t.importHash && (!String(t.memo ?? '').trim() || (item.categoryId && t.categoryId === item.categoryId))) return 2 - Math.abs(dayDiff(t.date, item.date)) * 0.1;
      return 0;
    };
    const best = cands.map((t) => [t, score(t)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
    if (best) { used.add(best[0]); suspect.push({ item, match: best[0], reason: 'existing' }); continue; }
    if (n > 1) { suspect.push({ item, match: first.get(base), reason: 'file' }); continue; }
    first.set(base, item);
    fresh.push(item);
  }
  return { fresh, sure, suspect };
}
