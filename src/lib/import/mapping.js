// 머리글 행 찾기 + 열 용도 자동 추정 + 카드사 프리셋(사전조사 2절. ★ 실제 샘플 검증 전 추정값)
export const ROLES = ['date', 'desc', 'amount', 'out', 'in', 'memo', 'status', 'approval', 'card', 'ignore'];
export const ROLE_LABEL = { date: '날짜', desc: '내용(가맹점)', amount: '금액', out: '출금액', in: '입금액', memo: '메모', status: '상태', approval: '승인번호', card: '카드번호(끝 4자리만)', ignore: '무시' };

const norm = (s) => String(s ?? '').replace(/\s|\(.*?\)|\[.*?\]/g, '');
// 열 이름 후보(앞일수록 우선)
const CANDIDATES = {
  date: ['이용일자', '이용일', '거래일자', '거래일시', '거래일', '승인일자', '승인일시', '사용일자', '사용일', '일자', '날짜', 'date'],
  desc: ['가맹점명', '이용가맹점', '이용하신곳', '가맹점', '사용처', '거래처', '적요', '내용', '기록사항', '거래내용', '받는분', '보낸분', 'description', 'merchant'],
  amount: ['이용금액', '결제금액', '승인금액', '사용금액', '금액', '거래금액', 'amount'],
  out: ['출금액', '출금금액', '찾으신금액', '출금', '지급금액'],
  in: ['입금액', '입금금액', '맡기신금액', '입금'],
  memo: ['메모', '비고', '할부', '할부개월', '이용구분', '거래구분', '구분'],
  status: ['상태', '취소여부', '승인상태', '처리상태', '매출구분'],
  approval: ['승인번호'],
  card: ['카드번호', '이용카드', '카드'],
};
const SKIP = ['잔액', '부가세', '사업자등록번호', '가맹점번호', '관계', '포인트', '수수료', '해외', '원금'];

/** 셀 이름이 어느 용도인지 (없으면 null) */
export function roleOf(name) {
  const n = norm(name);
  if (!n || SKIP.some((k) => n.includes(k))) return null;
  for (const [role, list] of Object.entries(CANDIDATES)) {
    if (list.some((k) => n === k || n.toLowerCase() === k)) return role;
  }
  for (const [role, list] of Object.entries(CANDIDATES)) {
    if (list.some((k) => k.length >= 2 && n.includes(k))) return role;
  }
  return null;
}

/** 위 15줄 안에서 '날짜' 열과 '금액(또는 입·출금)' 열이 함께 있는 첫 줄 = 머리글 */
export function detectHeaderRow(rows, scan = 15) {
  for (let i = 0; i < Math.min(scan, rows.length); i++) {
    const roles = rows[i].map(roleOf);
    if (roles.includes('date') && (roles.includes('amount') || roles.includes('out') || roles.includes('in'))) return i;
  }
  return 0;
}

export const PRESETS = [
  { id: 'hyundai', label: '현대카드', emoji: '💳', verified: true, need: ['이용일', '가맹점명', '이용금액'], any: ['승인금액', '상태', '할부'] },
  { id: 'shinhan', label: '신한카드', emoji: '💳', verified: true, need: ['이용일자', '가맹점명', '이용금액'] },
  { id: 'bank', label: '은행 공통', emoji: '🏦', verified: false, need: ['출금', '입금'] },
];

/** 머리글 → 프리셋 판별 */
export function detectPreset(header) {
  const h = header.map(norm);
  const has = (k) => h.some((x) => x === k || x.includes(k));
  for (const p of PRESETS) {
    if (p.id === 'hyundai' && !(p.need.every((k) => h.includes(k)) && p.any.some(has))) continue;
    if (p.id === 'shinhan' && !p.need.every((k) => h.includes(k))) continue;
    if (p.id === 'bank' && !p.need.every(has)) continue;
    return p;
  }
  return { id: 'generic', label: '일반 형식', emoji: '📄', verified: false };
}

/** 머리글 → 열마다 용도. 같은 용도가 여러 열이면 첫 열만 */
export function guessMapping(header) {
  const used = new Set();
  const cols = header.map((name) => {
    const r = roleOf(name);
    if (!r || used.has(r)) return 'ignore';
    used.add(r); return r;
  });
  // 은행: 입금·출금이 있으면 따로 처리(금액 열은 무시)
  const split = cols.includes('out') || cols.includes('in');
  if (split && cols.includes('amount')) cols[cols.indexOf('amount')] = 'ignore';
  return { cols, split };
}

/** 머리글 서명(이 맞춤 기억하기 키): 열 이름만, 개인정보 없음 */
export const headerSignature = (header) => header.map(norm).join('|');

/** 필수 열 확인 → 빠진 것 안내 문구 목록 */
export function missingRoles(cols) {
  const out = [];
  if (!cols.includes('date')) out.push('날짜 열을 골라 주세요.');
  if (!cols.includes('amount') && !cols.includes('out') && !cols.includes('in')) out.push('금액 열을 골라 주세요.');
  return out;
}
