// 자동 분류: 내 규칙(가맹점 → 카테고리) 먼저, 없으면 기본 키워드 추정, 그래도 없으면 '기타'.
import { FALLBACK_CATEGORY } from './defaults.js';

// 기본 키워드(지출). 내 규칙이 항상 우선
export const KEYWORDS = [
  ['cafe', ['스타벅스', 'starbucks', '커피', '카페', '투썸', '이디야', '메가커피', '메가mgc', '빽다방', '컴포즈', '폴바셋', '할리스', '파스쿠찌', '배스킨', '던킨', '베이커리', '빵집', '제과', '파리바게뜨', '뚜레쥬르', '디저트']],
  ['transit', ['택시', '카카오t', '카카오모빌리티', '버스', '지하철', '코레일', 'srt', '티머니', '주유', 'gs칼텍스', 's-oil', '에스오일', 'sk에너지', '현대오일', '주차', '하이패스', '도로공사', '고속', '자전거', '따릉이', '킥보드', '우버', 'uber']],
  ['living', ['gs25', 'cu', '세븐일레븐', '이마트', '홈플러스', '롯데마트', '다이소', '쿠팡', '마켓컬리', '컬리', '편의점', '마트', '코스트코', '올리브영', '노브랜드']],
  ['telecom', ['넷플릭스', 'netflix', '유튜브', 'youtube', '티빙', '웨이브', '디즈니', '왓챠', '멜론', '지니', '스포티파이', 'skt', 'sk텔레콤', 'kt', 'lg유플러스', 'lgu+', '통신', '애플', 'apple', 'google', '구글', '쿠팡와우', '네이버플러스']],
  ['food', ['배달의민족', '배민', '요기요', '쿠팡이츠', '식당', '김밥', '국밥', '치킨', '피자', '맥도날드', '버거킹', '롯데리아', '서브웨이', '분식', '한식', '중식', '일식', '고기', '반점', '식당']],
  ['health', ['약국', '병원', '의원', '치과', '한의원', '안과', '피부과']],
  ['culture', ['cgv', '메가박스', '롯데시네마', '영화', '서점', '교보', 'yes24', '알라딘', '인터파크', '티켓']],
  ['fashion', ['무신사', '유니클로', '자라', '에이블리', '지그재그', '29cm', '탑텐', '스파오', '나이키', '아디다스']],
  ['housing', ['관리비', '월세', '전기', '가스', '수도', '도시가스']],
  ['edu', ['학원', '교육', '클래스101', '인프런', '강의']],
];
export const INCOME_KEYWORDS = [['salary', ['급여', '월급', '상여']], ['refund', ['환급', '캐시백', '환불', '취소']], ['interest', ['이자', '배당']]];

const low = (s) => String(s ?? '').toLowerCase().replace(/\s/g, '');
// 담배(KT&G)처럼 '통신 kt'와 헷갈리는 상호
const NOT_KEYWORD = ['kt&g'];

/** 규칙에 맞는 카테고리(가장 긴 글자가 맞은 규칙 우선). 없으면 null */
export function matchRule(text, rules = []) {
  const t = low(text);
  let best = null;
  for (const r of rules) {
    const m = low(r.match);
    if (m && t.includes(m) && (!best || m.length > low(best.match).length)) best = r;
  }
  return best ? best.categoryId : null;
}

/**
 * @param {{desc?: string, memo?: string, kind: 'expense'|'income'}} tx
 * @param {Array<{match: string, categoryId: string}>} rules 내 규칙
 * @param {Set<string>|null} validIds 실제 있는 카테고리 id(지워진 카테고리로 분류되지 않게)
 * @returns {{ categoryId: string, by: 'rule'|'keyword'|'fallback' }}
 */
export function classify(tx, rules = [], validIds = null) {
  const text = tx.desc || tx.memo || '';
  const ok = (id) => id && (!validIds || validIds.has(id));
  const r = matchRule(text, rules);
  if (ok(r)) return { categoryId: r, by: 'rule' };
  let t = low(text);
  for (const w of NOT_KEYWORD) t = t.split(w).join(' ');
  const tokens = t.split(/[^a-z0-9+&가-힣]+/).concat(String(text).toLowerCase().split(/[^a-z0-9+&가-힣]+/));
  // 'cu'·'kt'처럼 짧은 영문은 낱말이 통째로 같을 때만(다른 낱말 속 글자에 걸리지 않게)
  const hit = (w) => (w.length <= 3 && /^[a-z0-9+]+$/.test(w) ? tokens.includes(w) : t.includes(w));
  // 가장 긴(구체적인) 키워드가 이김: '쿠팡이츠'(식비) > '쿠팡'(생활), '자전거'(교통) > '전기'(주거)
  let best = null;
  for (const [id, words] of tx.kind === 'income' ? INCOME_KEYWORDS : KEYWORDS) {
    if (!ok(id)) continue;
    for (const w of words) if (hit(w) && (!best || w.length > best.w.length)) best = { id, w };
  }
  if (best) return { categoryId: best.id, by: 'keyword' };
  return { categoryId: FALLBACK_CATEGORY[tx.kind] ?? 'etc', by: 'fallback' };
}

// 규칙 글자로 쓰면 안 되는 일반어: 날짜·숫자·결제 방식 같은 말
const GENERIC = /^(\d+([월일년회차개]|월분)?|[0-9.,:/-]+|해외|국내|온라인|오프라인|결제|자동이체|자동납부|정기|정기결제|구독|이체|입금|출금|카드|체크|일시불|할부|승인|취소|환불|부분취소|본인|가족|기타|주식회사|㈜|\(주\))$/;
const BRANDS = () => KEYWORDS.flatMap(([, ws]) => ws).filter((w) => w.length >= 2).sort((a, b) => b.length - a.length);

/** 분류를 고쳤을 때 만들 규칙 글자: '스타벅스 강남R점' → '스타벅스', '10월 월세' → '월세'. 알맞은 글자가 없으면 null */
export function merchantKey(text) {
  const s = String(text ?? '').split(' · ')[0].replace(/\(주\)|㈜|주식회사/g, ' ').replace(/#[^\s#]+/g, ' ').trim();
  const words = s.split(/\s+/).filter((w) => w && !GENERIC.test(w.toLowerCase()));
  const first = words[0] ?? '';
  if (!first) return null;
  // 알려진 상호로 시작하면 상호만('스타벅스강남R점' → '스타벅스')
  const brand = BRANDS().find((b) => first.toLowerCase().startsWith(b) && b.length >= 3);
  if (brand && first.length > brand.length) return first.slice(0, brand.length);
  // 끝의 지점명 떼기('역삼점', '강남R점')
  const k = first.replace(/(본점|지점|[가-힣A-Za-z0-9]{1,6}점)$/, (m) => (first.length - m.length >= 2 ? '' : m));
  const key = (k.length >= 2 ? k : first).slice(0, 40);
  return key.length >= 2 && !GENERIC.test(key.toLowerCase()) ? key : null;
}

/**
 * 거래 분류를 고쳤을 때 규칙을 제안할지
 * @returns {{ key: string, existing?: object } | null} existing = 같은 글자의 규칙(카테고리가 다를 때 바꿀지 물음)
 */
export function ruleSuggestion(before, after, rules = []) {
  if (!before || before.categoryId === after.categoryId) return null;
  const key = merchantKey(after.memo);
  if (!key) return null;
  if (matchRule(after.memo, rules) === after.categoryId) return null; // 이미 맞는 규칙이 있음
  const existing = rules.find((r) => low(r.match) === low(key));
  if (existing?.categoryId === after.categoryId) return null;
  return { key, existing };
}

/** 받침에 맞는 조사: josa('GS25', '은는') → 'GS25는', josa('식비', '으로') → '식비로' */
export function josa(word, kind) {
  const w = String(word ?? '').trim();
  // 따옴표·괄호로 끝나면 그 앞 글자로 판단("'쿠팡'" → '쿠팡')
  const ch = w.replace(/[^가-힣A-Za-z0-9]+$/, '').at(-1) ?? '';
  let final = null; // 받침 유무, ㄹ받침 여부
  const code = ch.charCodeAt(0) - 0xac00;
  if (code >= 0 && code < 11172) { const f = code % 28; final = { has: f > 0, rieul: f === 8 }; }
  else if (/[0-9]/.test(ch)) final = { has: '013678'.includes(ch), rieul: '178'.includes(ch) };
  else if (/[a-z]/i.test(ch)) final = { has: /[lmnr]/i.test(ch), rieul: /[lr]/i.test(ch) };
  else final = { has: false, rieul: false };
  if (kind === '은는') return w + (final.has ? '은' : '는');
  if (kind === '이가') return w + (final.has ? '이' : '가');
  if (kind === '을를') return w + (final.has ? '을' : '를');
  if (kind === '으로') return w + (final.has && !final.rieul ? '으로' : '로');
  return w;
}
