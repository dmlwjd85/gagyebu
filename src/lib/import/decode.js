// 파일 바이트 → 글자. 국내 은행·카드사 CSV는 EUC-KR(CP949)인 경우가 많아 자동 판별.
const HANGUL = /[가-힣]/g;
const MOJIBAKE = /\uFFFD|[\u00C0-\u00FF]{3,}/g; // 깨진 글자 흔적

/** 글자 판별 점수: 한글이 많고 깨진 글자가 적을수록 높음 */
export function textScore(s) {
  const h = (s.match(HANGUL) || []).length;
  const bad = (s.match(MOJIBAKE) || []).length;
  return h - bad * 10;
}

/**
 * @param {Uint8Array} bytes
 * @param {'auto'|'utf-8'|'euc-kr'} prefer
 * @returns {{ text: string, encoding: 'utf-8'|'euc-kr' }}
 */
export function decodeBytes(bytes, prefer = 'auto') {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf && prefer !== 'euc-kr') {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  }
  if (prefer === 'utf-8') return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8' };
  if (prefer === 'euc-kr') return { text: new TextDecoder('euc-kr').decode(bytes), encoding: 'euc-kr' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    const euc = new TextDecoder('euc-kr').decode(bytes);
    const utf = new TextDecoder('utf-8').decode(bytes);
    return textScore(euc) >= textScore(utf) ? { text: euc, encoding: 'euc-kr' } : { text: utf, encoding: 'utf-8' };
  }
}
