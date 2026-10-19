// 문서 id 형식: firestore.rules의 id()·looksLikeCard()와 같은 기준(앱이 규칙에 거부될 id를 만들지 않게).
// 숫자 13개 이상이 영문·밑줄만 사이에 두고 이어지면 카드번호 모양으로 보고 거부됨.
export const CARD_LIKE = /([0-9][A-Za-z_]*){12}[0-9]/;
export const looksLikeCard = (v) => CARD_LIKE.test(String(v));
const PLAIN = /^[A-Za-z0-9_]{1,64}$/;
const DEFAULT_ID = /^[a-z]{1,20}(-[a-z]{1,20}){1,3}$/;
/** 규칙이 받아 주는 id인지(필드 값·문서 경로 공통) */
export const isRuleId = (v) => typeof v === 'string' && ((PLAIN.test(v) && !looksLikeCard(v)) || DEFAULT_ID.test(v));

/**
 * 자동 id 만들기: 카드번호 모양(숫자 13개 이상)이 나오면 다시 뽑음.
 * Firestore 자동 id(영문·숫자 20자)에서 그런 id가 나올 확률은 약 100만분의 1이라 보통 한 번에 끝남.
 * @param {() => {id: string}} make 새 문서 참조를 만드는 함수(doc(collection(...)))
 */
/** 거래 문서 id: 규칙의 txDocId()와 같음(일반 id 또는 rec-{반복id}-{YYYY-MM}) */
export const isTxDocId = (v) => isRuleId(v) || (typeof v === 'string' && v.length >= 12 && v.length <= 80
  && /^rec-.+-[0-9]{4}-(0[1-9]|1[0-2])$/.test(v) && isRuleId(v.slice(4, -8)));

export function safeRef(make, tries = 20) {
  let ref = make();
  for (let i = 1; i < tries && !isRuleId(ref.id); i++) ref = make();
  return ref;
}

// 영문만으로 된 id(숫자가 없어 카드번호 모양이 될 수 없음). 같은 입력엔 늘 같은 결과.
const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function fnv(s, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
/**
 * 규칙에 맞지 않는 예전 반복 id → 늘 같은 새 id('rx' + 영문 18자).
 * 여러 기기가 동시에 옮겨도 같은 문서 하나로 모임(반복이 둘로 늘지 않음).
 */
export const fixedRecId = (oldId) => fixedId('rx', oldId);
/** 같은 seed → 늘 같은 id(prefix + 영문 18자). 숫자가 없어 규칙의 카드번호 검사에 걸리지 않음 */
export function fixedId(prefix, seed) {
  let out = prefix, h = fnv(seed, 2166136261);
  for (let i = 0; i < 18; i++) {
    if (i % 5 === 0) h = fnv(seed + i, h ^ 0x9e3779b9);
    out += LETTERS[h % 52]; h = Math.floor(h / 52);
  }
  return out;
}
