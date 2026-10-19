// QA M2 재검수(7.3/10) 결함별 재발 방지 테스트. ID는 /workspace/qa-gagyebu-m2/보고서.md 기준
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { readTable, maskCardNo } from './import/read.js';
import { detectHeaderRow, detectPreset, guessMapping, PRESETS } from './import/mapping.js';
import { toCandidates, summarize, skipReasonText } from './import/transform.js';
import { findDuplicates, normMerchant, merchantSimilarity } from './import/dedupe.js';
import { withKeptFields, KEEP_ON_EDIT } from './txedit.js';
import { buildBackup } from './backup.js';
import { classify, merchantKey, ruleSuggestion, josa } from './classify.js';
import { detectSubscriptions } from './recurring.js';
import { goalProgress } from './goals.js';
import { searchTxs } from './search.js';
import { signedWon, isPlus } from './money.js';
import { validateTx } from './validate.js';
import { totals } from './stats.js';

const COLS = ['date', 'desc', 'amount', 'status', 'approval'];

describe('H1 직접 기록 ↔ 카드 파일 중복', () => {
  test('메모 없이 남긴 직접 기록(같은 금액·날짜 ±1일)은 중복 의심', () => {
    const existing = [{ id: 'm1', date: '2026-10-03', amount: 5600, kind: 'expense', memo: '', categoryId: 'cafe' }];
    const r = findDuplicates([{ date: '2026-10-04', amount: 5600, kind: 'expense', desc: '스타벅스 강남R점', approval: '1' }], existing);
    expect(r.fresh).toHaveLength(0);
    expect(r.suspect[0]).toMatchObject({ reason: 'existing', match: { id: 'm1' } });
  });
  test('영문·한글 별칭(NETFLIX.COM ↔ 넷플릭스)', () => {
    expect(normMerchant('NETFLIX.COM')).toBe('넷플릭스');
    expect(merchantSimilarity('넷플릭스', 'NETFLIX.COM')).toBe(1);
    const existing = [{ id: 'n', date: '2026-10-05', amount: 13500, kind: 'expense', memo: '넷플릭스', categoryId: 'telecom' }];
    expect(findDuplicates([{ date: '2026-10-05', amount: 13500, kind: 'expense', desc: 'NETFLIX.COM' }], existing).suspect).toHaveLength(1);
  });
  test('지점명·브랜드 정규화', () => {
    expect(normMerchant('GS25 역삼점')).toBe('gs25');
    expect(normMerchant('이디야커피 선릉점')).toBe('이디야');
    expect(normMerchant('스타벅스강남R점')).toBe('스타벅스');
    expect(normMerchant('쿠팡이츠')).toBe('쿠팡이츠'); // 쿠팡과 다른 곳
  });
  test('같은 금액이라도 날짜가 2일 이상 차이·다른 가맹점 메모·다른 카테고리면 새 거래', () => {
    const existing = [
      { date: '2026-10-01', amount: 5600, kind: 'expense', memo: '' },
      { date: '2026-10-03', amount: 5600, kind: 'expense', memo: '김밥천국', categoryId: 'food' },
    ];
    expect(findDuplicates([{ date: '2026-10-03', amount: 5600, kind: 'expense', desc: '스타벅스', categoryId: 'cafe' }], existing).fresh).toHaveLength(1);
  });
  test('기존 기록 하나는 후보 하나와만 짝(같은 날 같은 금액 두 번)', () => {
    const existing = [{ date: '2026-10-03', amount: 3000, kind: 'expense', memo: '' }];
    const r = findDuplicates([{ date: '2026-10-03', amount: 3000, kind: 'expense', desc: 'A', approval: '1' }, { date: '2026-10-03', amount: 3000, kind: 'expense', desc: 'B', approval: '2' }], existing);
    expect(r.suspect).toHaveLength(1); expect(r.fresh).toHaveLength(1);
  });
});

describe('H2 고칠 때 가져오기 필드 보존', () => {
  test('importHash·importBatch·card4·recurringId 유지', () => {
    const orig = { id: 't', importHash: '0123456789abcdef', importBatch: 'imp-a1', card4: '7012', recurringId: 'r1', memo: '쿠팡' };
    const edited = { id: 't', date: '2026-10-04', amount: 45000, kind: 'expense', categoryId: 'living', memo: '쿠팡 생필품' };
    expect(withKeptFields(edited, orig)).toMatchObject({ ...edited, importHash: orig.importHash, importBatch: 'imp-a1', card4: '7012', recurringId: 'r1' });
    expect(KEEP_ON_EDIT).toEqual(['importHash', 'importBatch', 'card4', 'recurringId']);
    expect(withKeptFields(edited, null)).toEqual(edited);
    expect(withKeptFields(edited, { memo: 'x' })).not.toHaveProperty('importHash');
  });
});

describe('H3 취소·환불·부분취소', () => {
  test('QA 재현: 같은 승인번호 음수 줄은 원거래 상계, 부분취소 줄은 남음', () => {
    const rows = [['2026.10.03', '스타벅스', '5,600', '정상', '111'], ['2026.10.03', '스타벅스', '-5,600', '정상', '111'], ['2026.10.04', '쿠팡', '45,000', '부분취소', '222']];
    const r = toCandidates(rows, { cols: COLS });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ desc: '쿠팡', amount: 45000, kind: 'expense' });
    expect(r.items[0].memo).toContain('부분취소');
    expect(r.offset).toBe(1);
  });
  test('원거래 없는 환불은 수입이 아니라 지출 차감 → 저축률이 부풀지 않음', () => {
    const r = toCandidates([['2026.10.08', '이마트', '-12,000', '정상', '9']], { cols: COLS });
    expect(r.items[0]).toMatchObject({ kind: 'expense', amount: -12000, refund: true });
    expect(summarize(r.items)).toMatchObject({ expense: -12000, refund: 12000, income: 0 });
    const t = totals([{ kind: 'expense', amount: 50000 }, { kind: 'expense', amount: -12000 }, { kind: 'income', amount: 100000 }]);
    expect(t).toMatchObject({ expense: 38000, income: 100000 });
    expect(isPlus({ kind: 'expense', amount: -12000 })).toBe(true);
    expect(signedWon(-12000, 'expense')).toBe('+12,000원');
  });
  test('부분 환불(금액이 다름)은 같은 가맹점 원거래에서 빼기', () => {
    const r = toCandidates([['2026.10.07', '쿠팡', '30,000', '정상', ''], ['2026.10.08', '쿠팡', '-10,000', '부분취소', '']], { cols: COLS });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ amount: 20000 });
    expect(r.items[0].memo).toContain('부분취소 반영');
  });
  test('부분취소인데 남은 이용금액 0 = 전부 취소', () => {
    const r = toCandidates([['2026.10.05', '메가박스', '0', '부분취소', '']], { cols: COLS });
    expect(r).toMatchObject({ cancelled: 1, invalid: 0 });
  });
  test('원거래보다 늦은 날짜의 결제와는 상계하지 않음', () => {
    const r = toCandidates([['2026.10.01', '쿠팡', '-5,000', '정상', ''], ['2026.10.02', '쿠팡', '5,000', '정상', '']], { cols: COLS });
    expect(r.items).toHaveLength(2); expect(r.offset).toBe(0);
  });
  test('직접 기록은 음수 불가, 가져온 환불만 음수 지출', () => {
    expect(validateTx({ date: '2026-10-08', amount: -12000, kind: 'expense', categoryId: 'living' })).toBeNull();
    expect(validateTx({ date: '2026-10-08', amount: -12000, kind: 'income', categoryId: 'refund' })).toBeTruthy();
  });
});

describe('H4·H5 현대카드 실제 형식(.xlsx 11열)', () => {
  const header = ['이용일', '카드번호', '가맹점명', '승인금액', '이용금액', '부가세', '관계', '할부', '상태', '가맹점번호', '사업자등록번호'];
  test('금액은 이용금액 열, 부가세·관계·가맹점번호는 무시', () => {
    const m = guessMapping(header);
    expect(m.cols[header.indexOf('이용금액')]).toBe('amount');
    expect(m.cols[header.indexOf('승인금액')]).toBe('ignore');
    for (const k of ['부가세', '관계', '가맹점번호', '사업자등록번호']) expect(m.cols[header.indexOf(k)]).toBe('ignore');
    expect(detectPreset(header).id).toBe('hyundai');
  });
  test('검증 안 된 프리셋은 verified false', () => {
    expect(PRESETS.every((p) => p.verified === false)).toBe(true);
  });
  test('예시 파일 끝까지: 해외결제 원화 이용금액, 취소·부분취소·환불·합계 줄, 카드번호 끝 4자리만', async () => {
    const t = await readTable(new Uint8Array(readFileSync('samples/현대카드_실제형식_예시.xlsx')), '현대카드_실제형식_예시.xlsx', { XLSX });
    const rows = t.sheets[0].rows;
    expect(JSON.stringify(rows)).not.toMatch(/5400-?1111/); // 읽자마자 마스킹: 미리보기에도 전체 번호 없음
    const h = detectHeaderRow(rows);
    expect(rows[h]).toContain('이용금액');
    const r = toCandidates(rows.slice(h + 1), guessMapping(rows[h].map(String)));
    expect(r).toMatchObject({ cancelled: 2, offset: 1, summary: 1, invalid: 0 });
    const by = Object.fromEntries(r.items.map((x) => [x.desc, x]));
    expect(by['해외 AMAZON'].amount).toBe(25880);
    expect(by['쿠팡'].amount).toBe(20000);
    expect(by['네이버페이'].memo).toBe('네이버페이 · 3개월');
    expect(by['올리브영']).toMatchObject({ amount: -7000, kind: 'expense' });
    expect(by['메가박스']).toBeUndefined(); expect(by['스타벅스']).toBeUndefined();
    expect(r.items.every((x) => x.card4 === '7012')).toBe(true);
    expect(summarize(r.items)).toMatchObject({ count: 6, expense: 8900 + 25880 + 5000 + 56950 + 20000 - 7000, income: 0 });
  });
  test('카드번호 마스킹: 마스킹 없음·일부 마스킹·숫자 칸 모두 끝 4자리', () => {
    expect(maskCardNo('4049-4700-0662-7012')).toBe('****-7012');
    expect(maskCardNo('4049470006627012')).toBe('****-7012');
    expect(maskCardNo('1234-****-****-5678')).toBe('****-5678');
    expect(maskCardNo('9410 1234 5678 9012')).toBe('****-9012');
    expect(maskCardNo('2026.10.03')).toBe('2026.10.03');
    expect(maskCardNo('30012345')).toBe('30012345'); // 승인번호는 그대로
    expect(maskCardNo('870-452421')).toBe('870-452421');
  });
});

describe('M1 구독 제안 잡음', () => {
  const months = (memo, amount, days, categoryId) => days.map((date) => ({ kind: 'expense', memo, amount, date, categoryId }));
  test('점심·아메리카노·식비·카페는 매달 같아도 제안 안 함', () => {
    expect(detectSubscriptions([
      ...months('점심', 9000, ['2026-08-10', '2026-09-10', '2026-10-10'], 'food'),
      ...months('아메리카노', 4500, ['2026-08-03', '2026-09-03', '2026-10-03'], 'cafe'),
      ...months('동네빵집', 6500, ['2026-08-03', '2026-09-03', '2026-10-03'], 'cafe'),
    ])).toEqual([]);
  });
  test('날짜가 들쭉날쭉하면 제외, 매달 같은 날 즈음 고지서는 2달이면 제안', () => {
    expect(detectSubscriptions(months('헬스장', 50000, ['2026-08-02', '2026-09-20', '2026-10-11'], 'health'))).toEqual([]);
    expect(detectSubscriptions(months('KT 인터넷', 33000, ['2026-09-25', '2026-10-26'], 'telecom'))).toEqual([{ name: 'KT 인터넷', amount: 33000, months: 2, day: 26, categoryId: 'telecom' }]);
    // 말일 결제(28·30·31일)는 같은 주기로 봄
    expect(detectSubscriptions(months('월세', 650000, ['2026-08-31', '2026-09-30', '2026-10-31'], 'housing'))[0]).toMatchObject({ day: 31 });
  });
  test('2달 이상 빠지면 제외', () => {
    expect(detectSubscriptions(months('보험', 30000, ['2026-03-05', '2026-06-05', '2026-10-05'], 'insurance'))).toEqual([]);
  });
});

describe('M2 규칙 제안 글자', () => {
  test('일반어(10월·결제·해외) 빼고 상호만', () => {
    expect(merchantKey('10월 월세')).toBe('월세');
    expect(merchantKey('스타벅스강남R점')).toBe('스타벅스');
    expect(merchantKey('스타벅스 강남R점')).toBe('스타벅스');
    expect(merchantKey('GS25 역삼점')).toBe('GS25');
    expect(merchantKey('해외 AMAZON')).toBe('AMAZON');
    expect(merchantKey('10월')).toBeNull();
    expect(merchantKey('결제')).toBeNull();
  });
  test('이미 같은 규칙이 있으면 묻지 않고, 다른 카테고리 규칙이 있으면 바꿀지 물음', () => {
    const before = { categoryId: 'etc', memo: '스타벅스 강남R점' };
    const after = { categoryId: 'cafe', memo: '스타벅스 강남R점' };
    expect(ruleSuggestion(before, after, [])).toEqual({ key: '스타벅스', existing: undefined });
    expect(ruleSuggestion(before, after, [{ id: 'r', match: '스타벅스', categoryId: 'cafe' }])).toBeNull();
    expect(ruleSuggestion(before, after, [{ id: 'r', match: '스타벅스', categoryId: 'food' }])).toMatchObject({ key: '스타벅스', existing: { id: 'r' } });
    expect(ruleSuggestion(after, after, [])).toBeNull(); // 카테고리 그대로
    expect(ruleSuggestion({ categoryId: 'etc', memo: '10월' }, { categoryId: 'housing', memo: '10월' }, [])).toBeNull();
  });
});

describe('M4 JSON 백업', () => {
  test('규칙·반복·목표·예산·가져오기 기록까지 담고 서버 시각은 뺌', () => {
    const b = buildBackup({
      transactions: [{ id: 't', amount: 1, createdAt: 'x' }], budgets: [{ id: '2026-10', total: 1, byCategory: { food: 1 } }],
      rules: [{ id: 'r', match: '스타벅스', categoryId: 'cafe', updatedAt: 'x' }], recurring: [{ id: 'rec', name: '월세' }],
      goals: [{ id: 'g', name: '여행' }], imports: [{ id: 'imp-a1', count: 3, at: 'x' }],
    }, new Date('2026-10-19T00:00:00Z'));
    for (const k of ['transactions', 'budgets', 'rules', 'recurring', 'goals', 'imports', 'categories', 'accounts']) expect(Array.isArray(b[k])).toBe(true);
    expect(b.version).toBe(2);
    expect(b.budgets[0].byCategory).toEqual({ food: 1 });
    expect(JSON.stringify(b)).not.toMatch(/createdAt|updatedAt|"at"/);
  });
});

describe('M8 키워드 분류', () => {
  const cat = (memo) => classify({ kind: 'expense', memo }).categoryId;
  test.each([['쿠팡이츠', 'food'], ['쿠팡와우', 'telecom'], ['전기자전거', 'transit'], ['동네빵집', 'cafe'], ['STARBUCKS', 'cafe'], ['NETFLIX', 'telecom']])('%s → %s', (m, c) => expect(cat(m)).toBe(c));
  test('KT&G는 통신(KT)이 아님', () => expect(cat('KT&G')).not.toBe('telecom'));
});

describe('낮음', () => {
  test('L2 999/1000은 100%가 아님', () => {
    expect(goalProgress({ target: 1000, saved: 999 }, '2026-10-19').pct).toBe(99);
    expect(goalProgress({ target: 1000, saved: 1000 }, '2026-10-19').pct).toBe(100);
  });
  test("L3 '5,600'·'5,600원'으로 검색", () => {
    const txs = [{ date: '2026-10-03', amount: 5600, kind: 'expense', memo: '스타벅스' }, { date: '2026-10-04', amount: 3200, kind: 'expense', memo: 'GS25' }];
    expect(searchTxs(txs, { q: '5,600' })).toHaveLength(1);
    expect(searchTxs(txs, { q: '5,600원' })).toHaveLength(1);
    expect(searchTxs([{ date: '2026-10-08', amount: -12000, kind: 'expense', memo: '이마트' }], { q: '12,000' })).toHaveLength(1);
  });
  test('L7 조사', () => {
    expect(josa('스타벅스', '은는')).toBe('스타벅스는');
    expect(josa('월세', '을를')).toBe('월세를');
    expect(josa('GS25', '은는')).toBe('GS25는');
    expect(josa('식비', '으로')).toBe('식비로');
    expect(josa('생활', '으로')).toBe('생활로');
    expect(josa('카페·간식', '으로')).toBe('카페·간식으로');
    expect(josa('넷플릭스', '이가')).toBe('넷플릭스가');
    // 따옴표로 감싼 낱말(토스트 문구)
    expect(josa("'쿠팡'", '은는')).toBe("'쿠팡'은");
    expect(josa("'월세'", '은는')).toBe("'월세'는");
  });
  test('L9 건너뛴 줄 사유별 문구(0원·10억 초과)', () => {
    const r = toCandidates([['2026.10.01', 'A', '0', '정상', ''], ['2026.10.01', 'B', '2,000,000,000', '정상', ''], ['날짜?', 'C', '100', '정상', '']], { cols: COLS });
    expect(r.reasons).toEqual({ date: 1, amount: 0, zero: 1, tooBig: 1 });
    expect(skipReasonText(r.reasons)).toBe('날짜를 읽을 수 없는 줄 1개, 0원인 줄 1개, 10억 원이 넘는 줄 1개는 뺐어요.');
    expect(skipReasonText({})).toBe('');
  });
});
